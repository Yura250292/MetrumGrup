// Типи для детального wizard опитувальника

export type ObjectType = 'house' | 'townhouse' | 'apartment' | 'office' | 'commercial';

export type WorkScope =
  | 'foundation_only'
  | 'foundation_walls'
  | 'foundation_walls_roof'
  | 'full_cycle'
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
    };

    // Опалення
    heating: {
      type: 'gas' | 'electric' | 'solid_fuel' | 'heat_pump' | 'none';
      radiators?: number;
      underfloor?: boolean;
      underfloorArea?: string;
      boilerPower?: number; // кВт
    };

    // Водопостачання
    water: {
      coldWater: boolean;
      hotWater: boolean;
      source: 'central' | 'well' | 'borehole';
      boilerType?: 'gas' | 'electric' | 'none';
      boilerVolume?: number; // літри
    };

    // Каналізація
    sewerage: {
      type: 'central' | 'septic' | 'treatment';
      pumpNeeded: boolean;
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
    // Стіни
    walls: {
      material: 'paint' | 'wallpaper' | 'tile' | 'panels' | 'mixed';
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
