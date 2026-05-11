/**
 * Supplier resolver — мапить назву постачальника, що AI витягнув з тексту/чека,
 * на існуючий рядок Counterparty у scope активної фірми.
 *
 * Стратегія (в порядку спадання впевненості):
 *   1. Точне співпадіння за нормалізованою назвою (lower + trim + collapse spaces).
 *   2. Точне співпадіння за EDRPOU/RNOKPP (якщо AI його знайшов).
 *   3. Substring match (raw містить ім'я кандидата або навпаки), мін. 4 символи.
 *   4. Levenshtein-distance < 20% довжини імені (fuzzy для friction-free типу
 *      "Будхата" vs "БудХата").
 *
 * Якщо нічого не змаппилось — повертаємо raw-текст у `supplierGuess` для UI prompt
 * (chip "AI запропонував: Будхата" + кнопка "Створити").
 *
 * Multi-firm: список кандидатів обмежується firmId (Counterparty isolated per firm).
 */
import { distance } from "fastest-levenshtein";
import { prisma } from "@/lib/prisma";

export type SupplierResolveResult = {
  counterpartyId: string | null;
  /// Зберігаємо raw-текст лише якщо counterpartyId не зміг змаппитись —
  /// UI використовує його для пропозиції створити нового.
  supplierGuess: string | null;
  matchedBy?: "name-exact" | "edrpou" | "substring" | "levenshtein";
  matchScore?: number;
};

function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function digitsOnly(raw: string | null | undefined): string {
  return raw ? raw.replace(/\D+/g, "") : "";
}

const MIN_SUBSTRING_LEN = 4;
const FUZZY_THRESHOLD = 0.2;

/**
 * Resolve по списку кандидатів. Кандидати — Counterparty з firmId-scope, role
 * SUPPLIER (інші ролі ми сюди не ставимо, бо foreman-звіт = постачальник).
 *
 * Якщо guess null/empty — повертаємо null без read-у БД (швидкий шлях).
 */
export async function resolveSupplier(args: {
  firmId: string | null | undefined;
  guess: string | null | undefined;
  /// Опційно: ЄДРПОУ/РНОКПП якщо AI зміг витягти з чека — підвищує точність до 100%.
  edrpouHint?: string | null;
}): Promise<SupplierResolveResult> {
  const guess = (args.guess ?? "").trim();
  if (!guess && !args.edrpouHint) {
    return { counterpartyId: null, supplierGuess: null };
  }

  const candidates = await prisma.counterparty.findMany({
    where: {
      isActive: true,
      ...(args.firmId
        ? { OR: [{ firmId: args.firmId }, { firmId: null }] }
        : {}),
      // Не обмежуємось `roles has SUPPLIER` — counterparty може бути ще не позначений
      // через backfill, але вже використовується. Match по імені все одно знайде.
    },
    select: { id: true, name: true, edrpou: true, taxId: true },
  });

  if (candidates.length === 0) {
    return {
      counterpartyId: null,
      supplierGuess: guess || null,
    };
  }

  // 1. EDRPOU match — найвища впевненість.
  const edrpouHint = digitsOnly(args.edrpouHint);
  if (edrpouHint.length >= 8) {
    const byEdrpou = candidates.find(
      (c) =>
        digitsOnly(c.edrpou) === edrpouHint || digitsOnly(c.taxId) === edrpouHint,
    );
    if (byEdrpou) {
      return {
        counterpartyId: byEdrpou.id,
        supplierGuess: null,
        matchedBy: "edrpou",
        matchScore: 1,
      };
    }
  }

  if (!guess) {
    return { counterpartyId: null, supplierGuess: null };
  }

  const guessNorm = normalize(guess);

  // 2. Exact normalized name match.
  const exact = candidates.find((c) => normalize(c.name) === guessNorm);
  if (exact) {
    return {
      counterpartyId: exact.id,
      supplierGuess: null,
      matchedBy: "name-exact",
      matchScore: 1,
    };
  }

  // 3. Substring match (мінімум 4 символи з обох боків).
  if (guessNorm.length >= MIN_SUBSTRING_LEN) {
    const subMatch = candidates.find((c) => {
      const cName = normalize(c.name);
      if (cName.length < MIN_SUBSTRING_LEN) return false;
      return cName.includes(guessNorm) || guessNorm.includes(cName);
    });
    if (subMatch) {
      return {
        counterpartyId: subMatch.id,
        supplierGuess: null,
        matchedBy: "substring",
        matchScore: 0.8,
      };
    }
  }

  // 4. Fuzzy (Levenshtein) — толерантно до друкарок/регістру/розкладки.
  let bestId: string | null = null;
  let bestScore = 1; // distance/maxLen — менше = краще
  for (const c of candidates) {
    const cNorm = normalize(c.name);
    if (cNorm.length === 0) continue;
    const maxLen = Math.max(cNorm.length, guessNorm.length);
    if (maxLen === 0) continue;
    const dist = distance(cNorm, guessNorm);
    const norm = dist / maxLen;
    if (norm < bestScore) {
      bestScore = norm;
      bestId = c.id;
    }
  }
  if (bestId && bestScore < FUZZY_THRESHOLD) {
    return {
      counterpartyId: bestId,
      supplierGuess: null,
      matchedBy: "levenshtein",
      matchScore: 1 - bestScore,
    };
  }

  // Не знайшли — лишаємо raw текст для UI prompt.
  return { counterpartyId: null, supplierGuess: guess };
}

