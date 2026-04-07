export enum DocumentType {
  // Існуючі типи
  ARCHITECTURAL_PLAN = 'architectural_plan',
  SPECIFICATION = 'specification',

  // Нові типи документів
  SITE_PLAN = 'site_plan',               // План ділянки
  TOPOGRAPHY = 'topography',             // Топографія
  GEOLOGICAL_REPORT = 'geological',       // Геологія
  PROJECT_REVIEW = 'review',              // Рецензія
  SITE_PHOTOS = 'photos',                 // Фото
  MASTER_PLAN = 'master_plan',            // Генплан
  LANDSCAPING = 'landscaping',            // Благоустрій
  NETWORKS_SCHEME = 'networks',           // Схеми мереж
  UNKNOWN = 'unknown'
}

export interface DocumentKeywords {
  [key: string]: string[];
}

export const DOCUMENT_KEYWORDS: DocumentKeywords = {
  [DocumentType.SITE_PLAN]: [
    'план ділянки', 'site plan', 'ситуаційний план', 'ситуація',
    'топоплан', 'топографічний', 'topography', 'топо',
    'межі ділянки', 'земельна ділянка'
  ],

  [DocumentType.GEOLOGICAL_REPORT]: [
    'геологія', 'geology', 'геологічний', 'geological',
    'інженерно-геологічні', 'вишукування', 'геологічний розріз',
    'ігі', 'igi', 'ґрунт', 'soil', 'несуча здатність',
    'рівень підземних вод', 'угв', 'gwl'
  ],

  [DocumentType.PROJECT_REVIEW]: [
    'рецензія', 'review', 'експертиза', 'expertise',
    'зауваження', 'comments', 'висновок експерта',
    'державна експертиза', 'приватна експертиза'
  ],

  [DocumentType.SITE_PHOTOS]: [
    'фото', 'photo', 'світлина', 'будмайданчик',
    'site', 'місцевість', 'terrain', 'location'
  ],

  [DocumentType.MASTER_PLAN]: [
    'генплан', 'master plan', 'plan', 'схема генплану',
    'розташування будівлі', 'ситуаційний план'
  ],

  [DocumentType.LANDSCAPING]: [
    'благоустрій', 'landscaping', 'озеленення',
    'доріжки', 'paths', 'паркування', 'parking'
  ],

  [DocumentType.NETWORKS_SCHEME]: [
    'мережі', 'networks', 'схема мереж', 'комунікації',
    'водопостачання', 'каналізація', 'електропостачання',
    'зовнішні мережі', 'external networks'
  ],

  [DocumentType.SPECIFICATION]: [
    'специф', 'spec', 'технолог', 'інструкц',
    'instruction', 'вимог', 'requirement'
  ],

  [DocumentType.ARCHITECTURAL_PLAN]: [
    'план', 'plan', 'креслення', 'drawing',
    'архітектурний', 'architectural', 'поверх', 'floor'
  ]
};
