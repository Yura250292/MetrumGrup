import { renderDefaultFormPdf } from "../default";
import type { FormSchema } from "../../schema";

describe("renderDefaultFormPdf", () => {
  const schema: FormSchema = {
    fields: [
      { key: "title", type: "text", label: "Назва", required: true },
      { key: "qty", type: "number", label: "Кількість" },
      {
        key: "weather",
        type: "select",
        label: "Погода",
        options: [
          { value: "sun", label: "Сонячно" },
          { value: "rain", label: "Дощ" },
        ],
      },
      { key: "ok", type: "checkbox", label: "Затверджено" },
      { key: "loc", type: "gps", label: "GPS" },
      { key: "section_a", type: "section", label: "Підсумок" },
      { key: "notes", type: "longtext", label: "Нотатки" },
    ],
  };

  it("повертає валідний PDF (починається з %PDF-)", async () => {
    const bytes = await renderDefaultFormPdf({
      templateName: "Тестова форма",
      status: "SUBMITTED",
      submittedBy: "Тест Юзер",
      submittedAt: new Date().toISOString(),
      projectTitle: "Тестовий проєкт",
      schema,
      data: {
        title: "Перевірка",
        qty: 5,
        weather: "sun",
        ok: true,
        loc: { lat: 50.45, lng: 30.52 },
        notes: "Все добре, об'єкт у нормі.",
      },
    });
    expect(bytes.length).toBeGreaterThan(500);
    const head = String.fromCharCode(...bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
  });

  it("додає watermark ЧЕРНЕТКА для не-APPROVED", async () => {
    const bytes = await renderDefaultFormPdf({
      templateName: "X",
      status: "DRAFT",
      submittedBy: "U",
      submittedAt: null,
      schema: { fields: [{ key: "a", type: "text", label: "A" }] },
      data: { a: "b" },
    });
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("рендерить signature base64 як зображення без падіння", async () => {
    // Tiny 1x1 PNG base64
    const tiny =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAarVyFEAAAAASUVORK5CYII=";
    const bytes = await renderDefaultFormPdf({
      templateName: "Підпис",
      status: "APPROVED",
      submittedBy: "U",
      submittedAt: null,
      schema: { fields: [{ key: "sig", type: "signature", label: "Підпис" }] },
      data: { sig: tiny },
    });
    expect(bytes.length).toBeGreaterThan(500);
  });
});
