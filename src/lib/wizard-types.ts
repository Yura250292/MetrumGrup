// Типи для детального wizard опитувальника

export type ObjectType = 'house' | 'townhouse' | 'apartment' | 'office' | 'commercial';

export type WorkScope =
  | 'foundation_only'
  | 'foundation_walls'
  | 'foundation_walls_roof'
  | 'full_cycle'
  | 'reconstruction'  // Демонтаж + нове будівництво (для комерційних)
  | 'renovation';

export type RenovationStage =
  | 'bare_concrete' // Голий бетон
  | 'rough_walls' // Чорнова штукатурка є
  | 'rough_floor' // Чорнова стяжка є
  | 'utilities_installed' // Комунікації встановлені
  | 'ready_for_finish'; // Готово під чистове

export interface WizardData {
  // Крок 0: Тип об'єкта
  objectType: ObjectType;

  // Крок 1: Обсяг робіт
  workScope: WorkScope;

  // Загальні дані
  totalArea: string;
  floors: number;
  ceilingHeight: string;

  // Для будинку/котеджу
  houseData?: {
    // Поточний стан будівлі
    currentState:
      | 'greenfield' // Чиста ділянка (будівництво з нуля)
      | 'foundation_only' // Є фундамент
      | 'shell' // Коробка (фундамент + стіни + дах)
      | 'rough_utilities' // Коробка + комунікації прокладені
      | 'existing_building'; // Існуюча будівля (реконструкція)

    // Чи потрібен демонтаж? (КРИТИЧНО для запобігання зайвих позицій)
    demolitionRequired?: boolean;
    demolitionDescription?: string; // Опис що саме демонтувати

    // Місцевість та підготовка
    terrain: {
      soilType: 'clay' | 'sand' | 'rock' | 'mixed' | 'unknown';
      groundwaterDepth: 'shallow' | 'medium' | 'deep' | 'unknown';
      slope: 'flat' | 'slight' | 'steep';
      needsExcavation: boolean;
      needsDrainage: boolean;
    };

    // Фундамент
    foundation?: {
      type: 'strip' | 'slab' | 'pile' | 'combined';
      depth: string; // метри
      width: string; // метри
      reinforcement: 'light' | 'standard' | 'heavy';
      waterproofing: boolean;
      insulation: boolean;
      insulationThickness?: number; // мм
    };

    // Стіни
    walls?: {
      material: 'gasblock' | 'brick' | 'wood' | 'panel' | 'monolith';
      thickness: string; // мм
      insulation: boolean;
      insulationType?: 'foam' | 'mineral' | 'ecowool';
      insulationThickness?: number; // мм
      hasLoadBearing: boolean;
      partitionMaterial: 'gasblock' | 'brick' | 'gypsum' | 'same';
    };

    // Дах
    roof?: {
      type: 'pitched' | 'flat' | 'mansard' | 'combined';
      pitchAngle?: number; // градуси
      material: 'metal_tile' | 'soft_tile' | 'profiled_sheet' | 'ceramic' | 'slate';
      insulation: boolean;
      insulationThickness?: number; // мм
      attic: 'cold' | 'warm' | 'living';
      gutterSystem: boolean;
      roofWindows: number;
    };

    // Додаткові приміщення
    hasBasement: boolean;
    basementArea?: string;
    hasAttic: boolean;
    atticArea?: string;
    hasGarage: boolean;
    garageArea?: string;
    garageType?: 'attached' | 'detached';
  };

  // Для котеджу (таунхаус)
  townhouseData?: {
    // Поточний стан будівлі (такий самий як у будинку)
    currentState:
      | 'greenfield'
      | 'foundation_only'
      | 'shell'
      | 'rough_utilities'
      | 'existing_building';

    // Чи потрібен демонтаж? (КРИТИЧНО для запобігання зайвих позицій)
    demolitionRequired?: boolean;
    demolitionDescription?: string; // Опис що саме демонтувати

    adjacentWalls: number; // Кількість суміжних стін (1-2)
    isEndUnit: boolean; // Крайній в ряді
    sharedUtilities: boolean; // Спільні комунікації
    // + всі дані як у будинку
    houseData?: WizardData['houseData'];
  };

  // Для квартири/офісу/комерції
  renovationData?: {
    // Поточний стан
    currentStage: RenovationStage;

    // Наявність елементів
    existing: {
      roughPlaster: boolean; // Чорнова штукатурка
      roughFloor: boolean; // Чорнова стяжка
      finishFloor: boolean; // Чистова підлога
      electricalRoughIn: boolean; // Електрика прокладена
      plumbingRoughIn: boolean; // Сантехніка прокладена
      heatingRoughIn: boolean; // Опалення прокладене
      windowsInstalled: boolean; // Вікна встановлені
      doorsInstalled: boolean; // Двері встановлені
    };

    // Що потрібно зробити
    workRequired: {
      demolition: boolean;
      roughPlaster: boolean;
      roughFloor: boolean;
      electrical: boolean;
      plumbing: boolean;
      heating: boolean;
      finishPlaster: boolean;
      painting: boolean;
      flooring: boolean;
      tiling: boolean;
      ceiling: 'paint' | 'drywall' | 'suspended' | 'stretch' | 'none';
      windows: boolean;
      doors: boolean;
    };

    // Планування
    layoutChange: boolean; // Зміна планування
    newPartitions: boolean; // Нові перегородки
    newPartitionsLength?: string; // м.п.

    // Кімнати
    rooms: {
      bedrooms: number;
      bathrooms: number;
      kitchen: number;
      living: number;
      other: number;
    };
  };

