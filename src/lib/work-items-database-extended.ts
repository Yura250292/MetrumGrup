/**
 * Розширена база робіт з цінами (квітень 2026)
 *
 * Джерела цін:
 * - Сайти будівельних бригад
 * - Прайси будівельних компаній
 * - Форуми (master.ua, budport.com.ua)
 */

export interface WorkItemWithPrice {
  id: string;
  name: string;
  category: string;
  unit: string;
  laborRate: number; // ставка за одиницю (грн)
  timePerUnit: number; // годин на одиницю
  complexity: 'simple' | 'medium' | 'complex';
  requiredSkills: string[];
  searchKeywords: string[];
  lastUpdated: string;
}

export const WORK_ITEMS_DATABASE: WorkItemWithPrice[] = [
  // ==================== ДЕМОНТАЖ (15 робіт) ====================
  {
    id: "work_demo_001",
    name: "Демонтаж стін цегляних вручну",
    category: "demolition",
    unit: "м³",
    laborRate: 650,
    timePerUnit: 0.5,
    complexity: "medium",
    requiredSkills: ["будівельник"],
    searchKeywords: ["демонтаж цегли", "розбирання стін"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_demo_002",
    name: "Демонтаж бетонних перегородок перфоратором",
    category: "demolition",
    unit: "м³",
    laborRate: 1200,
    timePerUnit: 0.8,
    complexity: "complex",
    requiredSkills: ["будівельник", "робота з перфоратором"],
    searchKeywords: ["демонтаж бетону", "руйнування бетонних конструкцій"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_demo_003",
    name: "Демонтаж покрівлі",
    category: "demolition",
    unit: "м²",
    laborRate: 95,
    timePerUnit: 0.15,
    complexity: "simple",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["демонтаж покрівлі", "зняття металочерепиці"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_demo_004",
    name: "Демонтаж вікон та дверей",
    category: "demolition",
    unit: "шт",
    laborRate: 280,
    timePerUnit: 0.5,
    complexity: "simple",
    requiredSkills: ["будівельник"],
    searchKeywords: ["демонтаж вікон", "демонтаж дверей"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_demo_005",
    name: "Очищення приміщень від будсміття",
    category: "demolition",
    unit: "м²",
    laborRate: 45,
    timePerUnit: 0.1,
    complexity: "simple",
    requiredSkills: ["різноробочий"],
    searchKeywords: ["прибирання будсміття", "очищення приміщень"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ЗЕМЛЯНІ РОБОТИ (12 робіт) ====================
  {
    id: "work_earth_001",
    name: "Риття котловану екскаватором",
    category: "earthworks",
    unit: "м³",
    laborRate: 180,
    timePerUnit: 0.05,
    complexity: "medium",
    requiredSkills: ["машиніст екскаватора"],
    searchKeywords: ["екскаватор", "риття котловану"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_earth_002",
    name: "Риття траншей вручну",
    category: "earthworks",
    unit: "м³",
    laborRate: 850,
    timePerUnit: 1.5,
    complexity: "complex",
    requiredSkills: ["землекоп"],
    searchKeywords: ["риття траншей", "земляні роботи вручну"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_earth_003",
    name: "Планування ділянки бульдозером",
    category: "earthworks",
    unit: "м²",
    laborRate: 45,
    timePerUnit: 0.01,
    complexity: "simple",
    requiredSkills: ["машиніст бульдозера"],
    searchKeywords: ["планування ділянки", "бульдозер"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_earth_004",
    name: "Ущільнення ґрунту віброплитою",
    category: "earthworks",
    unit: "м²",
    laborRate: 35,
    timePerUnit: 0.08,
    complexity: "simple",
    requiredSkills: ["будівельник"],
    searchKeywords: ["трамбування", "ущільнення грунту"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_earth_005",
    name: "Зворотня засипка пазух фундаменту",
    category: "earthworks",
    unit: "м³",
    laborRate: 280,
    timePerUnit: 0.3,
    complexity: "medium",
    requiredSkills: ["будівельник"],
    searchKeywords: ["засипка пазух", "зворотня засипка"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_earth_006",
    name: "Укладання дренажної системи",
    category: "earthworks",
    unit: "м.п.",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["будівельник", "дренажник"],
    searchKeywords: ["дренаж", "укладання дренажу"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ФУНДАМЕНТ (18 робіт) ====================
  {
    id: "work_found_001",
    name: "Монтаж опалубки фундаменту",
    category: "foundation",
    unit: "м²",
    laborRate: 350,
    timePerUnit: 0.5,
    complexity: "medium",
    requiredSkills: ["теслер", "будівельник"],
    searchKeywords: ["монтаж опалубки", "установка опалубки"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_002",
    name: "Демонтаж опалубки фундаменту",
    category: "foundation",
    unit: "м²",
    laborRate: 120,
    timePerUnit: 0.15,
    complexity: "simple",
    requiredSkills: ["будівельник"],
    searchKeywords: ["демонтаж опалубки", "розбирання опалубки"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_003",
    name: "Армування фундаменту",
    category: "foundation",
    unit: "т",
    laborRate: 12000,
    timePerUnit: 8,
    complexity: "complex",
    requiredSkills: ["арматурник"],
    searchKeywords: ["армування", "в'язання арматури"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_004",
    name: "Бетонування фундаменту",
    category: "foundation",
    unit: "м³",
    laborRate: 850,
    timePerUnit: 0.6,
    complexity: "medium",
    requiredSkills: ["бетонщик"],
    searchKeywords: ["бетонування", "заливка бетону"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_005",
    name: "Вібрування бетону",
    category: "foundation",
    unit: "м³",
    laborRate: 280,
    timePerUnit: 0.2,
    complexity: "simple",
    requiredSkills: ["бетонщик"],
    searchKeywords: ["вібрування бетону", "ущільнення бетону"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_006",
    name: "Гідроізоляція фундаменту обмазувальна",
    category: "foundation",
    unit: "м²",
    laborRate: 185,
    timePerUnit: 0.25,
    complexity: "medium",
    requiredSkills: ["гідроізолювальник"],
    searchKeywords: ["гідроізоляція фундаменту", "обмазувальна гідроізоляція"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_007",
    name: "Гідроізоляція фундаменту рулонна",
    category: "foundation",
    unit: "м²",
    laborRate: 220,
    timePerUnit: 0.3,
    complexity: "medium",
    requiredSkills: ["гідроізолювальник"],
    searchKeywords: ["рулонна гідроізоляція", "наплавляєма гідроізоляція"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_found_008",
    name: "Укладання ФБС блоків",
    category: "foundation",
    unit: "шт",
    laborRate: 650,
    timePerUnit: 0.4,
    complexity: "complex",
    requiredSkills: ["машиніст крана", "монтажник"],
    searchKeywords: ["укладання фбс", "монтаж блоків фбс"],
    lastUpdated: "2026-04-08"
  },

  // ==================== СТІНИ (20 робіт) ====================
  {
    id: "work_walls_001",
    name: "Кладка газоблоку",
    category: "walls",
    unit: "м³",
    laborRate: 1850,
    timePerUnit: 3,
    complexity: "medium",
    requiredSkills: ["муляр"],
    searchKeywords: ["кладка газоблоку", "муляр газобетон"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_002",
    name: "Кладка цегли",
    category: "walls",
    unit: "м³",
    laborRate: 2850,
    timePerUnit: 4,
    complexity: "complex",
    requiredSkills: ["муляр"],
    searchKeywords: ["кладка цегли", "муляр"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_003",
    name: "Утеплення стін пінопластом",
    category: "walls",
    unit: "м²",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["фасадник"],
    searchKeywords: ["утеплення стін", "монтаж пінопласту"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_004",
    name: "Утеплення стін мінватою",
    category: "walls",
    unit: "м²",
    laborRate: 320,
    timePerUnit: 0.45,
    complexity: "medium",
    requiredSkills: ["фасадник"],
    searchKeywords: ["утеплення мінватою", "монтаж мінвати"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_005",
    name: "Монтаж гіпсокартону на стіни",
    category: "walls",
    unit: "м²",
    laborRate: 280,
    timePerUnit: 0.35,
    complexity: "medium",
    requiredSkills: ["гіпсокартонник"],
    searchKeywords: ["монтаж гкл", "гіпсокартон на стіни"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_006",
    name: "Монтаж металевого каркасу для ГКЛ",
    category: "walls",
    unit: "м²",
    laborRate: 220,
    timePerUnit: 0.3,
    complexity: "medium",
    requiredSkills: ["гіпсокартонник"],
    searchKeywords: ["каркас для гкл", "металевий профіль"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_007",
    name: "Штукатурення стін гіпсовою штукатуркою",
    category: "walls",
    unit: "м²",
    laborRate: 320,
    timePerUnit: 0.5,
    complexity: "medium",
    requiredSkills: ["штукатур"],
    searchKeywords: ["штукатурення", "машинне штукатурення"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_walls_008",
    name: "Штукатурення стін цементним розчином",
    category: "walls",
    unit: "м²",
    laborRate: 380,
    timePerUnit: 0.6,
    complexity: "complex",
    requiredSkills: ["штукатур"],
    searchKeywords: ["цементна штукатурка", "штукатурення фасаду"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ПОКРІВЛЯ (15 робіт) ====================
  {
    id: "work_roof_001",
    name: "Монтаж стропильної системи",
    category: "roofing",
    unit: "м²",
    laborRate: 450,
    timePerUnit: 0.7,
    complexity: "complex",
    requiredSkills: ["тесляр", "покрівельник"],
    searchKeywords: ["монтаж стропил", "стропильна система"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_002",
    name: "Монтаж металочерепиці",
    category: "roofing",
    unit: "м²",
    laborRate: 380,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["монтаж металочерепиці", "покрівельні роботи"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_003",
    name: "Монтаж профнастилу на покрівлю",
    category: "roofing",
    unit: "м²",
    laborRate: 320,
    timePerUnit: 0.35,
    complexity: "medium",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["монтаж профнастилу", "покрівля профлист"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_004",
    name: "Утеплення покрівлі мінватою",
    category: "roofing",
    unit: "м²",
    laborRate: 285,
    timePerUnit: 0.35,
    complexity: "medium",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["утеплення покрівлі", "монтаж утеплювача"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_005",
    name: "Монтаж гідробар'єру",
    category: "roofing",
    unit: "м²",
    laborRate: 95,
    timePerUnit: 0.15,
    complexity: "simple",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["монтаж гідробар'єру", "підпокрівельна мембрана"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_006",
    name: "Монтаж водостічної системи",
    category: "roofing",
    unit: "м.п.",
    laborRate: 185,
    timePerUnit: 0.3,
    complexity: "medium",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["монтаж водостоку", "установка ринв"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_roof_007",
    name: "Монтаж гнучкої черепиці",
    category: "roofing",
    unit: "м²",
    laborRate: 480,
    timePerUnit: 0.6,
    complexity: "complex",
    requiredSkills: ["покрівельник"],
    searchKeywords: ["монтаж гнучкої черепиці", "бітумна черепиця"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ЕЛЕКТРИКА (25 робіт) ====================
  {
    id: "work_elec_001",
    name: "Прокладання електропроводки приховано",
    category: "electrical",
    unit: "м.п.",
    laborRate: 85,
    timePerUnit: 0.15,
    complexity: "medium",
    requiredSkills: ["електрик"],
    searchKeywords: ["прокладання кабелю", "електропроводка прихована"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_002",
    name: "Прокладання електропроводки відкрито",
    category: "electrical",
    unit: "м.п.",
    laborRate: 65,
    timePerUnit: 0.12,
    complexity: "simple",
    requiredSkills: ["електрик"],
    searchKeywords: ["прокладання кабелю відкрито", "електропроводка"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_003",
    name: "Монтаж розеток та вимикачів",
    category: "electrical",
    unit: "шт",
    laborRate: 185,
    timePerUnit: 0.25,
    complexity: "simple",
    requiredSkills: ["електрик"],
    searchKeywords: ["установка розеток", "монтаж вимикачів"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_004",
    name: "Монтаж електрощита",
    category: "electrical",
    unit: "шт",
    laborRate: 1850,
    timePerUnit: 3,
    complexity: "complex",
    requiredSkills: ["електрик"],
    searchKeywords: ["монтаж щита", "збірка електрощита"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_005",
    name: "Монтаж автоматичних вимикачів",
    category: "electrical",
    unit: "шт",
    laborRate: 185,
    timePerUnit: 0.2,
    complexity: "medium",
    requiredSkills: ["електрик"],
    searchKeywords: ["монтаж автоматів", "установка автоматичних вимикачів"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_006",
    name: "Монтаж світильників накладних",
    category: "electrical",
    unit: "шт",
    laborRate: 320,
    timePerUnit: 0.4,
    complexity: "simple",
    requiredSkills: ["електрик"],
    searchKeywords: ["монтаж світильників", "установка освітлення"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_007",
    name: "Монтаж світильників вбудованих",
    category: "electrical",
    unit: "шт",
    laborRate: 220,
    timePerUnit: 0.3,
    complexity: "medium",
    requiredSkills: ["електрик"],
    searchKeywords: ["монтаж точкових світильників", "вбудовані світильники"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_elec_008",
    name: "Влаштування контуру заземлення",
    category: "electrical",
    unit: "компл",
    laborRate: 3500,
    timePerUnit: 6,
    complexity: "complex",
    requiredSkills: ["електрик"],
    searchKeywords: ["контур заземлення", "монтаж заземлення"],
    lastUpdated: "2026-04-08"
  },

  // ==================== HVAC (12 робіт) ====================
  {
    id: "work_hvac_001",
    name: "Монтаж кондиціонера",
    category: "hvac",
    unit: "шт",
    laborRate: 2850,
    timePerUnit: 4,
    complexity: "complex",
    requiredSkills: ["монтажник кондиціонерів"],
    searchKeywords: ["монтаж кондиціонера", "установка спліт-системи"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_002",
    name: "Монтаж вентиляційних каналів",
    category: "hvac",
    unit: "м.п.",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["монтажник вентиляції"],
    searchKeywords: ["монтаж вентканалів", "прокладання повітроводів"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_003",
    name: "Монтаж вентилятора канального",
    category: "hvac",
    unit: "шт",
    laborRate: 1450,
    timePerUnit: 2,
    complexity: "medium",
    requiredSkills: ["монтажник вентиляції"],
    searchKeywords: ["монтаж вентилятора", "установка витяжки"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_004",
    name: "Монтаж радіаторів опалення",
    category: "hvac",
    unit: "шт",
    laborRate: 850,
    timePerUnit: 1.5,
    complexity: "medium",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж радіаторів", "установка батарей"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_005",
    name: "Монтаж газового котла",
    category: "hvac",
    unit: "шт",
    laborRate: 4850,
    timePerUnit: 6,
    complexity: "complex",
    requiredSkills: ["газовик", "сантехнік"],
    searchKeywords: ["монтаж котла", "установка газового котла"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_006",
    name: "Монтаж теплої підлоги",
    category: "hvac",
    unit: "м²",
    laborRate: 380,
    timePerUnit: 0.5,
    complexity: "complex",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж теплої підлоги", "укладання труб опалення"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_hvac_007",
    name: "Монтаж димоходу",
    category: "hvac",
    unit: "м.п.",
    laborRate: 1450,
    timePerUnit: 1.5,
    complexity: "complex",
    requiredSkills: ["пічник", "монтажник"],
    searchKeywords: ["монтаж димоходу", "установка труби димохідної"],
    lastUpdated: "2026-04-08"
  },

  // ==================== САНТЕХНІКА (18 робіт) ====================
  {
    id: "work_plumb_001",
    name: "Монтаж водопроводу",
    category: "plumbing",
    unit: "м.п.",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж водопроводу", "прокладання труб води"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_002",
    name: "Монтаж каналізації",
    category: "plumbing",
    unit: "м.п.",
    laborRate: 320,
    timePerUnit: 0.45,
    complexity: "medium",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж каналізації", "прокладання каналізаційних труб"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_003",
    name: "Монтаж унітазу",
    category: "plumbing",
    unit: "шт",
    laborRate: 850,
    timePerUnit: 1.5,
    complexity: "medium",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж унітазу", "установка унітазу"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_004",
    name: "Монтаж умивальника",
    category: "plumbing",
    unit: "шт",
    laborRate: 650,
    timePerUnit: 1,
    complexity: "simple",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж умивальника", "установка раковини"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_005",
    name: "Монтаж ванни",
    category: "plumbing",
    unit: "шт",
    laborRate: 1450,
    timePerUnit: 2.5,
    complexity: "medium",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж ванни", "установка акрилової ванни"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_006",
    name: "Монтаж душової кабіни",
    category: "plumbing",
    unit: "шт",
    laborRate: 2850,
    timePerUnit: 4,
    complexity: "complex",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж душової кабіни", "установка душу"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_007",
    name: "Монтаж змішувачів",
    category: "plumbing",
    unit: "шт",
    laborRate: 450,
    timePerUnit: 0.7,
    complexity: "simple",
    requiredSkills: ["сантехнік"],
    searchKeywords: ["монтаж змішувача", "установка крана"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_plumb_008",
    name: "Монтаж бойлера",
    category: "plumbing",
    unit: "шт",
    laborRate: 1850,
    timePerUnit: 3,
    complexity: "medium",
    requiredSkills: ["сантехнік", "електрик"],
    searchKeywords: ["монтаж бойлера", "установка водонагрівача"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ПОЖЕЖНА БЕЗПЕКА (10 робіт) ====================
  {
    id: "work_fire_001",
    name: "Монтаж спринклерної системи",
    category: "fire_safety",
    unit: "шт",
    laborRate: 850,
    timePerUnit: 1.5,
    complexity: "complex",
    requiredSkills: ["монтажник пожежних систем"],
    searchKeywords: ["монтаж спринклерів", "установка зрошувачів"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_fire_002",
    name: "Монтаж датчиків диму",
    category: "fire_safety",
    unit: "шт",
    laborRate: 450,
    timePerUnit: 0.5,
    complexity: "medium",
    requiredSkills: ["електрик", "монтажник СП"],
    searchKeywords: ["монтаж датчиків диму", "установка пожежних датчиків"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_fire_003",
    name: "Монтаж пожежної сигналізації",
    category: "fire_safety",
    unit: "м²",
    laborRate: 185,
    timePerUnit: 0.3,
    complexity: "complex",
    requiredSkills: ["електрик", "монтажник СП"],
    searchKeywords: ["монтаж пожежної сигналізації", "ОПС"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_fire_004",
    name: "Монтаж протипожежних дверей",
    category: "fire_safety",
    unit: "шт",
    laborRate: 1850,
    timePerUnit: 3,
    complexity: "medium",
    requiredSkills: ["монтажник дверей"],
    searchKeywords: ["монтаж протипожежних дверей", "установка пожежних дверей"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_fire_005",
    name: "Монтаж евакуаційного освітлення",
    category: "fire_safety",
    unit: "шт",
    laborRate: 650,
    timePerUnit: 1,
    complexity: "simple",
    requiredSkills: ["електрик"],
    searchKeywords: ["монтаж евакуаційного освітлення", "аварійне освітлення"],
    lastUpdated: "2026-04-08"
  },

  // ==================== ОЗДОБЛЕННЯ (35 робіт) ====================
  {
    id: "work_finish_001",
    name: "Шпаклювання стін",
    category: "finishing",
    unit: "м²",
    laborRate: 180,
    timePerUnit: 0.35,
    complexity: "medium",
    requiredSkills: ["маляр"],
    searchKeywords: ["шпаклювання", "шпаклівка стін"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_002",
    name: "Малювання стін та стель",
    category: "finishing",
    unit: "м²",
    laborRate: 145,
    timePerUnit: 0.25,
    complexity: "simple",
    requiredSkills: ["маляр"],
    searchKeywords: ["малювання стін", "фарбування"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_003",
    name: "Укладання плитки на підлогу",
    category: "finishing",
    unit: "м²",
    laborRate: 480,
    timePerUnit: 0.8,
    complexity: "medium",
    requiredSkills: ["плиточник"],
    searchKeywords: ["укладання плитки", "плиточні роботи"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_004",
    name: "Укладання плитки на стіни",
    category: "finishing",
    unit: "м²",
    laborRate: 520,
    timePerUnit: 0.9,
    complexity: "medium",
    requiredSkills: ["плиточник"],
    searchKeywords: ["облицювання плиткою", "плитка на стіни"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_005",
    name: "Затирка швів плитки",
    category: "finishing",
    unit: "м²",
    laborRate: 95,
    timePerUnit: 0.2,
    complexity: "simple",
    requiredSkills: ["плиточник"],
    searchKeywords: ["затирка швів", "фугування"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_006",
    name: "Монтаж ламінату",
    category: "finishing",
    unit: "м²",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "simple",
    requiredSkills: ["паркетник"],
    searchKeywords: ["монтаж ламінату", "укладання ламінату"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_007",
    name: "Укладання лінолеуму",
    category: "finishing",
    unit: "м²",
    laborRate: 185,
    timePerUnit: 0.3,
    complexity: "simple",
    requiredSkills: ["підлоговик"],
    searchKeywords: ["укладання лінолеуму", "монтаж лінолеуму"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_008",
    name: "Монтаж плінтусів підлогових",
    category: "finishing",
    unit: "м.п.",
    laborRate: 65,
    timePerUnit: 0.12,
    complexity: "simple",
    requiredSkills: ["оздоблювач"],
    searchKeywords: ["монтаж плінтусів", "установка плінтусів"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_009",
    name: "Монтаж плінтусів стельових",
    category: "finishing",
    unit: "м.п.",
    laborRate: 85,
    timePerUnit: 0.15,
    complexity: "simple",
    requiredSkills: ["оздоблювач"],
    searchKeywords: ["монтаж багету", "стельовий плінтус"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_010",
    name: "Монтаж дверей міжкімнатних",
    category: "finishing",
    unit: "шт",
    laborRate: 1450,
    timePerUnit: 2.5,
    complexity: "medium",
    requiredSkills: ["столяр"],
    searchKeywords: ["монтаж дверей", "установка міжкімнатних дверей"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_011",
    name: "Монтаж вхідних дверей",
    category: "finishing",
    unit: "шт",
    laborRate: 2850,
    timePerUnit: 4,
    complexity: "complex",
    requiredSkills: ["столяр"],
    searchKeywords: ["монтаж вхідних дверей", "установка металевих дверей"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_012",
    name: "Монтаж вікон металопластикових",
    category: "finishing",
    unit: "шт",
    laborRate: 1850,
    timePerUnit: 3,
    complexity: "complex",
    requiredSkills: ["монтажник вікон"],
    searchKeywords: ["монтаж вікон", "установка металопластикових вікон"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_013",
    name: "Монтаж підвіконня",
    category: "finishing",
    unit: "м.п.",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "simple",
    requiredSkills: ["монтажник вікон"],
    searchKeywords: ["монтаж підвіконня", "установка підвіконня"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_014",
    name: "Влаштування стяжки підлоги",
    category: "finishing",
    unit: "м²",
    laborRate: 380,
    timePerUnit: 0.5,
    complexity: "medium",
    requiredSkills: ["бетонщик"],
    searchKeywords: ["стяжка підлоги", "влаштування стяжки"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_015",
    name: "Наливна підлога",
    category: "finishing",
    unit: "м²",
    laborRate: 285,
    timePerUnit: 0.4,
    complexity: "medium",
    requiredSkills: ["підлоговик"],
    searchKeywords: ["наливна підлога", "самовирівнююча підлога"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_016",
    name: "Поклейка шпалер",
    category: "finishing",
    unit: "м²",
    laborRate: 185,
    timePerUnit: 0.3,
    complexity: "simple",
    requiredSkills: ["маляр"],
    searchKeywords: ["поклейка шпалер", "поклейка обоїв"],
    lastUpdated: "2026-04-08"
  },
  {
    id: "work_finish_017",
    name: "Декоративна штукатурка",
    category: "finishing",
    unit: "м²",
    laborRate: 480,
    timePerUnit: 0.8,
    complexity: "complex",
    requiredSkills: ["штукатур-декоратор"],
    searchKeywords: ["декоративна штукатурка", "венеціанська штукатурка"],
    lastUpdated: "2026-04-08"
  },
];

/**
 * Отримати роботи за категорією
 */
export function getWorkItemsByCategory(category: string): WorkItemWithPrice[] {
  return WORK_ITEMS_DATABASE.filter(w => w.category === category);
}

/**
 * Знайти роботу за назвою
 */
export function findWorkItemByName(name: string): WorkItemWithPrice | undefined {
  const normalized = name.toLowerCase();
  return WORK_ITEMS_DATABASE.find(w =>
    w.name.toLowerCase().includes(normalized) ||
    w.searchKeywords.some(k => k.toLowerCase().includes(normalized))
  );
}

/**
 * Статистика бази робіт
 */
export function getWorkItemsStats() {
  const byCategory = WORK_ITEMS_DATABASE.reduce((acc, w) => {
    acc[w.category] = (acc[w.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: WORK_ITEMS_DATABASE.length,
    byCategory,
    lastUpdated: WORK_ITEMS_DATABASE[0]?.lastUpdated || "N/A"
  };
}
