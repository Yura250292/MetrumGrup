/**
 * Specification Parser
 * Витягує ключову інформацію з технічних специфікацій (400-500 сторінок)
 */

export interface SpecificationData {
  materials: SpecMaterial[];
  methods: SpecMethod[];
  requirements: SpecRequirement[];
  summary: string;
}

export interface SpecMaterial {
  name: string;
  brand?: string;
  model?: string;
  specifications?: string;
  quantity?: string;
  unit?: string;
  notes?: string;
}

export interface SpecMethod {
  operation: string; // "Монтаж розетки", "Укладка плитки"
  tools: string[]; // ["Перфоратор", "Рівень"]
  materials: string[]; // ["Дюбель 6×40", "Клеми WAGO"]
  steps: string[]; // Покрокова інструкція
  standards?: string; // "ДСТУ-Н Б В.2.5-85:2013"
}

export interface SpecRequirement {
  category: string; // "Електрика", "Сантехніка"
  requirement: string;
  standard?: string;
  critical: boolean;
}

/**
 * Аналізує текст специфікації та витягує структуровану інформацію
 */
export function parseSpecificationText(text: string): SpecificationData {
  const materials: SpecMaterial[] = [];
  const methods: SpecMethod[] = [];
  const requirements: SpecRequirement[] = [];

  // Split text into sections
  const sections = splitIntoSections(text);

  // Extract materials
  const materialSection = sections.find(
    (s) =>
      s.title?.toLowerCase().includes('матеріал') ||
      s.title?.toLowerCase().includes('специфікац')
  );
  if (materialSection) {
    materials.push(...extractMaterials(materialSection.content));
  }

  // Extract methods and instructions
  const methodSection = sections.find(
    (s) =>
      s.title?.toLowerCase().includes('монтаж') ||
      s.title?.toLowerCase().includes('технологія') ||
      s.title?.toLowerCase().includes('інструкц')
  );
  if (methodSection) {
    methods.push(...extractMethods(methodSection.content));
  }

  // Extract requirements
  const reqSection = sections.find(
    (s) =>
      s.title?.toLowerCase().includes('вимог') ||
      s.title?.toLowerCase().includes('стандарт')
  );
  if (reqSection) {
    requirements.push(...extractRequirements(reqSection.content));
  }

  // Generate summary
  const summary = generateSummary({ materials, methods, requirements, summary: '' }, text.length);

  return {
    materials,
    methods,
    requirements,
    summary,
  };
}

