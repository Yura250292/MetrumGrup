import {
  FieldDefSchema,
  FormSchemaZ,
  SubmissionPayloadSchema,
  validateSubmissionAgainstSchema,
} from "../validators";

describe("FieldDefSchema", () => {
  it("accepts a minimal text field", () => {
    const result = FieldDefSchema.safeParse({
      key: "title",
      type: "text",
      label: "Заголовок",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-snake_case key", () => {
    const result = FieldDefSchema.safeParse({
      key: "BadKey",
      type: "text",
      label: "X",
    });
    expect(result.success).toBe(false);
  });

  it("rejects select with empty options", () => {
    const result = FieldDefSchema.safeParse({
      key: "weather",
      type: "select",
      label: "Погода",
      options: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects multiselect without options", () => {
    const result = FieldDefSchema.safeParse({
      key: "tags",
      type: "multiselect",
      label: "Теги",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid regex pattern", () => {
    const result = FieldDefSchema.safeParse({
      key: "phone",
      type: "text",
      label: "Телефон",
      pattern: "(unbalanced",
    });
    expect(result.success).toBe(false);
  });

  it("rejects min > max", () => {
    const result = FieldDefSchema.safeParse({
      key: "qty",
      type: "number",
      label: "К-сть",
      min: 10,
      max: 5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a select with non-empty options", () => {
    const result = FieldDefSchema.safeParse({
      key: "weather",
      type: "select",
      label: "Погода",
      options: [
        { value: "sun", label: "Сонячно" },
        { value: "rain", label: "Дощ" },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("FormSchemaZ", () => {
  it("rejects duplicate keys", () => {
    const result = FormSchemaZ.safeParse({
      fields: [
        { key: "x", type: "text", label: "A" },
        { key: "x", type: "text", label: "B" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects visibleIf referencing unknown field", () => {
    const result = FormSchemaZ.safeParse({
      fields: [
        {
          key: "child",
          type: "text",
          label: "Дитяче",
          visibleIf: { fieldKey: "parent", equals: true },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects visibleIf referencing a later-declared field", () => {
    const result = FormSchemaZ.safeParse({
      fields: [
        {
          key: "child",
          type: "text",
          label: "Дитяче",
          visibleIf: { fieldKey: "parent", equals: true },
        },
        { key: "parent", type: "checkbox", label: "Активувати" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts schema with valid visibleIf order", () => {
    const result = FormSchemaZ.safeParse({
      fields: [
        { key: "parent", type: "checkbox", label: "Активувати" },
        {
          key: "child",
          type: "text",
          label: "Дитяче",
          visibleIf: { fieldKey: "parent", equals: true },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty schema", () => {
    const result = FormSchemaZ.safeParse({ fields: [] });
    expect(result.success).toBe(false);
  });
});

describe("SubmissionPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = SubmissionPayloadSchema.safeParse({
      clientUuid: "11111111-1111-4111-8111-111111111111",
      templateId: "tpl_1",
      templateVersion: 1,
      data: { x: "hello" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID clientUuid", () => {
    const result = SubmissionPayloadSchema.safeParse({
      clientUuid: "not-a-uuid",
      templateId: "tpl_1",
      templateVersion: 1,
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive templateVersion", () => {
    const result = SubmissionPayloadSchema.safeParse({
      clientUuid: "11111111-1111-4111-8111-111111111111",
      templateId: "tpl_1",
      templateVersion: 0,
      data: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("validateSubmissionAgainstSchema", () => {
  const schema = {
    fields: [
      { key: "title", type: "text" as const, label: "Назва", required: true, min: 3 },
      { key: "qty", type: "number" as const, label: "К-сть", min: 1, max: 100 },
      {
        key: "weather",
        type: "select" as const,
        label: "Погода",
        options: [
          { value: "sun", label: "Сонячно" },
          { value: "rain", label: "Дощ" },
        ],
      },
      { key: "signed", type: "signature" as const, label: "Підпис" },
      { key: "loc", type: "gps" as const, label: "GPS" },
      { key: "photos", type: "photo" as const, label: "Фото", multiple: true },
    ],
  };

  it("ok for a valid submission", () => {
    const r = validateSubmissionAgainstSchema(
      {
        title: "Test report",
        qty: 5,
        weather: "sun",
        signed: "data:image/png;base64,AAAA",
        loc: { lat: 50.45, lng: 30.52 },
        photos: ["att_1", "att_2"],
      },
      schema,
    );
    expect(r.ok).toBe(true);
  });

  it("flags missing required", () => {
    const r = validateSubmissionAgainstSchema({ qty: 5 }, schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/Назва/);
  });

  it("flags text too short (min)", () => {
    const r = validateSubmissionAgainstSchema({ title: "ab" }, schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/занадто короткe|Назва/);
  });

  it("flags number out of range", () => {
    const r = validateSubmissionAgainstSchema({ title: "abcdef", qty: 999 }, schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/К-сть/);
  });

  it("flags select value not in options", () => {
    const r = validateSubmissionAgainstSchema(
      { title: "abcdef", weather: "snow" },
      schema,
    );
    expect(r.ok).toBe(false);
  });

  it("flags signature without base64 prefix", () => {
    const r = validateSubmissionAgainstSchema(
      { title: "abcdef", signed: "AAAA" },
      schema,
    );
    expect(r.ok).toBe(false);
  });

  it("flags gps without lat/lng", () => {
    const r = validateSubmissionAgainstSchema(
      { title: "abcdef", loc: "kyiv" as unknown as string },
      schema,
    );
    expect(r.ok).toBe(false);
  });

  it("skips hidden fields (visibleIf=false)", () => {
    const schemaWithVisible = {
      fields: [
        { key: "show_extra", type: "checkbox" as const, label: "Розширене" },
        {
          key: "extra_text",
          type: "text" as const,
          label: "Деталі",
          required: true,
          visibleIf: { fieldKey: "show_extra", equals: true },
        },
      ],
    };
    const r = validateSubmissionAgainstSchema(
      { show_extra: false },
      schemaWithVisible,
    );
    expect(r.ok).toBe(true);
  });
});
