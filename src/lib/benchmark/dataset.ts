/**
 * Benchmark dataset (Plan Stage 9.1).
 *
 * Three real reference cases from `teach/{1,2,3}` plus a sample-only entry
 * for `teach/Зразок/`. Each case bundles:
 *   • a name and stable id;
 *   • the path to a PDF design plan (input that an estimator would receive);
 *   • the path to the ground-truth XLSX estimate (what the company actually
 *     billed for);
 *   • coarse `wizardData` we can hand to the AI generator so it has the same
 *     starting context the human estimator had;
 *   • optional `expectations` — known totals or section names so the runner
 *     can short-circuit on obvious failures.
 *
 * The runner accepts either the path to an existing AI-generated estimate
 * JSON (so we can re-run metrics without re-generating) or a generator
 * function that produces one fresh.
 */

import * as path from 'path';

const TEACH_ROOT = path.resolve(process.cwd(), '..', 'teach');

/**
 * Verified facts extracted by hand from the PDF design plans (експлікація
 * приміщень). These are the "ground truth" inputs an AI generator should be
 * able to reach if it parses the same PDF — anything missing is a real gap.
 */
export interface VerifiedFacts {
  /** Total area in m², from експлікація приміщень. */
  totalAreaM2: number;
  /** Ceiling height in mm, from обмірний план. */
  ceilingHeightMm?: number;
  /** Number of distinct rooms (excluding stairwells / shafts). */
  roomCount?: number;
  /** Per-room breakdown: name + area in m². */
  rooms?: Array<{ name: string; areaM2: number }>;
  /** Number of bathrooms / wet zones. */
  bathroomCount?: number;
  /** Whether demolition of existing partitions is required. */
  demolitionRequired?: boolean;
  /** Whether new partitions are added. */
  newPartitions?: boolean;
  /** Designer / studio name. */
  designStudio?: string;
  /** Plan issue date (ISO). */
  planDate?: string;
  /** Free-form notes about quirks of this project. */
  notes?: string;
}