function splitIntoSections(text: string): Array<{ title?: string; content: string }> {
  // Simple heuristic: look for UPPERCASE headers or numbered sections
  const sections: Array<{ title?: string; content: string }> = [];
  const lines = text.split('\n');

  let currentSection: { title?: string; content: string } = { content: '' };

  for (const line of lines) {
    // Detect section header (all caps, or starts with number)
    const isHeader =
      (line.trim().length > 5 && line.trim() === line.trim().toUpperCase()) ||
      /^\d+\./.test(line.trim());

    if (isHeader && currentSection.content.length > 100) {
      // Save previous section
      sections.push(currentSection);
      currentSection = { title: line.trim(), content: '' };
    } else {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

function extractMaterials(text: string): SpecMaterial[] {
  const materials: SpecMaterial[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Look for material patterns like:
    // "Газоблок AEROC D400 300х200х600 - 1500 шт"
    // "Кабель ВВГ-нг 3×2.5 мм² (100 м)"

    // Pattern: Name (optional specs) - quantity unit
    const match = line.match(/^[•\-\d\.]*\s*([А-Яа-яA-Za-z0-9\s×\(\)]+?)(?:\s+[-–]\s+(\d+[\.,\d]*)\s*([а-яa-z²³]+))?$/i);

    if (match) {
      const fullName = match[1]?.trim();
      const quantity = match[2];
      const unit = match[3];

      if (fullName && fullName.length > 5 && fullName.length < 150) {
        // Extract brand if present (UPPERCASE words)
        const brandMatch = fullName.match(/\b([A-Z]{3,})\b/);
        const brand = brandMatch ? brandMatch[1] : undefined;

        materials.push({
          name: fullName,
          brand,
          quantity,
          unit,
        });
      }
    }
  }

  return materials;
}

function extractMethods(text: string): SpecMethod[] {
  const methods: SpecMethod[] = [];

  // Look for numbered instructions
  const operations = text.split(/\n\d+\.\s+/).filter((s) => s.trim().length > 20);

  for (const op of operations) {
    const lines = op.split('\n').filter((l) => l.trim());
    if (lines.length === 0) continue;

    const operation = lines[0]?.trim() || '';
    const tools: string[] = [];
    const materials: string[] = [];
    const steps: string[] = [];
    let standards: string | undefined;

    for (const line of lines.slice(1)) {
      const lower = line.toLowerCase();

      // Detect tools
      if (
        lower.includes('інструмент') ||
        lower.includes('перфоратор') ||
        lower.includes('дриль') ||
        lower.includes('рівень')
      ) {
        tools.push(line.trim());
      }
      // Detect materials
      else if (
        lower.includes('матеріал') ||
        lower.includes('дюбель') ||
        lower.includes('кабель')
      ) {
        materials.push(line.trim());
      }
      // Detect standards
      else if (lower.includes('дсту') || lower.includes('дбн')) {
        const stdMatch = line.match(/(ДСТУ|ДБН)[^\s]*/i);
        if (stdMatch) standards = stdMatch[0];
      }
      // Otherwise it's a step
      else if (line.trim().length > 10) {
        steps.push(line.trim());
      }
    }

    if (operation.length > 5) {
      methods.push({
        operation,
        tools,
        materials,
        steps,
        standards,
      });
    }
  }

  return methods;
}

function extractRequirements(text: string): SpecRequirement[] {
  const requirements: SpecRequirement[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Critical requirements contain keywords
    const critical =
      lower.includes('обов\'язково') ||
      lower.includes('необхідно') ||
      lower.includes('заборонено') ||
      lower.includes('не допускається');

    // Detect category
    let category = 'Загальні';
    if (lower.includes('електр')) category = 'Електрика';
    else if (lower.includes('сантех') || lower.includes('водопост')) category = 'Сантехніка';
    else if (lower.includes('опален')) category = 'Опалення';
    else if (lower.includes('вентил')) category = 'Вентиляція';
    else if (lower.includes('оздобл') || lower.includes('плитк')) category = 'Оздоблення';

    // Detect standards
    const stdMatch = line.match(/(ДСТУ|ДБН)[^\s]*/i);
    const standard = stdMatch ? stdMatch[0] : undefined;

    if (line.trim().length > 20) {
      requirements.push({
        category,
        requirement: line.trim(),
        standard,
        critical,
      });
    }
  }

  return requirements;
}

function generateSummary(data: SpecificationData, textLength: number): string {
  const pageCount = Math.ceil(textLength / 2500); // ~2500 chars per page
  let summary = `Специфікація на ${pageCount} сторінок.\n\n`;

  if (data.materials.length > 0) {
    summary += `📦 Матеріали: ${data.materials.length} позицій\n`;
    // Top 3 materials
    data.materials.slice(0, 3).forEach((m) => {
      summary += `  - ${m.name}${m.quantity ? ` (${m.quantity} ${m.unit})` : ''}\n`;
    });
    if (data.materials.length > 3) {
      summary += `  ... та ще ${data.materials.length - 3} позицій\n`;
    }
    summary += `\n`;
  }

  if (data.methods.length > 0) {
    summary += `🔧 Технологічні карти: ${data.methods.length} операцій\n`;
    data.methods.slice(0, 3).forEach((m) => {
      summary += `  - ${m.operation}\n`;
    });
    if (data.methods.length > 3) {
      summary += `  ... та ще ${data.methods.length - 3} операцій\n`;
    }
    summary += `\n`;
  }

  if (data.requirements.length > 0) {
    const critical = data.requirements.filter((r) => r.critical);
    summary += `⚠️ Вимоги: ${data.requirements.length} (критичних: ${critical.length})\n`;
  }

  return summary;
}

/**
 * Генерує промпт для AI з даними специфікації
 */
export function generateSpecificationContext(data: SpecificationData): string {
  let context = `\n## ТЕХНІЧНА СПЕЦИФІКАЦІЯ ПРОЕКТУ\n\n`;

  context += `${data.summary}\n`;

  if (data.materials.length > 0) {
    context += `### Матеріали зі специфікації:\n`;
    data.materials.slice(0, 30).forEach((m) => {
      // Limit to 30 to avoid token explosion
      context += `- **${m.name}**`;
      if (m.brand) context += ` (${m.brand})`;
      if (m.quantity && m.unit) context += ` - ${m.quantity} ${m.unit}`;
      if (m.specifications) context += ` | ${m.specifications}`;
      context += `\n`;
    });
    if (data.materials.length > 30) {
      context += `... та ще ${data.materials.length - 30} матеріалів\n`;
    }
    context += `\n`;
  }

  if (data.methods.length > 0) {
    context += `### Технологічні карти (методи монтажу):\n`;
    data.methods.slice(0, 10).forEach((m) => {
      context += `**${m.operation}:**\n`;
      if (m.tools.length > 0) context += `  Інструменти: ${m.tools.join(', ')}\n`;
      if (m.materials.length > 0) context += `  Матеріали: ${m.materials.join(', ')}\n`;
      if (m.standards) context += `  Стандарт: ${m.standards}\n`;
      context += `\n`;
    });
    if (data.methods.length > 10) {
      context += `... та ще ${data.methods.length - 10} технологічних карт\n\n`;
    }
  }

  if (data.requirements.length > 0) {
    const critical = data.requirements.filter((r) => r.critical);
    if (critical.length > 0) {
      context += `### ⚠️ КРИТИЧНІ ВИМОГИ:\n`;
      critical.slice(0, 10).forEach((r) => {
        context += `- [${r.category}] ${r.requirement}`;
        if (r.standard) context += ` (${r.standard})`;
        context += `\n`;
      });
      context += `\n`;
    }
  }

  context += `**Використовуй цю специфікацію для деталізації кошторису:**\n`;
  context += `- Точні марки та моделі матеріалів\n`;
  context += `- Методи монтажу та інструменти\n`;
  context += `- Дотримання стандартів та вимог\n\n`;

  return context;
}
