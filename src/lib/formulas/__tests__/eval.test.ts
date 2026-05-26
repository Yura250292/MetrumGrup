import { evaluateExpression, tryEvaluateFormula } from "../eval";

describe("evaluateExpression", () => {
  test("числа", () => {
    expect(evaluateExpression("42")).toBe(42);
    expect(evaluateExpression("3.14")).toBe(3.14);
  });

  test("базова арифметика", () => {
    expect(evaluateExpression("2+3")).toBe(5);
    expect(evaluateExpression("10-4")).toBe(6);
    expect(evaluateExpression("6*7")).toBe(42);
    expect(evaluateExpression("20/4")).toBe(5);
  });

  test("пріоритет операторів", () => {
    expect(evaluateExpression("2+3*4")).toBe(14);
    expect(evaluateExpression("(2+3)*4")).toBe(20);
    expect(evaluateExpression("2*3+4*5")).toBe(26);
  });

  test("степінь правоасоціативний", () => {
    expect(evaluateExpression("2^3")).toBe(8);
    expect(evaluateExpression("2^2^3")).toBe(256); // 2^(2^3) = 2^8 = 256
  });

  test("унарний мінус", () => {
    expect(evaluateExpression("-5")).toBe(-5);
    expect(evaluateExpression("-(2+3)")).toBe(-5);
    expect(evaluateExpression("10*-2")).toBe(-20);
  });

  test("функції", () => {
    expect(evaluateExpression("ROUND(1.236, 2)")).toBeCloseTo(1.24, 5);
    expect(evaluateExpression("ROUND(1.236, 0)")).toBe(1);
    expect(evaluateExpression("ROUND2(1.236)")).toBeCloseTo(1.24, 5);
    expect(evaluateExpression("MIN(3, 5, 1, 7)")).toBe(1);
    expect(evaluateExpression("MAX(3, 5, 1, 7)")).toBe(7);
    expect(evaluateExpression("ABS(-5)")).toBe(5);
    expect(evaluateExpression("FLOOR(3.7)")).toBe(3);
    expect(evaluateExpression("CEIL(3.1)")).toBe(4);
    expect(evaluateExpression("SUM(1,2,3,4)")).toBe(10);
    expect(evaluateExpression("AVG(2,4,6)")).toBe(4);
  });

  test("константи", () => {
    expect(evaluateExpression("PI")).toBeCloseTo(Math.PI, 10);
    expect(evaluateExpression("E")).toBeCloseTo(Math.E, 10);
  });

  test("реалістичні кейси", () => {
    expect(evaluateExpression("120*1.2")).toBe(144); // ПДВ
    expect(evaluateExpression("1000*0.8")).toBe(800); // знижка
    expect(evaluateExpression("(50+30)/2")).toBe(40);
    expect(evaluateExpression("ROUND(123.456 * 1.2, 2)")).toBeCloseTo(148.15, 2);
  });

  test("ділення на нуль кидає помилку", () => {
    expect(() => evaluateExpression("5/0")).toThrow("Ділення на нуль");
  });

  test("незакрита дужка", () => {
    expect(() => evaluateExpression("(1+2")).toThrow();
  });

  test("невідома функція", () => {
    expect(() => evaluateExpression("FOO(1)")).toThrow("Невідома функція: FOO");
  });

  test("невідомий ідентифікатор", () => {
    expect(() => evaluateExpression("FOO")).toThrow();
  });
});

describe("tryEvaluateFormula", () => {
  test("повертає null якщо не починається з =", () => {
    expect(tryEvaluateFormula("100")).toBeNull();
    expect(tryEvaluateFormula("2+3")).toBeNull();
    expect(tryEvaluateFormula("")).toBeNull();
  });

  test("обчислює якщо починається з =", () => {
    expect(tryEvaluateFormula("=100*1.2")).toBe(120);
    expect(tryEvaluateFormula("=ROUND(99.9)")).toBe(100);
    expect(tryEvaluateFormula(" =5+5 ")).toBe(10);
  });

  test("укр-децимальна кома працює без функцій", () => {
    expect(tryEvaluateFormula("=3,14")).toBeCloseTo(3.14, 5);
    expect(tryEvaluateFormula("=100*1,2")).toBe(120);
  });

  test("кидає помилку для невалідної формули", () => {
    expect(() => tryEvaluateFormula("=BAD(")).toThrow();
  });
});