export interface BenchmarkCase {
  id: string;
  name: string;
  /** Type of object (commercial / office / hospital / ...). */
  objectType: 'commercial' | 'office' | 'apartment' | 'house' | 'townhouse' | 'medical';
  /** Free-form description used in prompts. */
  description: string;
  /** Path to the PDF plan/album. Optional — some cases have no PDF. */
  planPdfPath?: string;
  /** Path to the ground-truth XLSX estimate. Required. */
  referenceXlsxPath: string;
  /** Coarse wizard input passed to the AI generator. */
  wizardData: {
    objectType: string;
    workScope: string;
    totalArea: number;
    floors?: number;
    notes?: string;
  };
  /** Verified data hand-extracted from the PDF. Used for parser comparison. */
  verifiedFacts?: VerifiedFacts;
  /** Optional sanity expectations for the runner. */
  expectations?: {
    grandTotalUah?: number;
    grandTotalToleranceFraction?: number; // e.g. 0.30 means ±30%
    minSections?: number;
    minItems?: number;
  };
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'armet-office-lubinska',
    name: 'ARMET офіс на Любінській, Львів',
    objectType: 'office',
    description:
      'Будівельно-ремонтні роботи в приміщенні офісу компанії ARMET. ' +
      'Чорнові + чистові роботи, перегородки з газоблоку, ' +
      'натяжна стеля + Грильято, ЛДСП панелі, кам\'яний шпон, ' +
      'промислове освітлення, дизайнерські люстри.',
    planPdfPath: path.join(
      TEACH_ROOT,
      '1',
      'Дизайн_проєкт_офісу_ARMET_Альбом_креслень_2025_08_19.pdf'
    ),
    referenceXlsxPath: path.join(TEACH_ROOT, '1', 'попередній_кошторис_офіс_Любінська,6.xlsx'),
    wizardData: {
      objectType: 'office',
      workScope: 'renovation',
      totalArea: 150.6, // verified from експлікація приміщень, аркуш 02
      notes:
        'Офіс ARMET, 12 приміщень. Перегородки з газоблоку та ГКЛ, штукатурка, ' +
        'шпаклівка, фарбування, натяжна стеля, плитка Грильято, ЛДСП панелі, ' +
        'кам\'яний шпон. Вентустановки 1700×1160×400, керамічна сантехніка ' +
        '(Geberit Sigma 20, Simas Henger HE18). Висота 3010 мм.',
    },
    verifiedFacts: {
      totalAreaM2: 150.6,
      ceilingHeightMm: 3010,
      roomCount: 12,
      bathroomCount: 1,
      demolitionRequired: true, // 1 partition demolition only
      newPartitions: true,
      designStudio: 'TOTO Architects',
      planDate: '2025-08-19',
      rooms: [
        { name: 'Кімната очікування', areaM2: 16.35 },
        { name: 'Коридор', areaM2: 17.04 },
        { name: 'Гардеробна', areaM2: 4.15 },
        { name: 'Санвузол', areaM2: 1.76 },
        { name: 'Відділ продажів', areaM2: 24.81 },
        { name: 'Фінансовий відділ', areaM2: 21.15 },
        { name: 'Кабінет CFO', areaM2: 7.03 },
        { name: 'Кімната для нарад', areaM2: 14.18 },
        { name: 'Технічне приміщення', areaM2: 2.49 },
        { name: 'Архів', areaM2: 3.38 },
        { name: 'Кухня', areaM2: 8.51 },
        { name: 'Кабінет керівництва', areaM2: 29.75 },
      ],
      notes:
        '6 скляних перегородок (СП-01..06), 4 двері прихованого монтажу, ' +
        'натяжна стеля + Грильято в окремих зонах, дизайнерські люстри ' +
        '(Nordlux, Pikart, Tube chandelier).',
    },
    expectations: {
      grandTotalUah: 2_102_923,
      grandTotalToleranceFraction: 0.35,
      minSections: 3,
      minItems: 70,
    },
  },
  {
    id: 'sky-bank-lviv',
    name: 'Sky Bank Львів — відділення',
    objectType: 'commercial',
    description:
      'Ремонтні роботи в приміщенні Sky Bank Львів. Малярні роботи, ' +
      'плитка, стеля Грильято, повний цикл електрики і сантехніки.',
    planPdfPath: path.join(TEACH_ROOT, '2', 'Sky BANK ЛЬВІВ - Sky Bank.pdf'),
    referenceXlsxPath: path.join(TEACH_ROOT, '2', 'Попередній кошторис _SKY BANK Львів.xlsx'),
    wizardData: {
      objectType: 'commercial',
      workScope: 'renovation',
      totalArea: 92.25, // verified: 89.00 main hall + 3.25 bathroom
      notes:
        'Sky Bank Львів — банківське відділення. Існуюча будівля з газоблоку + ' +
        'червона цегла + бетонні несучі. Висота 3545 мм. Чорнова бетонна стеля ' +
        '(потрібна повна обробка). 1 санвузол. Стеля Грильято, килимова плитка. ' +
        'Дизайнер: Ірина Герус. ПДВ 20%.',
    },
    verifiedFacts: {
      totalAreaM2: 92.25,
      ceilingHeightMm: 3545,
      roomCount: 2,
      bathroomCount: 1,
      demolitionRequired: false,
      newPartitions: false,
      designStudio: 'Ірина Герус',
      planDate: '2025-06-26',
      rooms: [
        { name: 'Основний зал', areaM2: 89.0 },
        { name: 'Вбиральня', areaM2: 3.25 },
      ],
      notes:
        'Стіни — газоблок + цегла. Висота вбиральні 3160 мм. Існують каналізаційний ' +
        'стояк, холодна/гаряча вода, електрощиток, радіатор, вентканал, пожежна сигналізація. ' +
        'З 3D обмірів видно — приміщення в чорновому стані.',
    },
    expectations: {
      grandTotalUah: 679_081,
      grandTotalToleranceFraction: 0.35,
      minSections: 5,
      minItems: 50,
    },
  },
  {
    id: 'okhmatdyt-ophthalmology',
    name: 'Охматдит — офтальмологія, 5-й поверх',
    objectType: 'medical',
    description:
      'Ремонтні роботи в Охматдиті, 5-й поверх (офтальмологія). ' +
      'Демонтаж, мурування цеглою, штукатурні + малярні, плитка, ' +
      'медичний лінолеум, стеля Армстронг, скляні перегородки, повна електрика і сантехніка.',
    planPdfPath: path.join(
      TEACH_ROOT,
      '3',
      '20250708_РОБОЧИЙ_ДИЗАЙН_ПРОЕКТ_ОХМАТДИТ_5_й_поверх_Офтальмологія.pdf'
    ),
    referenceXlsxPath: path.join(TEACH_ROOT, '3', 'Попередній_кошторис_Охматдит_корегований.xlsx'),
    wizardData: {
      objectType: 'commercial',
      workScope: 'renovation',
      totalArea: 334.18, // verified — was guessed as 290
      floors: 1, // 5-й поверх існуючої будівлі
      notes:
        'Львівська обласна дитяча клінічна лікарня (ОХМАТДИТ), 5-й поверх — ' +
        'відділення офтальмології. 18 приміщень: 6 палат + VIP палата, ізолятор, ' +
        'кабінети директора/медсестри, ортоптична (37.84 м²), маніпуляційна, ' +
        'оглядова, роздавальня, офіс персоналу. Реконструкція з демонтажем + ' +
        'муруванням цегли + новими дверними прорізами. Дитячий дизайн (5F Studio "Антей").',
    },
    verifiedFacts: {
      totalAreaM2: 334.18,
      roomCount: 18,
      bathroomCount: 1,
      demolitionRequired: true,
      newPartitions: true,
      designStudio: '5F Studio (проект "Антей")',
      planDate: '2025-07-21',
      rooms: [
        { name: 'Коридор', areaM2: 85.78 },
        { name: 'Санвузол', areaM2: 1.51 },
        { name: 'Роздавальня', areaM2: 10.39 },
        { name: 'Роздягальня персоналу', areaM2: 14.0 },
        { name: 'Офіс персоналу', areaM2: 15.29 },
        { name: 'Кабінет директора', areaM2: 11.26 },
        { name: 'Кабінет медсестри', areaM2: 5.15 },
        { name: 'Ортоптична кімната', areaM2: 37.84 },
        { name: 'Маніпуляційна кімната', areaM2: 16.31 },
        { name: 'Оглядова кімната', areaM2: 12.66 },
        { name: 'Палата №1', areaM2: 14.02 },
        { name: 'Палата №2', areaM2: 14.02 },
        { name: 'Палата VIP', areaM2: 18.36 },
        { name: 'Палата №4', areaM2: 14.78 },
        { name: 'Палата №5', areaM2: 11.46 },
        { name: 'Палата №6', areaM2: 14.62 },
        { name: 'Ізоляційна палата', areaM2: 10.55 },
        { name: 'Сходова клітка', areaM2: 16.18 },
      ],
      notes:
        'Реконструкція існуючої будівлі. Багато демонтажу перегородок + нові ' +
        'мурування цегли 1/2. Медичний вініл (зелений + тераццо), плитка в санвузлі ' +
        'та роздавальні, стеля Армстронг перфорована (292 м²), скляна перегородка ' +
        'антипаніка. Дитячий дизайн з кольоровим оздобленням і графіті.',
    },
    expectations: {
      grandTotalUah: 1_253_903,
      grandTotalToleranceFraction: 0.35,
      minSections: 5,
      minItems: 60,
    },
  },
];