/**
 * Bulk-version: коли треба змапити кілька items одного report-у. Один прохід по БД,
 * потім in-memory match для кожного guess. Дешевше за N окремих викликів.
 */
export async function resolveSuppliersBulk(args: {
  firmId: string | null | undefined;
  guesses: Array<{ guess: string | null | undefined; edrpouHint?: string | null }>;
}): Promise<SupplierResolveResult[]> {
  if (args.guesses.length === 0) return [];

  const candidates = await prisma.counterparty.findMany({
    where: {
      isActive: true,
      ...(args.firmId
        ? { OR: [{ firmId: args.firmId }, { firmId: null }] }
        : {}),
    },
    select: { id: true, name: true, edrpou: true, taxId: true },
  });

  return args.guesses.map((g) => {
    const guess = (g.guess ?? "").trim();
    const edrpouHint = digitsOnly(g.edrpouHint);

    if (!guess && !edrpouHint) {
      return { counterpartyId: null, supplierGuess: null };
    }

    if (edrpouHint.length >= 8) {
      const byEdrpou = candidates.find(
        (c) =>
          digitsOnly(c.edrpou) === edrpouHint ||
          digitsOnly(c.taxId) === edrpouHint,
      );
      if (byEdrpou) {
        return {
          counterpartyId: byEdrpou.id,
          supplierGuess: null,
          matchedBy: "edrpou",
          matchScore: 1,
        };
      }
    }

    if (!guess) return { counterpartyId: null, supplierGuess: null };

    const guessNorm = normalize(guess);

    const exact = candidates.find((c) => normalize(c.name) === guessNorm);
    if (exact) {
      return {
        counterpartyId: exact.id,
        supplierGuess: null,
        matchedBy: "name-exact",
        matchScore: 1,
      };
    }

    if (guessNorm.length >= MIN_SUBSTRING_LEN) {
      const subMatch = candidates.find((c) => {
        const cName = normalize(c.name);
        if (cName.length < MIN_SUBSTRING_LEN) return false;
        return cName.includes(guessNorm) || guessNorm.includes(cName);
      });
      if (subMatch) {
        return {
          counterpartyId: subMatch.id,
          supplierGuess: null,
          matchedBy: "substring",
          matchScore: 0.8,
        };
      }
    }

    let bestId: string | null = null;
    let bestScore = 1;
    for (const c of candidates) {
      const cNorm = normalize(c.name);
      if (cNorm.length === 0) continue;
      const maxLen = Math.max(cNorm.length, guessNorm.length);
      if (maxLen === 0) continue;
      const dist = distance(cNorm, guessNorm);
      const norm = dist / maxLen;
      if (norm < bestScore) {
        bestScore = norm;
        bestId = c.id;
      }
    }
    if (bestId && bestScore < FUZZY_THRESHOLD) {
      return {
        counterpartyId: bestId,
        supplierGuess: null,
        matchedBy: "levenshtein",
        matchScore: 1 - bestScore,
      };
    }

    return { counterpartyId: null, supplierGuess: guess };
  });
}
