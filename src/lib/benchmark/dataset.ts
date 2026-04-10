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
      // Estimated from the reference: 150 m² floor + 268.9 m² walls => ~150 m².
      totalArea: 150,
      notes:
        'Офіс ARMET. Перегородки з газоблоку, ГКЛ, штукатурка, шпаклівка, ' +
        'фарбування, натяжна стеля, ЛДСП панелі, дизайнерські світильники.',
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
      totalArea: 95,
      notes:
        'Sky Bank Львів — відділення. Малярні роботи, плиточні, стеля Грильято, ' +
        'електромонтажні + сантехнічні. ПДВ 20%.',
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
      totalArea: 290,
      notes:
        'Охматдит, 5-й поверх, відділення офтальмології. Реконструкція. ' +
        'Демонтаж, мурування цеглою, плитка, мед. вініл/лінолеум, стеля Армстронг, ' +
        'скляні перегородки антипаніка.',
    },
    expectations: {
      grandTotalUah: 1_253_903,
      grandTotalToleranceFraction: 0.35,
      minSections: 5,
      minItems: 60,
    },
  },
];
