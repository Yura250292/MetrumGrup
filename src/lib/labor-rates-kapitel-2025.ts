/**
 * Розцінки на будівельні роботи (тільки робота, без матеріалів)
 * Джерело: Прайс компанії KAPITEL від 08.09.2025
 * Локація: м. Львів, м. Івано-Франківськ
 * Контакт: +38 (093) 0 555 777, info@kapitel.ua
 */

export interface LaborRate {
  category: string;
  name: string;
  unit: string;
  price: number; // грн
  priceFrom?: boolean; // true якщо "від X грн"
  notes?: string;
}

export const LABOR_RATES_KAPITEL_2025: LaborRate[] = [
  // ============================================
  // САНТЕХНІЧНІ РОБОТИ
  // ============================================
  {
    category: 'Сантехніка',
    name: 'Монтаж та підключення теплої підлоги',
    unit: 'м²',
    price: 320
  },
  {
    category: 'Сантехніка',
    name: 'Монтаж труб сантехнічних',
    unit: 'т.',
    price: 1520
  },
  {
    category: 'Сантехніка',
    name: 'Влаштування штроб сантехнічних',
    unit: 'м/п',
    price: 190
  },
  {
    category: 'Сантехніка',
    name: 'Монтаж приборів сантехнічних',
    unit: 'т.',
    price: 650,
    priceFrom: true
  },
  {
    category: 'Сантехніка',
    name: 'Монтаж котла з підведенням труб',
    unit: 'т.',
    price: 3900
  },
  {
    category: 'Сантехніка',
    name: 'Монтаж і підключення радіаторів опалення',
    unit: 'т.',
    price: 1200
  },

  // ============================================
  // ЕЛЕКТРОМОНТАЖНІ РОБОТИ
  // ============================================
  {
    category: 'Електрика',
    name: 'Влаштування штроб для кабелю',
    unit: 'м/п',
    price: 85
  },
  {
    category: 'Електрика',
    name: 'Розведення електричної мережі',
    unit: 'т.',
    price: 230
  },
  {
    category: 'Електрика',
    name: 'Розведення мережі TV та IN',
    unit: 'т.',
    price: 450
  },
  {
    category: 'Електрика',
    name: 'Монтаж кабель-каналу',
    unit: 'од.',
    price: 980
  },
  {
    category: 'Електрика',
    name: 'Монтаж щитка розподільчого зовнішнього',
    unit: 'од.',
    price: 850
  },
  {
    category: 'Електрика',
    name: 'Монтаж щитка розподільчого внутрішнього',
    unit: 'од.',
    price: 1200
  },
  {
    category: 'Електрика',
    name: 'Монтаж розеток, вимикачів',
    unit: 'од.',
    price: 92
  },
  {
    category: 'Електрика',
    name: 'Монтаж світлодіодної стрічки',
    unit: 'м/п',
    price: 140
  },
  {
    category: 'Електрика',
    name: 'Монтаж світильників',
    unit: 'од.',
    price: 350,
    priceFrom: true
  },

  // ============================================
  // ОЗДОБЛЮВАЛЬНІ РОБОТИ - ПІДЛОГА
  // ============================================
  {
    category: 'Оздоблення - Підлога',
    name: 'Заливання стяжки (до 5-ти см)',
    unit: 'м²',
    price: 290
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Заливання підлоги наливної',
    unit: 'м²',
    price: 420
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Монтаж плит OSB',
    unit: 'м²',
    price: 235
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Вкладання ламінату',
    unit: 'м²',
    price: 300
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Вкладання паркетної дошки (на вільний хід)',
    unit: 'м²',
    price: 310
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Вкладання паркетної дошки (на клей)',
    unit: 'м²',
    price: 410
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Монтаж плінтуса пластикового',
    unit: 'м/п',
    price: 110
  },
  {
    category: 'Оздоблення - Підлога',
    name: 'Монтаж плінтуса MDF',
    unit: 'м/п',
    price: 210
  },

  // ============================================
  // ОЗДОБЛЮВАЛЬНІ РОБОТИ - СТІНИ/ПЕРЕГОРОДКИ
  // ============================================
  {
    category: 'Оздоблення - Стіни',
    name: 'Штукатурення стін',
    unit: 'м²',
    price: 295
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Монтаж перегородки з ГКЛ',
    unit: 'м²',
    price: 570
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Мурування перегородки з газоблоку',
    unit: 'м²',
    price: 430
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Мурування перегородки 1/2 цегли',
    unit: 'м²',
    price: 650
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Поклейка ГКЛ',
    unit: 'м²',
    price: 295
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Грунтування',
    unit: 'м²',
    price: 38
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Армування стін сіткою',
    unit: 'м²',
    price: 160
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Перетяжка газоблоку клеєм',
    unit: 'м²',
    price: 150
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Шпаклювання стін триразове під фарбування',
    unit: 'м²',
    price: 325
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Фарбування стель та стін',
    unit: 'м²',
    price: 135
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Поклейка шпалер',
    unit: 'м²',
    price: 250,
    priceFrom: true
  },
  {
    category: 'Оздоблення - Стіни',
    name: 'Декоративна штукатурка',
    unit: 'м²',
    price: 450,
    priceFrom: true
  },

  // ============================================
  // ОЗДОБЛЮВАЛЬНІ РОБОТИ - СТЕЛЯ
  // ============================================
  {
    category: 'Оздоблення - Стеля',
    name: 'Штукатурення стелі',
    unit: 'м²',
    price: 310
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Монтаж стелі з ГКЛ',
    unit: 'м²',
    price: 470
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Монтаж стелі з ГКЛ в 2 шари',
    unit: 'м²',
    price: 590
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Монтаж прямого короба з ГКЛ',
    unit: 'м/п',
    price: 470
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Монтаж ніші з ГКЛ',
    unit: 'м/п',
    price: 470
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Монтаж тіньового профілю',
    unit: 'м/п',
    price: 300,
    priceFrom: true
  },
  {
    category: 'Оздоблення - Стеля',
    name: 'Фарбування короба',
    unit: 'м/п',
    price: 135
  },

  // ============================================
  // ПЛИТКОВІ РОБОТИ
  // ============================================
  {
    category: 'Плиткові роботи',
    name: 'Вкладання плитки',
    unit: 'м²',
    price: 870,
    priceFrom: true
  },
  {
    category: 'Плиткові роботи',
    name: 'Вкладання фризу декоративного',
    unit: 'м/п',
    price: 370,
    priceFrom: true
  },
  {
    category: 'Плиткові роботи',
    name: 'Вирізання отворів в плитці',
    unit: 'од.',
    price: 235
  },
  {
    category: 'Плиткові роботи',
    name: 'Зарізання кута 45° з плитки',
    unit: 'м/п',
    price: 290
  },
  {
    category: 'Плиткові роботи',
    name: 'Вкладання плінтуса керамічного',
    unit: 'м/п',
    price: 290
  },

  // ============================================
  // ДОДАТКОВІ ЕЛЕМЕНТИ
  // ============================================
  {
    category: 'Додаткові елементи',
    name: 'Монтаж підвіконників пластикових',
    unit: 'м/п',
    price: 420
  },
  {
    category: 'Додаткові елементи',
    name: 'Закладання кутника зовнішнього',
    unit: 'м/п',
    price: 95
  },
  {
    category: 'Додаткові елементи',
    name: 'Закладання кутника внутрішнього',
    unit: 'м/п',
    price: 115
  },
  {
    category: 'Додаткові елементи',
    name: 'Закладання кутника арочного',
    unit: 'м/п',
    price: 130
  },
  {
    category: 'Додаткові елементи',
    name: 'Закидання штроб для дротів',
    unit: 'м/п',
    price: 68
  },
  {
    category: 'Додаткові елементи',
    name: 'Закидання штроб сантехнічних',
    unit: 'м/п',
    price: 190
  },
  {
    category: 'Додаткові елементи',
    name: 'Монтаж трекової системи',
    unit: 'м/п',
    price: 1550,
    priceFrom: true
  },
  {
    category: 'Додаткові елементи',
    name: 'Поклейка багет та молдингу',
    unit: 'м/п',
    price: 250,
    priceFrom: true
  },

  // ============================================
  // ДОДАТКОВІ РОБОТИ
  // ============================================
  {
    category: 'Додаткові роботи',
    name: 'Винесення будівельного сміття',
    unit: 'т/пов.',
    price: 260
  },
  {
    category: 'Додаткові роботи',
    name: 'Доставка матеріалів на поверх',
    unit: 'т/пов.',
    price: 325
  }
];

