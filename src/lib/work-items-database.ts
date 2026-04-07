/**
 * Work Items Database - База робіт з актуальними цінами
 * Монтаж, укладання, штукатурка, електрика, сантехніка і т.д.
 */

export interface WorkItem {
  id: string;
  name: string;
  category: string;
  unit: string; // м², м³, м.п., шт, точка
  priceUAH: number; // Ціна за одиницю
  laborOnly: boolean; // Тільки робота (без матеріалів)
  description?: string;
  includes?: string; // Що входить в роботу
  source?: string;
  lastUpdated: string;
}

/**
 * База робіт (початкова версія - ТОП 100 позицій)
 * Джерело: середні ринкові ціни України 2026
 */
export const WORK_ITEMS_DB: WorkItem[] = [
  // === ФУНДАМЕНТ ===
  {
    id: 'earthworks_excavation',
    name: 'Риття котловану екскаватором',
    category: 'foundation',
    unit: 'м³',
    priceUAH: 180,
    laborOnly: false,
    includes: 'Робота екскаватора + вивіз ґрунту',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'earthworks_manual',
    name: 'Риття траншей вручну',
    category: 'foundation',
    unit: 'м³',
    priceUAH: 450,
    laborOnly: true,
    includes: 'Ручна копка, вирівнювання',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'formwork_foundation',
    name: 'Влаштування опалубки фундаменту',
    category: 'foundation',
    unit: 'м²',
    priceUAH: 220,
    laborOnly: true,
    includes: 'Монтаж та демонтаж дерев\'яної опалубки',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'rebar_installation',
    name: 'В\'язка арматурного каркасу',
    category: 'foundation',
    unit: 'т',
    priceUAH: 8500,
    laborOnly: true,
    includes: 'Різка, гнуття, в\'язка арматури',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'concrete_pouring',
    name: 'Заливка бетону з бетононасосу',
    category: 'foundation',
    unit: 'м³',
    priceUAH: 850,
    laborOnly: false,
    includes: 'Подача бетононасосом + укладання + вібрування',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'waterproofing_foundation',
    name: 'Гідроізоляція фундаменту рулонна',
    category: 'foundation',
    unit: 'м²',
    priceUAH: 185,
    laborOnly: true,
    includes: 'Підготовка основи + укладання рулонної гідроізоляції',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === СТІНИ ===
  {
    id: 'gasblock_laying',
    name: 'Кладка стін з газоблоку на клей',
    category: 'walls',
    unit: 'м³',
    priceUAH: 1850,
    laborOnly: true,
    description: 'Укладання газобетонних блоків з армуванням',
    includes: 'Кладка + армування кожен 4-й ряд',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'brick_laying',
    name: 'Кладка цегли на розчин',
    category: 'walls',
    unit: 'м³',
    priceUAH: 3200,
    laborOnly: true,
    includes: 'Кладка в 1.5-2 цеглини з перев\'язкою',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'wall_insulation_external',
    name: 'Утеплення стін пінопластом (мокрий фасад)',
    category: 'walls',
    unit: 'м²',
    priceUAH: 380,
    laborOnly: true,
    includes: 'Монтаж пінопласту + дюбелі + сітка + грунт',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ДАХ ===
  {
    id: 'roof_framing',
    name: 'Монтаж дерев\'яної стропильної системи',
    category: 'roof',
    unit: 'м²',
    priceUAH: 520,
    laborOnly: true,
    includes: 'Монтаж стропил, обрешітки, контробрешітки',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'roof_metal_tile',
    name: 'Монтаж металочерепиці',
    category: 'roof',
    unit: 'м²',
    priceUAH: 180,
    laborOnly: true,
    includes: 'Укладання металочерепиці + кріплення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'roof_waterproofing',
    name: 'Монтаж гідроізоляційної мембрани',
    category: 'roof',
    unit: 'м²',
    priceUAH: 75,
    laborOnly: true,
    includes: 'Настил плівки з нахлестом + проклейка стиків',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'gutters_installation',
    name: 'Монтаж водостічної системи',
    category: 'roof',
    unit: 'м.п.',
    priceUAH: 220,
    laborOnly: true,
    includes: 'Монтаж ринв + труб + кріплення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ЕЛЕКТРИКА ===
  {
    id: 'electrical_wiring',
    name: 'Прокладка електропроводки в стінах',
    category: 'electrical',
    unit: 'м.п.',
    priceUAH: 45,
    laborOnly: true,
    includes: 'Штробління + укладання кабелю + закладення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'outlet_installation',
    name: 'Встановлення розетки',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 180,
    laborOnly: true,
    includes: 'Монтаж підрозетника + підключення + розетка',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'switch_installation',
    name: 'Встановлення вимикача',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 160,
    laborOnly: true,
    includes: 'Монтаж підрозетника + підключення + вимикач',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'light_fixture_installation',
    name: 'Встановлення світильника',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 280,
    laborOnly: true,
    includes: 'Підключення світильника + монтаж',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'electrical_panel',
    name: 'Монтаж електрощита (до 24 модулів)',
    category: 'electrical',
    unit: 'шт',
    priceUAH: 2800,
    laborOnly: true,
    includes: 'Встановлення щита + монтаж автоматів + УЗО + підключення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === САНТЕХНІКА ===
  {
    id: 'water_pipes_polypropylene',
    name: 'Монтаж труб водопостачання (поліпропілен)',
    category: 'plumbing',
    unit: 'м.п.',
    priceUAH: 180,
    laborOnly: true,
    includes: 'Різка, зварювання, монтаж труб ø20-32мм',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'sewage_pipes',
    name: 'Монтаж каналізаційних труб ø50-110',
    category: 'plumbing',
    unit: 'м.п.',
    priceUAH: 220,
    laborOnly: true,
    includes: 'Монтаж труб ПВХ + фітинги + кріплення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'toilet_installation',
    name: 'Встановлення унітазу',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 850,
    laborOnly: true,
    includes: 'Монтаж унітазу + підключення води + каналізація',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'sink_installation',
    name: 'Встановлення умивальника',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 680,
    laborOnly: true,
    includes: 'Монтаж умивальника + змішувач + сифон',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'bathtub_installation',
    name: 'Встановлення ванни',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 1200,
    laborOnly: true,
    includes: 'Монтаж ванни + ніжки + підключення + сифон',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'shower_cabin_installation',
    name: 'Встановлення душової кабіни',
    category: 'plumbing',
    unit: 'шт',
    priceUAH: 1500,
    laborOnly: true,
    includes: 'Збірка + монтаж + підключення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ОПАЛЕННЯ ===
  {
    id: 'radiator_installation',
    name: 'Встановлення радіатора опалення',
    category: 'heating',
    unit: 'шт',
    priceUAH: 850,
    laborOnly: true,
    includes: 'Монтаж радіатора + кронштейни + кран Маєвського + підключення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'underfloor_heating',
    name: 'Монтаж теплої підлоги (водяна)',
    category: 'heating',
    unit: 'м²',
    priceUAH: 380,
    laborOnly: true,
    includes: 'Укладання труб + колектор + підключення',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'boiler_installation',
    name: 'Встановлення газового котла',
    category: 'heating',
    unit: 'шт',
    priceUAH: 4500,
    laborOnly: true,
    includes: 'Монтаж котла + димохід + підключення газу + води',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ВІКНА/ДВЕРІ ===
  {
    id: 'window_installation',
    name: 'Встановлення металопластикового вікна',
    category: 'windows',
    unit: 'м²',
    priceUAH: 580,
    laborOnly: true,
    includes: 'Монтаж вікна + відлив + підвіконня + відкоси',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'door_installation_interior',
    name: 'Встановлення міжкімнатних дверей',
    category: 'doors',
    unit: 'шт',
    priceUAH: 1200,
    laborOnly: true,
    includes: 'Монтаж коробки + двері + фурнітура + наличники',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'door_installation_entrance',
    name: 'Встановлення вхідних дверей',
    category: 'doors',
    unit: 'шт',
    priceUAH: 2200,
    laborOnly: true,
    includes: 'Монтаж коробки + двері + замки + відкоси',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ОЗДОБЛЕННЯ ===
  {
    id: 'plastering_walls',
    name: 'Штукатурка стін (механізована)',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 180,
    laborOnly: true,
    includes: 'Нанесення штукатурки машинним способом + маяки',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'plastering_walls_manual',
    name: 'Штукатурка стін (ручна)',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 280,
    laborOnly: true,
    includes: 'Ручна штукатурка + маяки + вирівнювання',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'wall_leveling',
    name: 'Шпаклювання стін під фарбування',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 150,
    laborOnly: true,
    includes: 'Шпаклювання в 2 шари + шліфування',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'wall_painting',
    name: 'Фарбування стін',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 85,
    laborOnly: true,
    includes: 'Грунтування + фарбування в 2 шари',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'wallpaper_installation',
    name: 'Поклейка шпалер',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 120,
    laborOnly: true,
    includes: 'Підготовка + поклейка звичайних шпалер',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'tile_installation_floor',
    name: 'Укладання плитки на підлогу',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 380,
    laborOnly: true,
    includes: 'Укладання плитки + затирка швів',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'tile_installation_wall',
    name: 'Укладання плитки на стіни',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 450,
    laborOnly: true,
    includes: 'Укладання плитки + затирка швів',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'laminate_installation',
    name: 'Укладання ламінату',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 180,
    laborOnly: true,
    includes: 'Укладання ламінату + підкладка + плінтус',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'parquet_installation',
    name: 'Укладання паркетної дошки',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 220,
    laborOnly: true,
    includes: 'Укладання паркету + підкладка + плінтус',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'screed_floor',
    name: 'Влаштування стяжки підлоги',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 220,
    laborOnly: true,
    includes: 'Напівсуха стяжка товщиною 50мм + маяки',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'ceiling_drywall',
    name: 'Монтаж підвісної стелі з гіпсокартону',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 320,
    laborOnly: true,
    includes: 'Каркас + ГКЛ + шпаклювання стиків',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'ceiling_painting',
    name: 'Фарбування стелі',
    category: 'finishing',
    unit: 'м²',
    priceUAH: 90,
    laborOnly: true,
    includes: 'Грунтування + фарбування в 2 шари',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },

  // === ДОДАТКОВІ РОБОТИ ===
  {
    id: 'demolition_walls',
    name: 'Демонтаж стін/перегородок',
    category: 'demolition',
    unit: 'м³',
    priceUAH: 1200,
    laborOnly: true,
    includes: 'Демонтаж + винесення сміття',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'debris_removal',
    name: 'Вивіз будівельного сміття',
    category: 'other',
    unit: 'м³',
    priceUAH: 450,
    laborOnly: false,
    includes: 'Завантаження + вивіз на сміттєзвалище',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
  {
    id: 'scaffolding_rental',
    name: 'Оренда риштування',
    category: 'other',
    unit: 'м²/міс',
    priceUAH: 45,
    laborOnly: false,
    includes: 'Оренда + монтаж + демонтаж',
    source: 'Ринкові ціни 2026',
    lastUpdated: '2026-04-07',
  },
];

/**
 * Генерує контекст для AI про доступні роботи та їх ціни
 */
export function generateWorkItemsContext(categories?: string[]): string {
  const relevantWork = categories
    ? WORK_ITEMS_DB.filter(work => categories.includes(work.category))
    : WORK_ITEMS_DB;

  let context = `\n## 💼 БАЗА РОБІТ З АКТУАЛЬНИМИ ЦІНАМИ (${relevantWork.length} позицій)\n\n`;
  context += `**ВАЖЛИВО для AI: Це РЕАЛЬНІ ціни на роботи в Україні 2026. ОБОВ'ЯЗКОВО використовуй ЦІ ЦІНИ, не вигадуй свої!**\n\n`;

  const grouped = relevantWork.reduce((acc, work) => {
    if (!acc[work.category]) acc[work.category] = [];
    acc[work.category].push(work);
    return acc;
  }, {} as Record<string, WorkItem[]>);

  for (const [category, works] of Object.entries(grouped)) {
    context += `### ${category.toUpperCase()}\n\n`;
    for (const work of works) {
      context += `**${work.name}**\n`;
      context += `- Ціна: ${work.priceUAH} грн/${work.unit}\n`;
      if (work.includes) context += `- Включає: ${work.includes}\n`;
      if (work.description) context += `- Опис: ${work.description}\n`;
      context += `\n`;
    }
  }

  context += `\n**ІНСТРУКЦІЯ для AI:**\n`;
  context += `1. Використовуй ЦІ ЦІНИ для робіт\n`;
  context += `2. Для кожного матеріалу ОБОВ'ЯЗКОВО додай роботу з монтажу/укладання\n`;
  context += `3. Наприклад: Газоблок 100 шт → Додай "Кладка з газоблоку 1850 грн/м³"\n`;
  context += `4. Не вигадуй ціни які не в цій базі!\n`;

  return context;
}
