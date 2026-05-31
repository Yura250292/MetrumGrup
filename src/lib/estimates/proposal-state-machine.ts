import type {
  EstimateItemNegotiationState,
  EstimateProposalStatus,
} from "@prisma/client";

/**
 * Pure state-machine for per-line estimate negotiation.
 *
 * Decoupled from Prisma so it can be unit-tested without DB.
 *
 * Side = who is acting now: 'firm' (наш менеджер/інженер) або 'client' (зовнішній замовник
 * по token-link). State transitions encode the back-and-forth торг.
 */

export type NegotiationSide = "firm" | "client";

/** Дії, які може виконати клієнт по конкретному рядку. */
export type ClientAction = "APPROVE" | "REJECT" | "COUNTER";

/** Дії фірми у відповідь на counter клієнта (або фінальне rejection). */
export type FirmAction = "ACCEPT_COUNTER" | "REJECT_COUNTER" | "COUNTER";

/**
 * Канонічна назва події у round (одна на кожну дію будь-якої сторони).
 * PROPOSE — лише round 0 (фірма надсилає кошторис).
 */
export type RoundAction =
  | "PROPOSE"
  | "APPROVE"
  | "REJECT"
  | "COUNTER"
  | "ACCEPT_COUNTER"
  | "REJECT_COUNTER";

/** Стани, у яких рядок вважається terminal (торг завершено по цьому рядку). */
const TERMINAL_STATES: ReadonlySet<EstimateItemNegotiationState> = new Set([
  "CLIENT_APPROVED",
  "CLIENT_REJECTED",
  "FIRM_REJECTED",
  "FINAL",
]);

export function isTerminalState(state: EstimateItemNegotiationState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Помилка валідації переходу — використовується API layer'ом щоб повернути 409.
 * `state` лишається у поточному значенні (без mutation).
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: EstimateItemNegotiationState,
    public readonly side: NegotiationSide,
    public readonly action: ClientAction | FirmAction,
  ) {
    super(
      `Cannot apply ${side}.${action} from state ${from}`,
    );
    this.name = "InvalidTransitionError";
  }
}

/**
 * Розрахунок наступного стану.
 *
 * Не повертає union типу — стан змінюється лише в межах enum, тож якщо перехід
 * заборонений → throw. Це навмисно: бізнес-валідація = виняток, а не silent no-op.
 *
 * Правила:
 *   PENDING               + client.APPROVE  → CLIENT_APPROVED (terminal: FINAL semantic)
 *   PENDING               + client.REJECT   → CLIENT_REJECTED
 *   PENDING               + client.COUNTER  → CLIENT_COUNTERED
 *   CLIENT_COUNTERED      + firm.ACCEPT_COUNTER → CLIENT_APPROVED
 *   CLIENT_COUNTERED      + firm.REJECT_COUNTER → FIRM_REJECTED
 *   CLIENT_COUNTERED      + firm.COUNTER        → FIRM_COUNTERED
 *   FIRM_COUNTERED        + client.APPROVE  → CLIENT_APPROVED
 *   FIRM_COUNTERED        + client.REJECT   → CLIENT_REJECTED
 *   FIRM_COUNTERED        + client.COUNTER  → CLIENT_COUNTERED (loop)
 *   <terminal>            + ANY             → InvalidTransitionError
 */
export function nextItemState(
  from: EstimateItemNegotiationState,
  side: NegotiationSide,
  action: ClientAction | FirmAction,
): EstimateItemNegotiationState {
  if (isTerminalState(from)) {
    throw new InvalidTransitionError(from, side, action);
  }

  if (side === "client") {
    switch (from) {
      case "PENDING":
      case "FIRM_COUNTERED":
        switch (action) {
          case "APPROVE":
            return "CLIENT_APPROVED";
          case "REJECT":
            return "CLIENT_REJECTED";
          case "COUNTER":
            return "CLIENT_COUNTERED";
          default:
            throw new InvalidTransitionError(from, side, action);
        }
      default:
        throw new InvalidTransitionError(from, side, action);
    }
  }

  // side === 'firm'
  if (from !== "CLIENT_COUNTERED") {
    throw new InvalidTransitionError(from, side, action);
  }
  switch (action) {
    case "ACCEPT_COUNTER":
      return "CLIENT_APPROVED";
    case "REJECT_COUNTER":
      return "FIRM_REJECTED";
    case "COUNTER":
      return "FIRM_COUNTERED";
    default:
      throw new InvalidTransitionError(from, side, action);
  }
}

/**
 * Чи інкрементується currentRound на цій дії?
 * COUNTER (з будь-якої сторони) — так. Approve/Reject — ні (термінальні).
 */
export function shouldIncrementRound(action: ClientAction | FirmAction): boolean {
  return action === "COUNTER";
}

/**
 * Канонічна RoundAction з пари (side, action). Розкладає firm.COUNTER на
 * саме `COUNTER` (а не `FIRM_COUNTER`), бо `actorSide` поля достатньо для
 * розрізнення у звітах.
 */
export function toRoundAction(
  side: NegotiationSide,
  action: ClientAction | FirmAction,
): RoundAction {
  return action;
}

export interface ItemStateCounts {
  total: number;
  approved: number;
  rejected: number;
  pending: number; // not yet terminal — включає PENDING, CLIENT_COUNTERED, FIRM_COUNTERED
}

/**
 * Підрахунок лічильників для proposal-level статусу.
 * pending = не-термінальні (PENDING + COUNTERED стани).
 */
export function countItemStates(
  states: EstimateItemNegotiationState[],
): ItemStateCounts {
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  for (const s of states) {
    if (s === "CLIENT_APPROVED") approved++;
    else if (s === "CLIENT_REJECTED" || s === "FIRM_REJECTED") rejected++;
    else pending++;
  }
  return { total: states.length, approved, rejected, pending };
}

/**
 * Derive proposal-level status з агрегованих item-станів і поточного статусу.
 *
 * Правила (від найвищого пріоритету):
 *   - Якщо вже termianl на рівні proposal (FULLY_APPROVED/REJECTED/WITHDRAWN/EXPIRED) → no change.
 *   - 0 items або всі pending = SENT (нічого не торкнули) АБО IN_NEGOTIATION (якщо було торкнуто).
 *   - Усі items FINAL & approved → FULLY_APPROVED
 *   - Усі items FINAL, mix approved+rejected → PARTIALLY_APPROVED
 *   - Усі items FINAL, всі rejected → REJECTED
 *   - Хоч один не FINAL → IN_NEGOTIATION (якщо хоч щось було торкнуто) інакше SENT
 *
 * `anyClientActionYet` — чи був хоч один client action (для розрізнення SENT vs
 * IN_NEGOTIATION коли counts ще без termianl).
 */
export function deriveProposalStatus(
  current: EstimateProposalStatus,
  counts: ItemStateCounts,
  anyClientActionYet: boolean,
): EstimateProposalStatus {
  // Терміналки залишаємо як є.
  if (
    current === "FULLY_APPROVED" ||
    current === "REJECTED" ||
    current === "WITHDRAWN" ||
    current === "EXPIRED"
  ) {
    return current;
  }

  if (counts.total === 0) return current;

  const allTerminal = counts.pending === 0;
  if (allTerminal) {
    if (counts.rejected === 0) return "FULLY_APPROVED";
    if (counts.approved === 0) return "REJECTED";
    return "PARTIALLY_APPROVED";
  }

  return anyClientActionYet ? "IN_NEGOTIATION" : "SENT";
}