/**
 * Пошук розцінки на роботу
 */
export function findLaborRate(workName: string): LaborRate | null {
  const searchTerm = workName.toLowerCase();

  return LABOR_RATES_KAPITEL_2025.find(rate =>
    rate.name.toLowerCase().includes(searchTerm) ||
    searchTerm.includes(rate.name.toLowerCase().split(' ')[0]) // перше слово
  ) || null;
}

/**
 * Отримати всі роботи по категорії
 */
export function getLaborRatesByCategory(category: string): LaborRate[] {
  return LABOR_RATES_KAPITEL_2025.filter(rate =>
    rate.category.toLowerCase().includes(category.toLowerCase())
  );
}

/**
 * Розрахувати вартість роботи
 */
export function calculateLaborCost(
  workName: string,
  quantity: number,
  unit: string
): { cost: number; rate: LaborRate | null } {
  const rate = findLaborRate(workName);

  if (!rate) {
    return { cost: 0, rate: null };
  }

  // Перевірка одиниць виміру
  if (rate.unit !== unit && !unit.includes(rate.unit)) {
    console.warn(`⚠️ Одиниці виміру не співпадають: очікується ${rate.unit}, отримано ${unit}`);
  }

  return {
    cost: quantity * rate.price,
    rate
  };
}

/**
 * Статистика по розцінках
 */
export function getLaborRatesStats() {
  const categories = [...new Set(LABOR_RATES_KAPITEL_2025.map(r => r.category))];

  return {
    total: LABOR_RATES_KAPITEL_2025.length,
    categories: categories.length,
    categoryBreakdown: categories.map(cat => ({
      category: cat,
      count: LABOR_RATES_KAPITEL_2025.filter(r => r.category === cat).length,
      avgPrice: Math.round(
        LABOR_RATES_KAPITEL_2025
          .filter(r => r.category === cat)
          .reduce((sum, r) => sum + r.price, 0) /
        LABOR_RATES_KAPITEL_2025.filter(r => r.category === cat).length
      )
    })),
    priceRange: {
      min: Math.min(...LABOR_RATES_KAPITEL_2025.map(r => r.price)),
      max: Math.max(...LABOR_RATES_KAPITEL_2025.map(r => r.price)),
      avg: Math.round(
        LABOR_RATES_KAPITEL_2025.reduce((sum, r) => sum + r.price, 0) /
        LABOR_RATES_KAPITEL_2025.length
      )
    }
  };
}
