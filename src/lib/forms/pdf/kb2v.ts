/**
 * КБ-2в PDF layout.
 *
 * ⚠️ ВАЖЛИВО: офіційний layout за наказом Мінрегіону №65 ще не передано
 * (Open Question у плані). Поточна реалізація = "close-but-flagged":
 * семантичний рендер з шапкою КБ-2в + табличною секцією, але БЕЗ
 * пікель-перфект відповідності офіційному бланку.
 *
 * Після отримання референсу: переписати координати + шрифти + рамки.
 */

import { renderDefaultFormPdf, type PdfRenderInput } from "./default";

export async function renderKb2vFormPdf(input: PdfRenderInput): Promise<Uint8Array> {
  // First cut — використовуємо default layout з префіксом у назві.
  // TODO(KB-2в pixel-perfect): окремий layout після отримання DOCX/PDF
  // референсу з наказу Мінрегіону №65.
  return renderDefaultFormPdf({
    ...input,
    templateName: `АКТ КБ-2в — ${input.templateName}`,
  });
}