  // Для комерційного приміщення
  commercialData?: {
    purpose: 'shop' | 'restaurant' | 'warehouse' | 'production' | 'showroom' | 'other';

    // Поточний стан (для нового будівництва / реконструкції)
    currentState?:
      | 'greenfield' // Чиста ділянка (будівництво з нуля)
      | 'existing_building' // Існуюча будівля (потрібен демонтаж)
      | 'existing_renovation'; // Існуюче приміщення (тільки ремонт)

    // Чи потрібен демонтаж існуючої будівлі?
    demolitionRequired?: boolean;
    demolitionDescription?: string; // Опис що саме демонтувати

    // Промислова специфікація
    floor: {
      type: 'industrial' | 'standard';
      coating?: 'epoxy' | 'polyurethane' | 'tile' | 'concrete' | 'other';
      loadCapacity?: number; // кг/м²
      antiStatic: boolean;
    };

    // Додаткові вимоги
    fireRating: boolean; // Протипожежні вимоги
    hvac: boolean; // Потужна вентиляція
    heavyDutyElectrical: boolean; // Підвищене навантаження
    accessControl: boolean; // Контроль доступу
    surveillance: boolean; // Відеоспостереження
  };

  // Інженерні системи (для всіх типів)
  utilities: {
    // Електрика
    electrical: {
      power: 'single_phase' | 'three_phase';
      capacity?: number; // кВт
      outlets: number;
      switches: number;
      lightPoints: number;
      outdoorLighting: boolean;
      // Підключення електрики (для нових будівель)
      needsConnection?: boolean; // Чи потрібен підвід від вулиці
      connectionDistance?: number; // Відстань в метрах
      needsTransformer?: boolean; // Чи потрібна трансформаторна підстанція
    };

    // Опалення
    heating: {
      type: 'gas' | 'electric' | 'solid_fuel' | 'heat_pump' | 'none';
      radiators?: number;
      underfloor?: boolean;
      underfloorArea?: string;
      boilerPower?: number; // кВт
      // Підключення газу (якщо тип 'gas')
      needsGasConnection?: boolean; // Чи потрібен підвід газу
      gasConnectionDistance?: number; // Відстань в метрах
    };

    // Водопостачання
    water: {
      coldWater: boolean;
      hotWater: boolean;
      source: 'central' | 'well' | 'borehole';
      boilerType?: 'gas' | 'electric' | 'none';
      boilerVolume?: number; // літри
      // Підключення води
      needsConnection?: boolean; // Чи потрібен підвід від вулиці
      connectionDistance?: number; // Відстань в метрах
      needsPump?: boolean; // Чи потрібна насосна станція
    };

    // Каналізація
    sewerage: {
      type: 'central' | 'septic' | 'treatment';
      pumpNeeded: boolean;
      // Підключення каналізації
      needsConnection?: boolean; // Чи потрібен підвід до вулиці
      connectionDistance?: number; // Відстань в метрах
      needsLift?: boolean; // Чи потрібна каналізаційна підіймальна установка
    };

    // Вентиляція
    ventilation: {
      natural: boolean;
      forced: boolean;
      recuperation: boolean;
      areas?: string[]; // Приміщення
    };
  };

  // Оздоблення
  finishing: {
    // Підготовчі роботи (для квартир/будинків)
    preparation?: {
      needsSpackle?: boolean; // Чи потрібна шпаклівка
      spackleType?: 'basic' | 'full'; // Базова або повна
      spackleArea?: number; // м²
    };

    // Стіни
    walls: {
      material: 'paint' | 'wallpaper' | 'tile' | 'panels' | 'mixed' | 'industrial_paint' | 'concrete_finish';
      qualityLevel: 'economy' | 'standard' | 'premium';
      tileArea?: number; // м²
    };

    // Підлога
    flooring: {
      tile?: number; // м²
      laminate?: number;
      parquet?: number;
      vinyl?: number;
      carpet?: number;
      epoxy?: number; // для промислової
    };

    // Стеля
    ceiling: {
      type: 'paint' | 'drywall' | 'suspended' | 'stretch';
      levels: 1 | 2 | 3;
      lighting: 'spots' | 'chandelier' | 'led' | 'mixed';
    };
  };

  // Вікна та двері
  openings?: {
    windows: {
      count: number;
      totalArea?: number; // м²
      type: 'plastic' | 'wood' | 'aluminum';
      glazing: 'single' | 'double' | 'triple';
    };

    doors: {
      entrance: number;
      interior: number;
      type: 'standard' | 'premium';
    };
  };

  // Особливі вимоги
  specialRequirements?: string;

  // Бюджет
  budgetRange?: 'economy' | 'standard' | 'premium' | 'luxury';
}
