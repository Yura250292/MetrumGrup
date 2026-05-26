/**
 * Безпечний evaluator для inline-формул у числових полях таблиці етапів.
 *
 * Підтримує:
 *  - арифметику: + − × ÷ ^ (степінь)
 *  - дужки: ( )
 *  - десятковий розділник: . або ,
 *  - функції: ROUND(x[,digits]) ROUND2(x) ABS MIN MAX FLOOR CEIL SUM AVG
 *  - константи: PI, E
 *
 * НЕ підтримує: змінні, посилання на інші комірки, рядки. Просто
 * "калькулятор у комірці", без security-ризиків eval/Function.
 *
 * Приклади:
 *   "=2*3"           → 6
 *   "=(100+50)/2"    → 75
 *   "=ROUND(1.236,1)"→ 1.2
 *   "=MIN(5, 3, 8)"  → 3
 *   "=120*1.2"       → 144  (ціна з ПДВ)
 */

type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "ident"; value: string };

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "^") {
      out.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      out.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      out.push({ type: "comma" });
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let dot = c === ".";
      j++;
      while (j < input.length) {
        const cc = input[j];
        if (cc >= "0" && cc <= "9") {
          j++;
          continue;
        }
        if (cc === "." && !dot) {
          dot = true;
          j++;
          continue;
        }
        // Кому НЕ дозволяємо як децимальний розділювач: вона залишається
        // аргумент-сепаратором (MIN(3, 5)). Для українців: писати "3.14".
        // Pre-pass у `tryEvaluateFormula` замінює `,` на `.` тільки у
        // випадках, які не виглядають як аргументи функції.
        break;
      }
      const numStr = input.slice(i, j);
      const n = Number(numStr);
      if (!Number.isFinite(n)) throw new Error("Невалідне число");
      out.push({ type: "num", value: n });
      i = j;
      continue;
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_") {
      let j = i + 1;
      while (j < input.length) {
        const cc = input[j];
        if (
          (cc >= "A" && cc <= "Z") ||
          (cc >= "a" && cc <= "z") ||
          (cc >= "0" && cc <= "9") ||
          cc === "_"
        ) {
          j++;
          continue;
        }
        break;
      }
      out.push({ type: "ident", value: input.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    throw new Error(`Неочікуваний символ: ${c}`);
  }
  return out;
}

const CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
};

const FUNCS: Record<string, (args: number[]) => number> = {
  ROUND: (args) => {
    if (args.length === 0) throw new Error("ROUND() потребує аргумент");
    const digits = args[1] !== undefined ? Math.trunc(args[1]) : 0;
    const f = Math.pow(10, digits);
    return Math.round(args[0] * f) / f;
  },
  ROUND2: (args) => Math.round(args[0] * 100) / 100,
  ABS: (args) => Math.abs(args[0]),
  MIN: (args) => Math.min(...args),
  MAX: (args) => Math.max(...args),
  FLOOR: (args) => Math.floor(args[0]),
  CEIL: (args) => Math.ceil(args[0]),
  SUM: (args) => args.reduce((a, b) => a + b, 0),
  AVG: (args) =>
    args.length === 0 ? 0 : args.reduce((a, b) => a + b, 0) / args.length,
  SQRT: (args) => Math.sqrt(args[0]),
};

class Parser {
  pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  consume(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("Несподіваний кінець виразу");
    return t;
  }
  expect(type: Token["type"]): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Очікувано ${type}, отримано ${t.type}`);
    return t;
  }

  parseExpression(): number {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      this.consume();
      const right = this.parseTerm();
      left = t.value === "+" ? left + right : left - right;
    }
    return left;
  }

  parseTerm(): number {
    let left = this.parsePower();
    while (true) {
      const t = this.peek();
      if (!t || t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      this.consume();
      const right = this.parsePower();
      if (t.value === "*") left = left * right;
      else {
        if (right === 0) throw new Error("Ділення на нуль");
        left = left / right;
      }
    }
    return left;
  }

  parsePower(): number {
    const base = this.parseUnary();
    const t = this.peek();
    if (t && t.type === "op" && t.value === "^") {
      this.consume();
      const exp = this.parsePower(); // правоасоціативна
      return Math.pow(base, exp);
    }
    return base;
  }

  parseUnary(): number {
    const t = this.peek();
    if (t && t.type === "op" && (t.value === "-" || t.value === "+")) {
      this.consume();
      const v = this.parseUnary();
      return t.value === "-" ? -v : v;
    }
    return this.parseAtom();
  }

  parseAtom(): number {
    const t = this.consume();
    if (t.type === "num") return t.value;
    if (t.type === "lparen") {
      const v = this.parseExpression();
      this.expect("rparen");
      return v;
    }
    if (t.type === "ident") {
      // function call?
      const next = this.peek();
      if (next && next.type === "lparen") {
        this.consume();
        const args: number[] = [];
        if (this.peek()?.type !== "rparen") {
          args.push(this.parseExpression());
          while (this.peek()?.type === "comma") {
            this.consume();
            args.push(this.parseExpression());
          }
        }
        this.expect("rparen");
        const fn = FUNCS[t.value];
        if (!fn) throw new Error(`Невідома функція: ${t.value}`);
        return fn(args);
      }
      // constant
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      throw new Error(`Невідомий ідентифікатор: ${t.value}`);
    }
    throw new Error(`Неочікуваний токен: ${t.type}`);
  }
}

/**
 * Парсить і обчислює формулу. Вхід — без префікса "=".
 * Повертає number або кидає Error з людиночитною причиною.
 */
export function evaluateExpression(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Порожній вираз");
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) throw new Error("Немає токенів");
  const parser = new Parser(tokens);
  const result = parser.parseExpression();
  if (parser.pos < tokens.length) {
    throw new Error("Залишилися зайві токени");
  }
  if (!Number.isFinite(result)) throw new Error("Невалідний результат");
  return result;
}

/**
 * Розпізнає рядок як формулу (починається з "=") і обчислює.
 * Якщо не формула — повертає null. Якщо формула невалідна — кидає Error.
 */
export function tryEvaluateFormula(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("=")) return null;
  let expr = trimmed.slice(1);
  // Якщо нема відкриваючої дужки — кому можна тримати як децимальний
  // розділювач ("100*1,2"). При виклику функцій (MIN(3, 5)) — кома
  // лишається аргумент-сепаратором.
  if (!expr.includes("(")) {
    expr = expr.replace(/,/g, ".");
  }
  return evaluateExpression(expr);
}
