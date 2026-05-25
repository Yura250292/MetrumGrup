import type { DocumentPrompt } from "./types";

export const invoicePrompt: DocumentPrompt = {
  type: "INVOICE",
  prompt: `Ти асистент бухгалтерії будівельної компанії в Україні. Перед тобою скан/PDF рахунку-фактури від постачальника.

Витягни структуровані дані та поверни СТРОГО валідний JSON (без markdown-обгортки, без коментарів) такої форми:

{
  "counterparty": {
    "name":   "повна назва постачальника як у документі",
    "edrpou": "ЄДРПОУ (8 цифр для юр.осіб або 10 для ФОП) або null",
    "iban":   "IBAN з документа або null",
    "taxId":  "ІПН/податковий номер або null"
  },
  "project": {
    "keyword": "якщо у документі згадано об'єкт/проект — основні ключові слова",
    "address": "адреса об'єкта якщо є"
  },
  "amountTotal":   "повна сума до сплати як number (без валюти)",
  "amountVat":     "сума ПДВ як number або null",
  "currency":      "UAH | USD | EUR (default UAH)",
  "documentDate":  "дата документа у форматі YYYY-MM-DD",
  "documentNumber":"номер документа (як у документі)",
  "paymentTermsDays": "термін оплати у днях як number або null",
  "items": [
    { "name": "назва позиції", "qty": number, "unit": "шт/м2/т/...", "price": number, "total": number }
  ],
  "fieldConfidence": {
    "counterparty": 0..1,
    "amountTotal":  0..1,
    "amountVat":    0..1,
    "documentDate": 0..1,
    "documentNumber": 0..1,
    "items":        0..1
  }
}

ПРАВИЛА:
- Якщо поле НЕ знайдене — постав null (а не вигадуй).
- ЄДРПОУ перевір: рівно 8 цифр для юр.осіб або рівно 10 для ФОП. Якщо у документі видно інше — постав null і знизь confidence.
- amountTotal та amountVat — числа з крапкою-роздільником. БЕЗ пробілів, валюти, %.
- documentDate завжди ISO (YYYY-MM-DD). Якщо у документі "12.03.2026" → "2026-03-12".
- fieldConfidence — об'єктивна впевненість 0..1 для кожного поля: 1.0 якщо чітко видно текст; 0.5 якщо здогадка; 0.0 якщо немає або нерозбірливо.
- НЕ обертай JSON у markdown-блок \`\`\`. Поверни виключно сирий JSON.`,
};
