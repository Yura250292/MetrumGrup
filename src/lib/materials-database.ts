/**
 * Materials Database
 * База реальних матеріалів з актуальними цінами для запобігання AI галюцинаціям
 */

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  priceUAH: number;
  brand?: string;
  specifications?: string;
  source?: string; // Епіцентр, Нова Лінія, тощо
  sourceURL?: string;
  lastUpdated: string; // ISO date
  notes?: string;
}

/**
 * База матеріалів (початкова версія - топ 100 позицій)
 * TODO: Розширити до 500+ позицій
 * TODO: Додати API для оновлення цін з магазинів
 */
export const MATERIALS_DB: Material[] = [
  // === ФУНДАМЕНТ ===
  {
    id: 'cement_ppc_500',
    name: 'Цемент ПЦ II/Б-Ш-500 (50 кг)',
    category: 'foundation',
    unit: 'мішок',
    priceUAH: 245,
    brand: 'Ivano-Frankivskcement',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'sand_washed',
    name: 'Пісок мийний (навалом)',
    category: 'foundation',
    unit: 'т',
    priceUAH: 850,
    source: 'Місцевий кар\'єр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'crushed_stone_520',
    name: 'Щебінь фракція 5-20',
    category: 'foundation',
    unit: 'т',
    priceUAH: 920,
    source: 'Місцевий кар\'єр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'rebar_12mm',
    name: 'Арматура А500С діаметр 12 мм',
    category: 'foundation',
    unit: 'т',
    priceUAH: 28500,
    specifications: 'A500C, рифлена',
    source: 'Метбаза',
    lastUpdated: '2026-04-01',
  },

  // === СТІНИ ===
  {
    id: 'gasblock_aeroc_300',
    name: 'Газоблок AEROC D400 300х200х600',
    category: 'walls',
    unit: 'шт',
    priceUAH: 89,
    brand: 'AEROC',
    specifications: 'Клас міцності B2.5, морозостійкість F50',
    source: 'Епіцентр',
    sourceURL: 'https://epicentrk.ua/ua/shop/gazoblok-aeroc',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'gasblock_aeroc_200',
    name: 'Газоблок AEROC D400 200х200х600 (перегородка)',
    category: 'walls',
    unit: 'шт',
    priceUAH: 62,
    brand: 'AEROC',
    specifications: 'Для перегородок',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'brick_ceramic_m150',
    name: 'Цегла керамічна М-150 одинарна',
    category: 'walls',
    unit: 'шт',
    priceUAH: 14.5,
    specifications: 'Розмір 250х120х65 мм',
    source: 'Будмайстер',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'polystyrene_100mm',
    name: 'Пінопласт ПСБ-С-25 (100 мм)',
    category: 'walls',
    unit: 'м²',
    priceUAH: 195,
    specifications: 'Щільність 25 кг/м³',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'mineral_wool_100mm',
    name: 'Мінеральна вата Роквул 100 мм',
    category: 'walls',
    unit: 'м²',
    priceUAH: 285,
    brand: 'Rockwool',
    specifications: 'Базальтова вата, щільність 50 кг/м³',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },

  // === ДАХ ===
  {
    id: 'metal_tile_standard',
    name: 'Металочерепиця 0.45 мм',
    category: 'roof',
    unit: 'м²',
    priceUAH: 385,
    brand: 'ArcelorMittal',
    specifications: 'Покриття поліестер, профіль Monterrey',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'soft_tile_shinglas',
    name: 'Бітумна черепиця Shinglas',
    category: 'roof',
    unit: 'м²',
    priceUAH: 485,
    brand: 'Shinglas',
    specifications: 'Двошарова, гарантія 30 років',
    source: 'Нова Лінія',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'osb_12mm',
    name: 'OSB-3 плита 12 мм (2500х1250)',
    category: 'roof',
    unit: 'лист',
    priceUAH: 745,
    specifications: 'Волого стійка, для покрівлі',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'waterproofing_membrane',
    name: 'Гідроізоляційна мембрана Tyvek',
    category: 'roof',
    unit: 'м²',
    priceUAH: 145,
    brand: 'Tyvek',
    specifications: 'Паропроникна, 1.5м ширина',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },

  // === ЕЛЕКТРИКА ===
  {
    id: 'socket_schneider_asfora',
    name: 'Розетка Schneider Electric Asfora (біла)',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 185,
    brand: 'Schneider Electric',
    specifications: 'З заземленням, 16A, IP20',
    source: 'Епіцентр',
    sourceURL: 'https://epicentrk.ua/ua/shop/rozetka-schneider-electric',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'switch_schneider_asfora',
    name: 'Вимикач Schneider Electric Asfora одноклавішний',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 145,
    brand: 'Schneider Electric',
    specifications: '10A, IP20',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'cable_vvg_3x25',
    name: 'Кабель ВВГ-нг 3×2.5 мм²',
    category: 'electrical',
    unit: 'м',
    priceUAH: 42,
    specifications: 'Негорючий, для проводки 220В',
    source: 'Електромаркет',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'cable_vvg_3x15',
    name: 'Кабель ВВГ-нг 3×1.5 мм²',
    category: 'electrical',
    unit: 'м',
    priceUAH: 28,
    specifications: 'Негорючий, для освітлення',
    source: 'Електромаркет',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'junction_box_80',
    name: 'Підрозетник глибокий D68×45 мм',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 12,
    specifications: 'Для бетону/цегли',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'circuit_breaker_16a',
    name: 'Автоматичний вимикач 16A 1P',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 125,
    brand: 'Schneider Electric',
    specifications: 'Характеристика C',
    source: 'Електромаркет',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'led_downlight_12w',
    name: 'Світильник вбудований LED 12W 4000K',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 285,
    specifications: 'Круглий, білий корпус',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },

  // === САНТЕХНІКА ===
  {
    id: 'toilet_cersanit_arteco',
    name: 'Унітаз Cersanit Arteco з бачком',
    category: 'plumbing',
    unit: 'комплект',
    priceUAH: 4850,
    brand: 'Cersanit',
    specifications: 'Компакт, подвійний змив',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'sink_cersanit_60',
    name: 'Умивальник Cersanit 60 см',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 1850,
    brand: 'Cersanit',
    specifications: 'Керамічний, з отвором під змішувач',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'bathtub_150',
    name: 'Ванна акрилова 150×70 см',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 5500,
    specifications: 'Акрил 5 мм',
    source: 'Нова Лінія',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'shower_cabin_90',
    name: 'Душова кабіна 90×90 см',
    category: 'plumbing',
    unit: 'комплект',
    priceUAH: 8500,
    specifications: 'З піддоном, скло 6 мм',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'pipe_pp_20',
    name: 'Труба поліпропіленова PN20 Ø20 мм',
    category: 'plumbing',
    unit: 'м',
    priceUAH: 38,
    specifications: 'Для холодної/гарячої води',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'pipe_pvc_110',
    name: 'Труба каналізаційна ПВХ Ø110 мм',
    category: 'plumbing',
    unit: 'м',
    priceUAH: 145,
    specifications: 'Сіра, довжина 3 м',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },

  // === ОПАЛЕННЯ ===
  {
    id: 'radiator_aluminum_500',
    name: 'Радіатор алюмінієвий 500 мм (1 секція)',
    category: 'heating',
    unit: 'секція',
    priceUAH: 425,
    specifications: 'Теплова потужність 180 Вт',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'boiler_gas_24kw',
    name: 'Котел газовий двоконтурний 24 кВт',
    category: 'heating',
    unit: 'шт',
    priceUAH: 28500,
    brand: 'Ariston',
    specifications: 'Настінний, з електророзпалом',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'underfloor_heating_mat',
    name: 'Мат теплої підлоги 150 Вт/м²',
    category: 'heating',
    unit: 'м²',
    priceUAH: 1850,
    brand: 'Devi',
    specifications: 'Електричний, товщина 3 мм',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },

  // === ВІКНА/ДВЕРІ ===
  {
    id: 'window_plastic_120x140',
    name: 'Вікно металопластикове 1200×1400',
    category: 'windows',
    unit: 'шт',
    priceUAH: 5850,
    brand: 'Rehau',
    specifications: '3-камерний профіль, склопакет 4-16-4',
    source: 'Віконна компанія',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'door_interior_600',
    name: 'Двері міжкімнатні 600×2000 мм',
    category: 'doors',
    unit: 'шт',
    priceUAH: 3500,
    specifications: 'МДФ, з коробкою, без фурнітури',
    source: 'Нова Лінія',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'door_entrance_metal',
    name: 'Двері вхідні металеві 900×2000',
    category: 'doors',
    unit: 'шт',
    priceUAH: 12500,
    specifications: 'Сталь 2 мм, утеплені, 2 замки',
    source: 'Двері-Сервіс',
    lastUpdated: '2026-04-01',
  },

  // === ОЗДОБЛЕННЯ ===
  {
    id: 'gypsum_board_12mm',
    name: 'Гіпсокартон 12.5 мм (2500×1200)',
    category: 'finishing',
    unit: 'лист',
    priceUAH: 285,
    brand: 'Knauf',
    specifications: 'Стандартний (GKB)',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'plaster_rotband',
    name: 'Штукатурка гіпсова Rotband (30 кг)',
    category: 'finishing',
    unit: 'мішок',
    priceUAH: 485,
    brand: 'Knauf',
    specifications: 'Для внутрішніх робіт',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'tile_ceramic_30x60',
    name: 'Плитка керамічна 300×600 мм',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 425,
    specifications: 'Стандарт клас',
    source: 'Плитка Центр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'laminate_33class',
    name: 'Ламінат 33 клас 8 мм',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 485,
    specifications: 'AC4, фаска 4V',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
  {
    id: 'paint_latex_white',
    name: 'Фарба латексна біла 10 л',
    category: 'finishing',
    unit: 'відро',
    priceUAH: 1250,
    brand: 'Sadolin',
    specifications: 'Матова, витрата 6-8 м²/л',
    source: 'Епіцентр',
    lastUpdated: '2026-04-01',
  },
];

/**
 * Пошук матеріалу в базі даних
 */
export function findMaterial(query: string, category?: string): Material | null {
  const normalizedQuery = query.toLowerCase();

  const filtered = category
    ? MATERIALS_DB.filter((m) => m.category === category)
    : MATERIALS_DB;

  // Exact match by name
  let material = filtered.find((m) => m.name.toLowerCase() === normalizedQuery);
  if (material) return material;

  // Partial match by name
  material = filtered.find((m) => m.name.toLowerCase().includes(normalizedQuery));
  if (material) return material;

  // Match by keywords in name
  const keywords = normalizedQuery.split(' ');
  material = filtered.find((m) => {
    const materialName = m.name.toLowerCase();
    return keywords.every((kw) => materialName.includes(kw));
  });

  return material || null;
}

/**
 * Отримати всі матеріали категорії
 */
export function getMaterialsByCategory(category: string): Material[] {
  return MATERIALS_DB.filter((m) => m.category === category);
}

/**
 * Отримати всі категорії
 */
export function getCategories(): string[] {
  return Array.from(new Set(MATERIALS_DB.map((m) => m.category)));
}

/**
 * Генерує промпт для AI з базою матеріалів
 */
export function generateMaterialsContext(categories?: string[]): string {
  const relevantMaterials = categories
    ? MATERIALS_DB.filter((m) => categories.includes(m.category))
    : MATERIALS_DB;

  let context = `\n## БАЗА МАТЕРІАЛІВ З РЕАЛЬНИМИ ЦІНАМИ\n\n`;
  context += `**КРИТИЧНО ВАЖЛИВО:** Використовуй ТІЛЬКИ ці матеріали та ціни! НЕ вигадуй свої!\n\n`;

  const byCategory = relevantMaterials.reduce((acc, material) => {
    if (!acc[material.category]) acc[material.category] = [];
    acc[material.category].push(material);
    return acc;
  }, {} as Record<string, Material[]>);

  Object.entries(byCategory).forEach(([cat, materials]) => {
    context += `### ${cat.toUpperCase()}\n`;
    materials.forEach((m) => {
      context += `- **${m.name}** - ${m.priceUAH} грн/${m.unit}`;
      if (m.brand) context += ` (${m.brand})`;
      if (m.specifications) context += ` - ${m.specifications}`;
      context += `\n`;
    });
    context += `\n`;
  });

  context += `**Якщо потрібен матеріал якого немає в базі - вкажи "ціна уточнюється" і позначку що треба перевірити.**\n\n`;

  return context;
}
