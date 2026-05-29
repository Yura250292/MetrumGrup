import { generateAccessToken, isValidTokenShape } from "@/lib/procurement/tokens";

/**
 * Wrapper над procurement token helpers — спеціалізований API для
 * EstimateProposal.accessToken. Зараз ділимо реалізацію, бо обмеження ті самі
 * (256 біт base64url, anti-enum фільтр). Якщо колись треба буде розрізнити
 * (напр. shorter token для клієнтського UX) — змінюємо тут, виклики public-route
 * не торкаємо.
 */

export function generateProposalToken(): string {
  return generateAccessToken();
}

export function isValidProposalTokenShape(
  token: string | null | undefined,
): boolean {
  return isValidTokenShape(token);
}
