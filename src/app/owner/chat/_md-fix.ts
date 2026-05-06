/**
 * Defensive markdown normalizer — Claude інколи генерує таблиці без \n
 * між рядками (особливо при переписуванні tool result).
 * remark-gfm не зможе їх розпарсити — буде показано pipes літерально.
 *
 * Цей нормалізатор знаходить такі inline-таблиці і вставляє \n перед
 * кожним новим рядком таблиці.
 */

/**
 * Знаходить шаблон `| word | word | |word|` (header → delimiter без \n)
 * і `| word | word | | word |` (data rows без \n) та вставляє \n.
 */
export function fixMarkdownTables(input: string): string {
  if (!input.includes("|")) return input;

  let out = input;

  // 1. Перед delimiter row: `... | |---|...|` → `... |\n|---|...|`
  // Pattern: "|" + whitespace + "|---" → "|\n|---"
  out = out.replace(/\|(\s+)\|---/g, "|\n|---");

  // 2. Після delimiter row: `|---|...:| | word ...` → `|---|...:|\n| word ...`
  // Pattern: "|---|" варіанти + whitespace + "| ${нон-pipe}" → newline
  out = out.replace(/(\|[\s\-:|]+\|)(\s+)\|/g, "$1\n|");

  // 3. Між data rows: `... | | next ... |` → `... |\n| next ... |`
  // Знаходимо випадки де закриваюча pipe (з потенційним числом перед) йде поруч з відкриваючою
  // через пробіли. Це heuristic — застосовуємо тільки якщо вже виявлено таблицю
  // (бо "| |" може бути у звичайному тексті).
  // Робимо повторно бо одна заміна може створити нові пари сусідніх рядків:
  let prev: string;
  let iterations = 0;
  do {
    prev = out;
    // "value | | value" → "value |\n| value"
    out = out.replace(/(\|)\s+(\| [^|\n]+\|)/g, "$1\n$2");
    iterations++;
  } while (out !== prev && iterations < 50);

  return out;
}
