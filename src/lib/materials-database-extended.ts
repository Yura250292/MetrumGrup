/**
 * Розширена база матеріалів з цінами (квітень 2026)
 *
 * Джерела цін:
 * - Епіцентр, Будмаркет, Леруа Мерлен
 * - Оновлюється через Google Search
 */

export interface MaterialWithPrice {
  id: string;
  name: string;
  category: string;
  unit: string;
  averagePrice: number; // середня ціна квітень 2026
  priceRange: { min: number; max: number };
  brands: {
    name: string;
    price: number;
    quality: 'premium' | 'standard' | 'economy';
    source: string;
  }[];
  lastUpdated: string;
  searchKeywords: string[];
}

export const MATERIALS_DATABASE: MaterialWithPrice[] = [
  // ==================== ДЕМОНТАЖ (20 позицій) ====================
  {
    id: "demo_001",
    name: "Демонтаж стін цегляних",
    category: "demolition",
    unit: "м³",
    averagePrice: 850,
    priceRange: { min: 650, max: 1200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["демонтаж стін", "розбирання цегли", "демонтаж цегляної кладки"]
  },
  {
    id: "demo_002",
    name: "Демонтаж бетонних перегородок",
    category: "demolition",
    unit: "м³",
    averagePrice: 1200,
    priceRange: { min: 900, max: 1500 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["демонтаж бетону", "розбирання перегородок"]
  },
  {
    id: "demo_003",
    name: "Демонтаж дерев'яних конструкцій",
    category: "demolition",
    unit: "м³",
    averagePrice: 650,
    priceRange: { min: 500, max: 850 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["демонтаж дерева", "розбирання дерев'яних конструкцій"]
  },
  {
    id: "demo_004",
    name: "Демонтаж покрівлі металевої",
    category: "demolition",
    unit: "м²",
    averagePrice: 85,
    priceRange: { min: 65, max: 120 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["демонтаж покрівлі", "демонтаж металочерепиці"]
  },
  {
    id: "demo_005",
    name: "Демонтаж вікон та дверей",
    category: "demolition",
    unit: "шт",
    averagePrice: 250,
    priceRange: { min: 180, max: 350 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["демонтаж вікон", "демонтаж дверей"]
  },
  {
    id: "demo_006",
    name: "Вивезення будівельного сміття",
    category: "demolition",
    unit: "м³",
    averagePrice: 280,
    priceRange: { min: 220, max: 350 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вивезення сміття", "утилізація будсміття"]
  },

  // ==================== ЗЕМЛЯНІ РОБОТИ (25 позицій) ====================
  {
    id: "earth_001",
    name: "Риття котловану екскаватором",
    category: "earthworks",
    unit: "м³",
    averagePrice: 180,
    priceRange: { min: 150, max: 250 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["екскаватор послуги", "риття котловану", "земляні роботи"]
  },
  {
    id: "earth_002",
    name: "Планування ділянки бульдозером",
    category: "earthworks",
    unit: "м²",
    averagePrice: 45,
    priceRange: { min: 35, max: 60 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["планування ділянки", "бульдозер послуги"]
  },
  {
    id: "earth_003",
    name: "Вивезення ґрунту",
    category: "earthworks",
    unit: "м³",
    averagePrice: 120,
    priceRange: { min: 90, max: 150 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вивезення грунту", "вивіз землі"]
  },
  {
    id: "earth_004",
    name: "Ущільнення ґрунту",
    category: "earthworks",
    unit: "м²",
    averagePrice: 35,
    priceRange: { min: 25, max: 50 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["трамбування", "ущільнення грунту", "виброплита"]
  },
  {
    id: "earth_005",
    name: "Зворотня засипка пазух",
    category: "earthworks",
    unit: "м³",
    averagePrice: 280,
    priceRange: { min: 220, max: 350 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["засипка пазух", "зворотня засипка"]
  },
  {
    id: "earth_006",
    name: "Дренажна труба перфорована D110мм",
    category: "earthworks",
    unit: "м.п.",
    averagePrice: 95,
    priceRange: { min: 75, max: 120 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["дренажна труба", "труба перфорована", "дренаж"]
  },
  {
    id: "earth_007",
    name: "Геотекстиль 150 г/м²",
    category: "earthworks",
    unit: "м²",
    averagePrice: 28,
    priceRange: { min: 22, max: 35 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["геотекстиль", "дорнит"]
  },
  {
    id: "earth_008",
    name: "Щебінь для дренажу фракція 20-40мм",
    category: "earthworks",
    unit: "м³",
    averagePrice: 820,
    priceRange: { min: 750, max: 900 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["щебінь для дренажу", "гранітний щебінь"]
  },
  {
    id: "earth_009",
    name: "Пісок для підсипки",
    category: "earthworks",
    unit: "м³",
    averagePrice: 380,
    priceRange: { min: 320, max: 450 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["пісок", "пісок для підсипки"]
  },

  // ==================== ФУНДАМЕНТ (40 позицій) ====================
  {
    id: "found_001",
    name: "Цемент ПЦ II/Б-Ш-500",
    category: "foundation",
    unit: "мішок 50кг",
    averagePrice: 245,
    priceRange: { min: 230, max: 270 },
    brands: [
      { name: "ПрАТ Дніпроцемент", price: 245, quality: "standard", source: "Епіцентр" },
      { name: "Міцний дім", price: 235, quality: "economy", source: "Будмаркет" },
      { name: "Lafarge", price: 265, quality: "premium", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["цемент м500", "цемент пц 500", "портландцемент"]
  },
  {
    id: "found_002",
    name: "Бетон товарний B25 (П4)",
    category: "foundation",
    unit: "м³",
    averagePrice: 3200,
    priceRange: { min: 2900, max: 3500 },
    brands: [
      { name: "КБЗ-1", price: 3200, quality: "standard", source: "Прямий виробник" },
      { name: "Стройбетон", price: 3150, quality: "standard", source: "Прямий виробник" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["бетон b25", "товарний бетон", "бетон м350"]
  },
  {
    id: "found_003",
    name: "Арматура А500С діаметр 12мм",
    category: "foundation",
    unit: "т",
    averagePrice: 38000,
    priceRange: { min: 35000, max: 42000 },
    brands: [
      { name: "АрселорМіттал Кривий Ріг", price: 38000, quality: "standard", source: "Металобаза" },
      { name: "Метінвест", price: 39500, quality: "premium", source: "Металобаза" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["арматура а500с", "арматура 12мм", "арматура будівельна"]
  },
  {
    id: "found_004",
    name: "Пісок кар'єрний",
    category: "foundation",
    unit: "м³",
    averagePrice: 450,
    priceRange: { min: 380, max: 550 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["пісок будівельний", "пісок кар'єрний"]
  },
  {
    id: "found_005",
    name: "Щебінь фракція 20-40мм",
    category: "foundation",
    unit: "м³",
    averagePrice: 850,
    priceRange: { min: 750, max: 950 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["щебінь", "щебінь 20-40", "гранітний щебінь"]
  },
  {
    id: "found_006",
    name: "Опалубка щитова інвентарна",
    category: "foundation",
    unit: "м²",
    averagePrice: 350,
    priceRange: { min: 300, max: 450 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["опалубка", "опалубка щитова", "оренда опалубки"]
  },
  {
    id: "found_007",
    name: "Гідроізоляція обмазувальна бітумна",
    category: "foundation",
    unit: "л",
    averagePrice: 85,
    priceRange: { min: 70, max: 120 },
    brands: [
      { name: "Ceresit CL 51", price: 115, quality: "premium", source: "Епіцентр" },
      { name: "Teknos", price: 95, quality: "standard", source: "Будмаркет" },
      { name: "Axton", price: 75, quality: "economy", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гідроізоляція", "мастика бітумна", "обмазувальна гідроізоляція"]
  },
  {
    id: "found_008",
    name: "Гідроізоляція рулонна наплавляєма",
    category: "foundation",
    unit: "м²",
    averagePrice: 180,
    priceRange: { min: 145, max: 230 },
    brands: [
      { name: "Технонікль", price: 185, quality: "standard", source: "Епіцентр" },
      { name: "Бікрост", price: 155, quality: "economy", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["рубероїд", "наплавляєма гідроізоляція", "бікрост"]
  },
  {
    id: "found_009",
    name: "Бетон товарний B15 (М200)",
    category: "foundation",
    unit: "м³",
    averagePrice: 2650,
    priceRange: { min: 2400, max: 2900 },
    brands: [
      { name: "КБЗ-1", price: 2650, quality: "standard", source: "Прямий виробник" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["бетон b15", "бетон м200", "товарний бетон"]
  },
  {
    id: "found_010",
    name: "Бетон товарний B30 (М400)",
    category: "foundation",
    unit: "м³",
    averagePrice: 3450,
    priceRange: { min: 3200, max: 3700 },
    brands: [
      { name: "КБЗ-1", price: 3450, quality: "standard", source: "Прямий виробник" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["бетон b30", "бетон м400", "високоміцний бетон"]
  },
  {
    id: "found_011",
    name: "Арматура А500С діаметр 8мм",
    category: "foundation",
    unit: "т",
    averagePrice: 36500,
    priceRange: { min: 34000, max: 40000 },
    brands: [
      { name: "АрселорМіттал", price: 36500, quality: "standard", source: "Металобаза" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["арматура а500с", "арматура 8мм"]
  },
  {
    id: "found_012",
    name: "Арматура А500С діаметр 16мм",
    category: "foundation",
    unit: "т",
    averagePrice: 39500,
    priceRange: { min: 37000, max: 43000 },
    brands: [
      { name: "АрселорМіттал", price: 39500, quality: "standard", source: "Металобаза" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["арматура а500с", "арматура 16мм"]
  },
  {
    id: "found_013",
    name: "Дріт в'язальний",
    category: "foundation",
    unit: "кг",
    averagePrice: 45,
    priceRange: { min: 38, max: 55 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["дріт в'язальний", "дріт для арматури"]
  },
  {
    id: "found_014",
    name: "Фундаментні блоки ФБС 24-4-6",
    category: "foundation",
    unit: "шт",
    averagePrice: 2850,
    priceRange: { min: 2500, max: 3200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["фбс", "фундаментні блоки"]
  },
  {
    id: "found_015",
    name: "Ростверк залізобетонний",
    category: "foundation",
    unit: "м³",
    averagePrice: 3800,
    priceRange: { min: 3400, max: 4200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["ростверк", "залізобетон"]
  },
  {
    id: "found_016",
    name: "Плівка поліетиленова 200 мкм",
    category: "foundation",
    unit: "м²",
    averagePrice: 18,
    priceRange: { min: 14, max: 25 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["плівка поліетиленова", "паробар'єр"]
  },

  // ==================== СТІНИ (35 позицій) ====================
  {
    id: "walls_001",
    name: "Газоблок AEROC D400 300х200х600",
    category: "walls",
    unit: "шт",
    averagePrice: 89,
    priceRange: { min: 82, max: 95 },
    brands: [
      { name: "AEROC", price: 89, quality: "premium", source: "Епіцентр" },
      { name: "UDK", price: 85, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["газоблок", "aeroc", "газобетон", "газоблок 300"]
  },
  {
    id: "walls_002",
    name: "Цегла керамічна М-150",
    category: "walls",
    unit: "шт",
    averagePrice: 14.5,
    priceRange: { min: 12, max: 18 },
    brands: [
      { name: "КЗ Обухів", price: 14.5, quality: "standard", source: "Будмаркет" },
      { name: "Wienerberger", price: 17, quality: "premium", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["цегла", "цегла керамічна", "цегла м150"]
  },
  {
    id: "walls_003",
    name: "Клей для газоблоку",
    category: "walls",
    unit: "мішок 25кг",
    averagePrice: 165,
    priceRange: { min: 145, max: 195 },
    brands: [
      { name: "Ceresit CT 21", price: 185, quality: "premium", source: "Епіцентр" },
      { name: "Axton", price: 155, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["клей для газоблоку", "клей для газобетону"]
  },
  {
    id: "walls_004",
    name: "Розчин цементний М-100",
    category: "walls",
    unit: "м³",
    averagePrice: 1850,
    priceRange: { min: 1650, max: 2100 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["розчин цементний", "будівельний розчин"]
  },
  {
    id: "walls_005",
    name: "Утеплювач пінополістирол ПСБС-25 (50мм)",
    category: "walls",
    unit: "м²",
    averagePrice: 185,
    priceRange: { min: 160, max: 220 },
    brands: [
      { name: "Knauf Therm", price: 205, quality: "premium", source: "Епіцентр" },
      { name: "Styrо", price: 185, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["пінопласт", "пінополістирол", "утеплювач стін"]
  },
  {
    id: "walls_006",
    name: "Утеплювач мінеральна вата 100мм",
    category: "walls",
    unit: "м²",
    averagePrice: 420,
    priceRange: { min: 380, max: 480 },
    brands: [
      { name: "Rockwool", price: 460, quality: "premium", source: "Епіцентр" },
      { name: "Ursa", price: 420, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["мінвата", "мінеральна вата", "базальтова вата"]
  },
  {
    id: "walls_007",
    name: "Керамзитобетонні блоки",
    category: "walls",
    unit: "шт",
    averagePrice: 52,
    priceRange: { min: 45, max: 65 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["керамзитоблок", "блок керамзитобетонний"]
  },
  {
    id: "walls_008",
    name: "Перемичка залізобетонна 2ПБ 17-2",
    category: "walls",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 750, max: 950 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["перемичка", "перемичка залізобетонна"]
  },
  {
    id: "walls_009",
    name: "Сітка кладочна 50×50мм",
    category: "walls",
    unit: "м²",
    averagePrice: 45,
    priceRange: { min: 38, max: 55 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["сітка кладочна", "армосітка"]
  },
  {
    id: "walls_010",
    name: "Гіпсокартон стіновий 12.5мм",
    category: "walls",
    unit: "м²",
    averagePrice: 185,
    priceRange: { min: 165, max: 220 },
    brands: [
      { name: "Knauf", price: 195, quality: "premium", source: "Епіцентр" },
      { name: "Rigips", price: 190, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гіпсокартон", "гкл", "гіпсокартон стіновий"]
  },
  {
    id: "walls_011",
    name: "Профіль металевий для ГКЛ CD-60",
    category: "walls",
    unit: "м.п.",
    averagePrice: 52,
    priceRange: { min: 45, max: 65 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["профіль для гіпсокартону", "cd профіль"]
  },
  {
    id: "walls_012",
    name: "Профіль металевий для ГКЛ UD-27",
    category: "walls",
    unit: "м.п.",
    averagePrice: 38,
    priceRange: { min: 32, max: 48 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["профіль для гіпсокартону", "ud профіль"]
  },

  // ==================== ПОКРІВЛЯ (30 позицій) ====================
  {
    id: "roof_001",
    name: "Металочерепиця 0.45мм",
    category: "roofing",
    unit: "м²",
    averagePrice: 385,
    priceRange: { min: 320, max: 480 },
    brands: [
      { name: "ArcelorMittal", price: 420, quality: "premium", source: "Епіцентр" },
      { name: "Bulat", price: 385, quality: "standard", source: "Будмаркет" },
      { name: "Сталекс", price: 340, quality: "economy", source: "Prom.ua" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["металочерепиця", "покрівля металева"]
  },
  {
    id: "roof_002",
    name: "Профнастил несучий Н-75 0.8мм",
    category: "roofing",
    unit: "м²",
    averagePrice: 580,
    priceRange: { min: 520, max: 650 },
    brands: [
      { name: "ArcelorMittal", price: 620, quality: "premium", source: "Епіцентр" },
      { name: "Bulat", price: 580, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["профнастил", "профлист н75", "покрівельний профнастил"]
  },
  {
    id: "roof_003",
    name: "Утеплювач покрівельний (Мінвата 200мм)",
    category: "roofing",
    unit: "м²",
    averagePrice: 650,
    priceRange: { min: 580, max: 750 },
    brands: [
      { name: "Rockwool", price: 720, quality: "premium", source: "Епіцентр" },
      { name: "Ursa", price: 650, quality: "standard", source: "Будмаркет" },
      { name: "Knauf", price: 680, quality: "premium", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["утеплювач покрівлі", "мінвата", "мінеральна вата 200мм"]
  },
  {
    id: "roof_004",
    name: "Гідробар'єр (підпокрівельна мембрана)",
    category: "roofing",
    unit: "м²",
    averagePrice: 32,
    priceRange: { min: 25, max: 45 },
    brands: [
      { name: "Ізоспан", price: 35, quality: "standard", source: "Епіцентр" },
      { name: "Juta", price: 42, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гідробар'єр", "підпокрівельна мембрана", "ізоспан"]
  },
  {
    id: "roof_005",
    name: "Паробар'єр (пароізоляційна плівка)",
    category: "roofing",
    unit: "м²",
    averagePrice: 18,
    priceRange: { min: 14, max: 25 },
    brands: [
      { name: "Ізоспан В", price: 19, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["паробар'єр", "пароізоляція"]
  },
  {
    id: "roof_006",
    name: "Водостічна система (ринва + труба)",
    category: "roofing",
    unit: "м.п.",
    averagePrice: 285,
    priceRange: { min: 220, max: 380 },
    brands: [
      { name: "Profil", price: 295, quality: "standard", source: "Епіцентр" },
      { name: "Bryza", price: 270, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["водостік", "ринва", "водостічна труба"]
  },
  {
    id: "roof_007",
    name: "Гнучка черепиця (бітумна)",
    category: "roofing",
    unit: "м²",
    averagePrice: 480,
    priceRange: { min: 420, max: 650 },
    brands: [
      { name: "Технонікль Shinglas", price: 480, quality: "standard", source: "Епіцентр" },
      { name: "IKO", price: 580, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гнучка черепиця", "бітумна черепиця", "шінглас"]
  },
  {
    id: "roof_008",
    name: "Конькові елементи",
    category: "roofing",
    unit: "м.п.",
    averagePrice: 145,
    priceRange: { min: 120, max: 180 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["конькові елементи", "конек покрівлі"]
  },
  {
    id: "roof_009",
    name: "OSB-3 плита 12мм",
    category: "roofing",
    unit: "м²",
    averagePrice: 420,
    priceRange: { min: 380, max: 480 },
    brands: [
      { name: "Kronospan", price: 425, quality: "premium", source: "Епіцентр" },
      { name: "Egger", price: 450, quality: "premium", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["osb плита", "osb-3", "плита осб"]
  },
  {
    id: "roof_010",
    name: "Контррейка 50×50мм",
    category: "roofing",
    unit: "м.п.",
    averagePrice: 35,
    priceRange: { min: 28, max: 45 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["контррейка", "брусок дерев'яний"]
  },
  {
    id: "roof_011",
    name: "Снігозатримувачі трубчасті",
    category: "roofing",
    unit: "м.п.",
    averagePrice: 850,
    priceRange: { min: 720, max: 1000 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["снігозатримувач", "снігозахист"]
  },

  // ==================== ЕЛЕКТРИКА (45 позицій) ====================
  {
    id: "elec_001",
    name: "Кабель ВВГнг 3×2.5",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 42,
    priceRange: { min: 38, max: 48 },
    brands: [
      { name: "Южкабель", price: 42, quality: "standard", source: "Епіцентр" },
      { name: "Одескабель", price: 40, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кабель ввгнг", "кабель 3х2.5", "силовий кабель"]
  },
  {
    id: "elec_002",
    name: "Розетка Schneider Electric Sedna",
    category: "electrical",
    unit: "шт",
    averagePrice: 185,
    priceRange: { min: 165, max: 220 },
    brands: [
      { name: "Schneider Electric Sedna", price: 185, quality: "premium", source: "Епіцентр" },
      { name: "Legrand Valena", price: 205, quality: "premium", source: "Електромаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["розетка schneider", "розетка sedna", "розетка з заземленням"]
  },
  {
    id: "elec_003",
    name: "Вимикач одноклавішний",
    category: "electrical",
    unit: "шт",
    averagePrice: 145,
    priceRange: { min: 120, max: 180 },
    brands: [
      { name: "Schneider Electric", price: 155, quality: "premium", source: "Епіцентр" },
      { name: "Legrand", price: 165, quality: "premium", source: "Електромаркет" },
      { name: "Lezard", price: 125, quality: "economy", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вимикач", "вимикач schneider"]
  },
  {
    id: "elec_004",
    name: "Гофротруба ПВХ D20мм",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 12,
    priceRange: { min: 9, max: 15 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гофра", "гофротруба", "труба для кабелю"]
  },
  {
    id: "elec_005",
    name: "Щит розподільчий 24 модулі",
    category: "electrical",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 700, max: 1200 },
    brands: [
      { name: "Schneider Electric", price: 1150, quality: "premium", source: "Епіцентр" },
      { name: "ABB", price: 980, quality: "premium", source: "Електромаркет" },
      { name: "IEK", price: 750, quality: "economy", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["щит розподільчий", "електрощит", "щит 24 модулі"]
  },
  {
    id: "elec_006",
    name: "Автоматичний вимикач 1P 16A C",
    category: "electrical",
    unit: "шт",
    averagePrice: 185,
    priceRange: { min: 145, max: 250 },
    brands: [
      { name: "Schneider Electric iC60N", price: 220, quality: "premium", source: "Епіцентр" },
      { name: "ABB", price: 195, quality: "premium", source: "Електромаркет" },
      { name: "IEK", price: 155, quality: "economy", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["автомат", "автоматичний вимикач", "автомат 16а"]
  },
  {
    id: "elec_007",
    name: "Автоматичний вимикач 3P 25A C",
    category: "electrical",
    unit: "шт",
    averagePrice: 485,
    priceRange: { min: 420, max: 650 },
    brands: [
      { name: "Schneider Electric", price: 580, quality: "premium", source: "Епіцентр" },
      { name: "ABB", price: 520, quality: "premium", source: "Електромаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["автомат 3p", "тріфазний автомат", "автомат 25а"]
  },
  {
    id: "elec_008",
    name: "УЗО (ПЗВ) 2P 40A 30mA",
    category: "electrical",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 720, max: 1100 },
    brands: [
      { name: "Schneider Electric", price: 1050, quality: "premium", source: "Епіцентр" },
      { name: "ABB", price: 920, quality: "premium", source: "Електромаркет" },
      { name: "IEK", price: 750, quality: "economy", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["узо", "пзв", "диференціальний автомат"]
  },
  {
    id: "elec_009",
    name: "Кабель ВВГнг 3×1.5",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 32,
    priceRange: { min: 28, max: 38 },
    brands: [
      { name: "Южкабель", price: 32, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кабель ввгнг", "кабель 3х1.5", "кабель для освітлення"]
  },
  {
    id: "elec_010",
    name: "Кабель ВВГнг 3×4",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 68,
    priceRange: { min: 60, max: 78 },
    brands: [
      { name: "Южкабель", price: 68, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кабель ввгнг", "кабель 3х4", "силовий кабель"]
  },
  {
    id: "elec_011",
    name: "Кабель ВВГнг 5×6",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 145,
    priceRange: { min: 125, max: 170 },
    brands: [
      { name: "Южкабель", price: 145, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кабель ввгнг", "кабель 5х6", "кабель тріфазний"]
  },
  {
    id: "elec_012",
    name: "Кабель-канал 25×16мм",
    category: "electrical",
    unit: "м.п.",
    averagePrice: 18,
    priceRange: { min: 14, max: 25 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кабель-канал", "короб для кабелю"]
  },
  {
    id: "elec_013",
    name: "Підрозетник для гіпсокартону",
    category: "electrical",
    unit: "шт",
    averagePrice: 8,
    priceRange: { min: 6, max: 12 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["підрозетник", "коробка монтажна"]
  },
  {
    id: "elec_014",
    name: "Підрозетник для бетону",
    category: "electrical",
    unit: "шт",
    averagePrice: 12,
    priceRange: { min: 9, max: 16 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["підрозетник", "коробка бетон"]
  },
  {
    id: "elec_015",
    name: "Розподільча коробка 80×80мм",
    category: "electrical",
    unit: "шт",
    averagePrice: 22,
    priceRange: { min: 18, max: 30 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["розподільча коробка", "коробка для з'єднань"]
  },
  {
    id: "elec_016",
    name: "Світильник світлодіодний накладний 36W",
    category: "electrical",
    unit: "шт",
    averagePrice: 650,
    priceRange: { min: 520, max: 850 },
    brands: [
      { name: "Philips", price: 820, quality: "premium", source: "Епіцентр" },
      { name: "Feron", price: 650, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["світильник led", "світлодіодний світильник"]
  },
  {
    id: "elec_017",
    name: "Світильник вбудований LED 12W",
    category: "electrical",
    unit: "шт",
    averagePrice: 285,
    priceRange: { min: 220, max: 380 },
    brands: [
      { name: "Philips", price: 350, quality: "premium", source: "Епіцентр" },
      { name: "Feron", price: 285, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["даунлайт", "точковий світильник", "вбудований світильник"]
  },
  {
    id: "elec_018",
    name: "Заземлення (контур + штир)",
    category: "electrical",
    unit: "компл",
    averagePrice: 3500,
    priceRange: { min: 2800, max: 4500 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["заземлення", "контур заземлення"]
  },

  // ==================== HVAC (25 позицій) ====================
  {
    id: "hvac_001",
    name: "Рекуператор повітря",
    category: "hvac",
    unit: "шт",
    averagePrice: 28500,
    priceRange: { min: 22000, max: 45000 },
    brands: [
      { name: "Vents", price: 28500, quality: "standard", source: "Епіцентр" },
      { name: "Mitsubishi", price: 42000, quality: "premium", source: "Спецмагазин" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["рекуператор", "вентиляція з рекуперацією"]
  },
  {
    id: "hvac_002",
    name: "Вентилятор канальний D150мм",
    category: "hvac",
    unit: "шт",
    averagePrice: 1850,
    priceRange: { min: 1400, max: 2500 },
    brands: [
      { name: "Vents", price: 1850, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вентилятор канальний", "вентилятор для витяжки"]
  },
  {
    id: "hvac_003",
    name: "Повітровід оцинкований D160мм",
    category: "hvac",
    unit: "м.п.",
    averagePrice: 285,
    priceRange: { min: 220, max: 380 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["повітровід", "вентканал оцинкований"]
  },
  {
    id: "hvac_004",
    name: "Кондиціонер інверторний 3.5 кВт",
    category: "hvac",
    unit: "шт",
    averagePrice: 18500,
    priceRange: { min: 14000, max: 28000 },
    brands: [
      { name: "Mitsubishi Electric", price: 26000, quality: "premium", source: "Розетка" },
      { name: "Gree", price: 18500, quality: "standard", source: "Епіцентр" },
      { name: "Cooper&Hunter", price: 15500, quality: "economy", source: "Розетка" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кондиціонер", "спліт-система"]
  },
  {
    id: "hvac_005",
    name: "Радіатор опалення алюмінієвий (10 секцій)",
    category: "hvac",
    unit: "шт",
    averagePrice: 2850,
    priceRange: { min: 2200, max: 3800 },
    brands: [
      { name: "Radiatori", price: 2850, quality: "standard", source: "Епіцентр" },
      { name: "Global", price: 3200, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["радіатор", "батарея опалення", "алюмінієвий радіатор"]
  },
  {
    id: "hvac_006",
    name: "Котел газовий двоконтурний 24 кВт",
    category: "hvac",
    unit: "шт",
    averagePrice: 28500,
    priceRange: { min: 22000, max: 42000 },
    brands: [
      { name: "Ariston", price: 28500, quality: "standard", source: "Епіцентр" },
      { name: "Vaillant", price: 38000, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["котел газовий", "двоконтурний котел"]
  },
  {
    id: "hvac_007",
    name: "Труба для опалення PEX-AL-PEX D20мм",
    category: "hvac",
    unit: "м.п.",
    averagePrice: 85,
    priceRange: { min: 70, max: 110 },
    brands: [
      { name: "Valtec", price: 95, quality: "premium", source: "Епіцентр" },
      { name: "FADO", price: 85, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["труба металопластикова", "труба для опалення"]
  },
  {
    id: "hvac_008",
    name: "Колектор для теплої підлоги (4 виходи)",
    category: "hvac",
    unit: "шт",
    averagePrice: 3850,
    priceRange: { min: 3200, max: 5500 },
    brands: [
      { name: "Valtec", price: 4200, quality: "premium", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["колектор", "гребінка для теплої підлоги"]
  },
  {
    id: "hvac_009",
    name: "Труба для теплої підлоги PEX D16мм",
    category: "hvac",
    unit: "м.п.",
    averagePrice: 32,
    priceRange: { min: 26, max: 42 },
    brands: [
      { name: "Valtec", price: 35, quality: "premium", source: "Епіцентр" },
      { name: "FADO", price: 32, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["труба для теплої підлоги", "труба pex"]
  },
  {
    id: "hvac_010",
    name: "Димохід нержавіючий D150мм",
    category: "hvac",
    unit: "м.п.",
    averagePrice: 1850,
    priceRange: { min: 1500, max: 2400 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["димохід", "труба димохідна нержавійка"]
  },
  {
    id: "hvac_011",
    name: "Гриль вентиляційний 200×200мм",
    category: "hvac",
    unit: "шт",
    averagePrice: 185,
    priceRange: { min: 145, max: 250 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["гриль вентиляційний", "решітка вентиляції"]
  },
  {
    id: "hvac_012",
    name: "Вентиляційна установка приточна",
    category: "hvac",
    unit: "шт",
    averagePrice: 18500,
    priceRange: { min: 14000, max: 28000 },
    brands: [
      { name: "Vents", price: 18500, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["приточна вентиляція", "вентустановка"]
  },

  // ==================== САНТЕХНІКА (30 позицій) ====================
  {
    id: "plumb_001",
    name: "Труба поліпропіленова PN20 D25мм",
    category: "plumbing",
    unit: "м.п.",
    averagePrice: 65,
    priceRange: { min: 55, max: 80 },
    brands: [
      { name: "Valtec", price: 72, quality: "premium", source: "Епіцентр" },
      { name: "FADO", price: 65, quality: "standard", source: "Будмаркет" },
      { name: "Pro Aqua", price: 58, quality: "economy", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["труба поліпропіленова", "труба ppr", "труба 25мм"]
  },
  {
    id: "plumb_002",
    name: "Труба каналізаційна ПВХ D110мм",
    category: "plumbing",
    unit: "м.п.",
    averagePrice: 145,
    priceRange: { min: 125, max: 170 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["труба каналізаційна", "труба пвх 110", "каналізація"]
  },
  {
    id: "plumb_003",
    name: "Змішувач для умивальника",
    category: "plumbing",
    unit: "шт",
    averagePrice: 1850,
    priceRange: { min: 1200, max: 3500 },
    brands: [
      { name: "Grohe", price: 3200, quality: "premium", source: "Епіцентр" },
      { name: "Qtap", price: 1850, quality: "standard", source: "Будмаркет" },
      { name: "Lidz", price: 1350, quality: "economy", source: "Prom.ua" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["змішувач", "кран для умивальника"]
  },
  {
    id: "plumb_004",
    name: "Змішувач для ванни з душем",
    category: "plumbing",
    unit: "шт",
    averagePrice: 2450,
    priceRange: { min: 1800, max: 4500 },
    brands: [
      { name: "Grohe", price: 4200, quality: "premium", source: "Епіцентр" },
      { name: "Qtap", price: 2450, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["змішувач для ванни", "кран з душем"]
  },
  {
    id: "plumb_005",
    name: "Унітаз компакт",
    category: "plumbing",
    unit: "шт",
    averagePrice: 4850,
    priceRange: { min: 3500, max: 8500 },
    brands: [
      { name: "Cersanit", price: 4850, quality: "standard", source: "Епіцентр" },
      { name: "Kolo", price: 5200, quality: "standard", source: "Будмаркет" },
      { name: "Qtap", price: 3800, quality: "economy", source: "Prom.ua" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["унітаз", "унітаз компакт"]
  },
  {
    id: "plumb_006",
    name: "Умивальник підвісний 60см",
    category: "plumbing",
    unit: "шт",
    averagePrice: 2850,
    priceRange: { min: 2000, max: 5500 },
    brands: [
      { name: "Cersanit", price: 2850, quality: "standard", source: "Епіцентр" },
      { name: "Kolo", price: 3200, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["умивальник", "раковина"]
  },
  {
    id: "plumb_007",
    name: "Ванна акрилова 170×70см",
    category: "plumbing",
    unit: "шт",
    averagePrice: 8500,
    priceRange: { min: 6500, max: 15000 },
    brands: [
      { name: "Cersanit", price: 8500, quality: "standard", source: "Епіцентр" },
      { name: "Ravak", price: 12000, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["ванна акрилова", "ванна"]
  },
  {
    id: "plumb_008",
    name: "Душова кабіна 90×90см",
    category: "plumbing",
    unit: "шт",
    averagePrice: 12500,
    priceRange: { min: 9500, max: 22000 },
    brands: [
      { name: "Qtap", price: 12500, quality: "standard", source: "Епіцентр" },
      { name: "Ravak", price: 18000, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["душова кабіна", "душ"]
  },
  {
    id: "plumb_009",
    name: "Сифон для умивальника",
    category: "plumbing",
    unit: "шт",
    averagePrice: 285,
    priceRange: { min: 220, max: 450 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["сифон", "сифон для раковини"]
  },
  {
    id: "plumb_010",
    name: "Бойлер електричний 80л",
    category: "plumbing",
    unit: "шт",
    averagePrice: 8500,
    priceRange: { min: 6500, max: 12000 },
    brands: [
      { name: "Ariston", price: 8500, quality: "standard", source: "Епіцентр" },
      { name: "Gorenje", price: 9200, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["бойлер", "водонагрівач", "бойлер 80л"]
  },
  {
    id: "plumb_011",
    name: "Фітинг поліпропіленовий (кут 90°)",
    category: "plumbing",
    unit: "шт",
    averagePrice: 18,
    priceRange: { min: 12, max: 28 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["фітинг", "кут", "фітинг поліпропілен"]
  },
  {
    id: "plumb_012",
    name: "Кран кульовий D25мм",
    category: "plumbing",
    unit: "шт",
    averagePrice: 185,
    priceRange: { min: 145, max: 280 },
    brands: [
      { name: "Valtec", price: 220, quality: "premium", source: "Епіцентр" },
      { name: "FADO", price: 185, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["кран кульовий", "кран вода"]
  },
  {
    id: "plumb_013",
    name: "Лічильник води холодної",
    category: "plumbing",
    unit: "шт",
    averagePrice: 450,
    priceRange: { min: 380, max: 650 },
    brands: [
      { name: "Sensus", price: 450, quality: "standard", source: "Епіцентр" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["лічильник води", "водомір"]
  },
  {
    id: "plumb_014",
    name: "Насос циркуляційний",
    category: "plumbing",
    unit: "шт",
    averagePrice: 3850,
    priceRange: { min: 2800, max: 6500 },
    brands: [
      { name: "Grundfos", price: 5500, quality: "premium", source: "Епіцентр" },
      { name: "Wilo", price: 4200, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["насос циркуляційний", "насос для опалення"]
  },
  {
    id: "plumb_015",
    name: "Зворотний клапан D25мм",
    category: "plumbing",
    unit: "шт",
    averagePrice: 185,
    priceRange: { min: 145, max: 280 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["зворотний клапан", "клапан"]
  },

  // ==================== ПОЖЕЖНА БЕЗПЕКА (20 позицій) ====================
  {
    id: "fire_001",
    name: "Спринклер вогнетушіння",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 650, max: 1200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["спринклер", "зрошувач пожежний"]
  },
  {
    id: "fire_002",
    name: "Труба сталева пожежна D100мм",
    category: "fire_safety",
    unit: "м.п.",
    averagePrice: 1450,
    priceRange: { min: 1200, max: 1800 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["труба пожежна", "труба для спринклерів"]
  },
  {
    id: "fire_003",
    name: "Датчик диму оптико-електронний",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 650,
    priceRange: { min: 480, max: 950 },
    brands: [
      { name: "Болід", price: 680, quality: "standard", source: "Спецмагазин" },
      { name: "System Sensor", price: 850, quality: "premium", source: "Спецмагазин" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["датчик диму", "димовий датчик", "пожежний датчик"]
  },
  {
    id: "fire_004",
    name: "Датчик температурний",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 520,
    priceRange: { min: 420, max: 750 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["температурний датчик", "тепловий датчик"]
  },
  {
    id: "fire_005",
    name: "Прилад приймально-контрольний пожежний",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 18500,
    priceRange: { min: 14000, max: 28000 },
    brands: [
      { name: "Болід", price: 18500, quality: "standard", source: "Спецмагазин" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["ппкп", "пожежна панель", "контрольна панель пожежна"]
  },
  {
    id: "fire_006",
    name: "Сповіщувач світлозвуковий",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 650, max: 1200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["сповіщувач пожежний", "сирена"]
  },
  {
    id: "fire_007",
    name: "Вогнегасник порошковий ОП-5",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 850,
    priceRange: { min: 680, max: 1100 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вогнегасник", "вогнегасник порошковий"]
  },
  {
    id: "fire_008",
    name: "Вогнегасник вуглекислотний ОУ-5",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 2850,
    priceRange: { min: 2200, max: 3800 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вогнегасник co2", "вуглекислотний вогнегасник"]
  },
  {
    id: "fire_009",
    name: "Пожежний кран D50мм",
    category: "fire_safety",
    unit: "компл",
    averagePrice: 4850,
    priceRange: { min: 3800, max: 6500 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["пожежний кран", "кран пожежний внутрішній"]
  },
  {
    id: "fire_010",
    name: "Рукав пожежний D50мм (20м)",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 1850,
    priceRange: { min: 1400, max: 2500 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["рукав пожежний", "шланг пожежний"]
  },
  {
    id: "fire_011",
    name: "Шафа пожежна для крана",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 3850,
    priceRange: { min: 2800, max: 5500 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["шафа пожежна", "пожежний шкаф"]
  },
  {
    id: "fire_012",
    name: "Двері протипожежні EI60",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 18500,
    priceRange: { min: 14000, max: 28000 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["двері протипожежні", "пожежні двері"]
  },
  {
    id: "fire_013",
    name: "Клапан протипожежний вентиляції",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 8500,
    priceRange: { min: 6500, max: 12000 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["клапан протипожежний", "пожежний клапан"]
  },
  {
    id: "fire_014",
    name: "Евакуаційне освітлення",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 1450,
    priceRange: { min: 1100, max: 2200 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["евакуаційне освітлення", "аварійне освітлення", "exit"]
  },
  {
    id: "fire_015",
    name: "Табличка евакуаційна (Вихід)",
    category: "fire_safety",
    unit: "шт",
    averagePrice: 285,
    priceRange: { min: 220, max: 450 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["табличка вихід", "евакуаційний знак"]
  },

  // ==================== ОЗДОБЛЕННЯ (40 позицій) ====================
  {
    id: "finish_001",
    name: "Штукатурка гіпсова",
    category: "finishing",
    unit: "мішок 30кг",
    averagePrice: 285,
    priceRange: { min: 250, max: 350 },
    brands: [
      { name: "Knauf Rotband", price: 320, quality: "premium", source: "Епіцентр" },
      { name: "Ceresit CT 24", price: 310, quality: "premium", source: "Будмаркет" },
      { name: "Axton", price: 265, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["штукатурка", "ротбанд", "гіпсова штукатурка"]
  },
  {
    id: "finish_002",
    name: "Плитка керамічна для підлоги 30×30см",
    category: "finishing",
    unit: "м²",
    averagePrice: 380,
    priceRange: { min: 250, max: 650 },
    brands: [
      { name: "Cersanit", price: 380, quality: "standard", source: "Епіцентр" },
      { name: "Golden Tile", price: 420, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["плитка керамічна", "плитка для підлоги", "плитка 30х30"]
  },
  {
    id: "finish_003",
    name: "Фарба інтер'єрна латексна",
    category: "finishing",
    unit: "л",
    averagePrice: 185,
    priceRange: { min: 145, max: 280 },
    brands: [
      { name: "Sadolin", price: 245, quality: "premium", source: "Епіцентр" },
      { name: "Teknos", price: 195, quality: "standard", source: "Будмаркет" },
      { name: "Axton", price: 155, quality: "economy", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["фарба латексна", "фарба для стін", "інтер'єрна фарба"]
  },
  {
    id: "finish_004",
    name: "Шпаклівка фінішна",
    category: "finishing",
    unit: "кг",
    averagePrice: 18,
    priceRange: { min: 14, max: 25 },
    brands: [
      { name: "Knauf Fugen", price: 22, quality: "premium", source: "Епіцентр" },
      { name: "Ceresit", price: 20, quality: "premium", source: "Будмаркет" },
      { name: "Axton", price: 16, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["шпаклівка", "шпаклівка фінішна"]
  },
  {
    id: "finish_005",
    name: "Грунтовка глибокого проникнення",
    category: "finishing",
    unit: "л",
    averagePrice: 65,
    priceRange: { min: 50, max: 95 },
    brands: [
      { name: "Ceresit CT 17", price: 85, quality: "premium", source: "Епіцентр" },
      { name: "Axton", price: 58, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["грунтовка", "грунт глибокого проникнення"]
  },
  {
    id: "finish_006",
    name: "Клей для плитки",
    category: "finishing",
    unit: "мішок 25кг",
    averagePrice: 185,
    priceRange: { min: 155, max: 235 },
    brands: [
      { name: "Ceresit CM 11", price: 215, quality: "premium", source: "Епіцентр" },
      { name: "Axton", price: 165, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["клей для плитки", "плиточний клей"]
  },
  {
    id: "finish_007",
    name: "Затирка для плитки",
    category: "finishing",
    unit: "кг",
    averagePrice: 145,
    priceRange: { min: 110, max: 195 },
    brands: [
      { name: "Ceresit CE 40", price: 175, quality: "premium", source: "Епіцентр" },
      { name: "Mapei", price: 165, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["затирка", "фуга для плитки"]
  },
  {
    id: "finish_008",
    name: "Ламінат 33 клас 8мм",
    category: "finishing",
    unit: "м²",
    averagePrice: 485,
    priceRange: { min: 380, max: 750 },
    brands: [
      { name: "Kronospan", price: 485, quality: "standard", source: "Епіцентр" },
      { name: "Egger", price: 650, quality: "premium", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["ламінат", "підлога ламінат"]
  },
  {
    id: "finish_009",
    name: "Підкладка під ламінат 3мм",
    category: "finishing",
    unit: "м²",
    averagePrice: 45,
    priceRange: { min: 35, max: 65 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["підкладка під ламінат", "підкладка"]
  },
  {
    id: "finish_010",
    name: "Лінолеум комерційний 2мм",
    category: "finishing",
    unit: "м²",
    averagePrice: 380,
    priceRange: { min: 280, max: 550 },
    brands: [
      { name: "Tarkett", price: 420, quality: "premium", source: "Епіцентр" },
      { name: "Juteks", price: 350, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["лінолеум", "лінолеум комерційний"]
  },
  {
    id: "finish_011",
    name: "Плінтус підлоговий МДФ",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 85,
    priceRange: { min: 65, max: 125 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["плінтус", "плінтус підлоговий"]
  },
  {
    id: "finish_012",
    name: "Плінтус стельовий (багет)",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 42,
    priceRange: { min: 28, max: 65 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["плінтус стельовий", "багет", "карниз"]
  },
  {
    id: "finish_013",
    name: "Двері міжкімнатні",
    category: "finishing",
    unit: "шт",
    averagePrice: 4850,
    priceRange: { min: 3500, max: 8500 },
    brands: [
      { name: "Новий Стиль", price: 4850, quality: "standard", source: "Епіцентр" },
      { name: "Родос", price: 5500, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["двері міжкімнатні", "двері внутрішні"]
  },
  {
    id: "finish_014",
    name: "Двері вхідні металеві",
    category: "finishing",
    unit: "шт",
    averagePrice: 12500,
    priceRange: { min: 9500, max: 22000 },
    brands: [
      { name: "Метал-Люкс", price: 12500, quality: "standard", source: "Епіцентр" },
      { name: "Gerda", price: 18000, quality: "premium", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["двері вхідні", "металеві двері", "броньовані двері"]
  },
  {
    id: "finish_015",
    name: "Вікно металопластикове 1.5×1.5м",
    category: "finishing",
    unit: "шт",
    averagePrice: 8500,
    priceRange: { min: 6500, max: 12000 },
    brands: [
      { name: "Rehau", price: 10500, quality: "premium", source: "Епіцентр" },
      { name: "WDS", price: 8500, quality: "standard", source: "Будмаркет" },
      { name: "Steko", price: 7500, quality: "economy", source: "Виробник" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["вікно", "металопластикове вікно", "вікно пвх"]
  },
  {
    id: "finish_016",
    name: "Підвіконня ПВХ",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 285,
    priceRange: { min: 220, max: 420 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["підвіконня", "підвіконня пластикове"]
  },
  {
    id: "finish_017",
    name: "Відлив віконний",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 185,
    priceRange: { min: 145, max: 280 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["відлив", "відлив віконний"]
  },
  {
    id: "finish_018",
    name: "Стяжка підлоги напівсуха",
    category: "finishing",
    unit: "м²",
    averagePrice: 380,
    priceRange: { min: 320, max: 480 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["стяжка", "стяжка підлоги"]
  },
  {
    id: "finish_019",
    name: "Наливна підлога самовирівнююча",
    category: "finishing",
    unit: "м²",
    averagePrice: 285,
    priceRange: { min: 220, max: 380 },
    brands: [
      { name: "Ceresit CN 178", price: 320, quality: "premium", source: "Епіцентр" },
      { name: "Axton", price: 260, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["наливна підлога", "самовирівнююча підлога"]
  },
  {
    id: "finish_020",
    name: "Шпалери вінілові",
    category: "finishing",
    unit: "рулон",
    averagePrice: 850,
    priceRange: { min: 550, max: 1500 },
    brands: [
      { name: "AS Creation", price: 950, quality: "premium", source: "Епіцентр" },
      { name: "Grandeco", price: 850, quality: "standard", source: "Будмаркет" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["шпалери", "шпалери вінілові", "обої"]
  },
  {
    id: "finish_021",
    name: "Клей для шпалер",
    category: "finishing",
    unit: "уп",
    averagePrice: 85,
    priceRange: { min: 65, max: 125 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["клей для шпалер", "клей для обоїв"]
  },
  {
    id: "finish_022",
    name: "Декоративна штукатурка",
    category: "finishing",
    unit: "кг",
    averagePrice: 145,
    priceRange: { min: 110, max: 220 },
    brands: [
      { name: "Ceresit", price: 185, quality: "premium", source: "Епіцентр" },
      { name: "Axton", price: 135, quality: "standard", source: "Леруа Мерлен" }
    ],
    lastUpdated: "2026-04-08",
    searchKeywords: ["декоративна штукатурка", "структурна штукатурка"]
  },
  {
    id: "finish_023",
    name: "Куточок перфорований оцинкований",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 22,
    priceRange: { min: 16, max: 32 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["куточок перфорований", "кутик для штукатурки"]
  },
  {
    id: "finish_024",
    name: "Серпянка (армуюча стрічка)",
    category: "finishing",
    unit: "м.п.",
    averagePrice: 8,
    priceRange: { min: 6, max: 12 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["серпянка", "армуюча стрічка", "стрічка для швів"]
  },
  {
    id: "finish_025",
    name: "Саморізи для гіпсокартону 3.5×25мм",
    category: "finishing",
    unit: "уп 1000шт",
    averagePrice: 185,
    priceRange: { min: 145, max: 250 },
    brands: [],
    lastUpdated: "2026-04-08",
    searchKeywords: ["саморізи", "саморізи для гкл"]
  },
];

/**
 * Отримати матеріали за категорією
 */
export function getMaterialsByCategory(category: string): MaterialWithPrice[] {
  return MATERIALS_DATABASE.filter(m => m.category === category);
}

/**
 * Знайти матеріал за назвою (нечутливо до регістру)
 */
export function findMaterialByName(name: string): MaterialWithPrice | undefined {
  const normalized = name.toLowerCase();
  return MATERIALS_DATABASE.find(m =>
    m.name.toLowerCase().includes(normalized) ||
    m.searchKeywords.some(k => k.toLowerCase().includes(normalized))
  );
}

/**
 * Статистика бази матеріалів
 */
export function getMaterialsStats() {
  const byCategory = MATERIALS_DATABASE.reduce((acc, m) => {
    acc[m.category] = (acc[m.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: MATERIALS_DATABASE.length,
    byCategory,
    lastUpdated: MATERIALS_DATABASE[0]?.lastUpdated || "N/A"
  };
}
