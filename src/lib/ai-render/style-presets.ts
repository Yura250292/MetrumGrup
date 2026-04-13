/**
 * Default style presets for AI architectural visualization.
 * Used for seeding the AiStylePreset table.
 */
export const DEFAULT_STYLE_PRESETS = [
  {
    name: "modern_minimalist",
    label: "Сучасний мінімалізм",
    description: "Чисті лінії, скло та бетон, нейтральні кольори",
    category: "exterior",
    prompt:
      "modern minimalist architecture, clean geometric forms, glass and concrete facade, neutral color palette, natural lighting, zen garden, contemporary design",
    negativePrompt:
      "cluttered, ornate, baroque, victorian, old-fashioned, rustic, messy",
    sortOrder: 1,
  },
  {
    name: "scandinavian",
    label: "Скандинавський",
    description: "Світле дерево, білі стіни, затишний мінімалізм",
    category: "interior",
    prompt:
      "scandinavian interior design, light oak wood, white walls, soft textiles, cozy minimalism, hygge atmosphere, large windows, natural daylight",
    negativePrompt:
      "dark, heavy furniture, cluttered, ornate, industrial, neon colors",
    sortOrder: 2,
  },
  {
    name: "industrial_loft",
    label: "Лофт",
    description: "Відкрита цегла, сталь, бетон, лампи Едісона",
    category: "interior",
    prompt:
      "industrial loft style, exposed red brick walls, steel beams, polished concrete floors, edison bulb lighting, open plan, high ceilings, large windows",
    negativePrompt:
      "cozy, traditional, suburban, carpet, wallpaper, ornate moldings",
    sortOrder: 3,
  },
  {
    name: "classic_european",
    label: "Класичний європейський",
    description: "Камінний фасад, симетрія, декоративні деталі",
    category: "exterior",
    prompt:
      "classical european architecture, stone facade, symmetrical design, ornate cornice details, wrought iron balconies, warm golden hour lighting, manicured garden",
    negativePrompt:
      "modern, glass, steel, brutalist, flat roof, minimalist, industrial",
    sortOrder: 4,
  },
  {
    name: "contemporary_villa",
    label: "Сучасна вілла",
    description: "Плоский дах, панорамні вікна, ландшафтний дизайн",
    category: "exterior",
    prompt:
      "contemporary luxury villa, flat roof, infinity pool, floor-to-ceiling windows, white stucco walls, landscaped garden, palm trees, blue sky, golden hour",
    negativePrompt:
      "cramped, urban, industrial, old, rundown, apartment block, dark",
    sortOrder: 5,
  },
  {
    name: "ukrainian_modern",
    label: "Український модерн",
    description: "Традиційні елементи, натуральні матеріали, теплі тони",
    category: "exterior",
    prompt:
      "modern ukrainian architecture, traditional elements reimagined, natural stone and wood, warm earth tones, pitched roof with modern twist, garden with native plants",
    negativePrompt:
      "cold, industrial, glass tower, brutalist, concrete jungle, neon",
    sortOrder: 6,
  },
  {
    name: "office_modern",
    label: "Сучасний офіс",
    description: "Скляні перегородки, ергономічні меблі, біофільний дизайн",
    category: "interior",
    prompt:
      "modern office space, open plan layout, glass partitions, ergonomic furniture, biophilic design with indoor plants, natural lighting, neutral tones, clean desk setup",
    negativePrompt:
      "cluttered, cubicles, fluorescent lighting, old computers, dark, windowless",
    sortOrder: 7,
  },
  {
    name: "warm_residential",
    label: "Тепла квартира",
    description: "М'яке освітлення, природні текстури, земляні відтінки",
    category: "interior",
    prompt:
      "warm residential interior, soft ambient lighting, natural textures, earth tones, comfortable living room, wooden accents, linen textiles, cozy atmosphere",
    negativePrompt:
      "cold, sterile, hospital-like, industrial, concrete, neon, harsh lighting",
    sortOrder: 8,
  },
] as const;
