export interface SitePlanData {
  area: number | null;                    // Площа ділянки (м²)
  elevationDifference: number | null;     // Перепад висот (м)
  minElevation: number | null;            // Мін відмітка
  maxElevation: number | null;            // Макс відмітка
  existingUtilities: {
    water: boolean;
    sewerage: boolean;
    electricity: boolean;
    gas: boolean;
    locations?: string;                   // "на відстані 20м від меж"
  };
  existingStructures: string[];           // ["старий сарай", "дерева"]
  soilType?: string;                      // "глина", "пісок" (якщо вказано)
  accessRoads: {
    exists: boolean;
    quality?: string;                     // "грунтова дорога", "асфальт"
  };
  summary: string;
}

export class SitePlanParser {
  parse(text: string): SitePlanData {
    const data: SitePlanData = {
      area: this.extractArea(text),
      elevationDifference: this.extractElevationDiff(text),
      minElevation: this.extractMinElevation(text),
      maxElevation: this.extractMaxElevation(text),
      existingUtilities: this.extractUtilities(text),
      existingStructures: this.extractStructures(text),
      accessRoads: this.extractAccessRoads(text),
      summary: ''
    };

    data.summary = this.generateSummary(data);
    return data;
  }

  private extractArea(text: string): number | null {
    // "площа ділянки: 1200 м²"
    // "site area: 1200 sq.m"
    const patterns = [
      /площа.*?(\d+(?:[.,]\d+)?)\s*(?:м²|m²|кв\.?м)/i,
      /area.*?(\d+(?:[.,]\d+)?)\s*(?:м²|m²|sq\.?m)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    return null;
  }

  private extractElevationDiff(text: string): number | null {
    // "перепад висот 3.5м"
    // "elevation difference 3.5m"
    // Or calculate from min/max elevations

    const patterns = [
      /перепад.*?висот.*?(\d+(?:[.,]\d+)?)\s*м/i,
      /elevation.*?difference.*?(\d+(?:[.,]\d+)?)\s*m/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    // Try to calculate from min/max
    const minElev = this.extractMinElevation(text);
    const maxElev = this.extractMaxElevation(text);

    if (minElev !== null && maxElev !== null) {
      return maxElev - minElev;
    }

    return null;
  }

  private extractMinElevation(text: string): number | null {
    // "мінімальна відмітка 102.50"
    const patterns = [
      /мін.*?(?:відмітка|висота).*?(\d+(?:[.,]\d+)?)/i,
      /min.*?elevation.*?(\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    return null;
  }

  private extractMaxElevation(text: string): number | null {
    const patterns = [
      /макс.*?(?:відмітка|висота).*?(\d+(?:[.,]\d+)?)/i,
      /max.*?elevation.*?(\d+(?:[.,]\d+)?)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    return null;
  }

  private extractUtilities(text: string): SitePlanData['existingUtilities'] {
    const utilities = {
      water: false,
      sewerage: false,
      electricity: false,
      gas: false
    };

    const lowerText = text.toLowerCase();

    if (lowerText.includes('водопровід') || lowerText.includes('water')) {
      utilities.water = true;
    }
    if (lowerText.includes('каналізація') || lowerText.includes('sewerage')) {
      utilities.sewerage = true;
    }
    if (lowerText.includes('електрика') || lowerText.includes('electricity') || lowerText.includes('електропостачання')) {
      utilities.electricity = true;
    }
    if (lowerText.includes('газ') || lowerText.includes('gas')) {
      utilities.gas = true;
    }

    return utilities;
  }

  private extractStructures(text: string): string[] {
    const structures: string[] = [];

    // Look for mentions of existing structures
    const keywords = [
      'існуюч', 'existing', 'старий', 'old',
      'будівля', 'building', 'споруда', 'structure',
      'сарай', 'barn', 'гараж', 'garage',
      'паркан', 'fence', 'огорож', 'дерево', 'tree'
    ];

    const lines = text.split('\n');
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.some(kw => lower.includes(kw))) {
        structures.push(line.trim());
      }
    }

    return structures.slice(0, 10); // Limit to 10
  }

  private extractAccessRoads(text: string): SitePlanData['accessRoads'] {
    const lowerText = text.toLowerCase();

    const hasAccess =
      lowerText.includes('дорога') ||
      lowerText.includes('road') ||
      lowerText.includes('підїзд') ||
      lowerText.includes('access');

    let quality: string | undefined;

    if (lowerText.includes('асфальт') || lowerText.includes('asphalt')) {
      quality = 'асфальтована';
    } else if (lowerText.includes('грунт') || lowerText.includes('dirt') || lowerText.includes('unpaved')) {
      quality = 'грунтова';
    }

    return { exists: hasAccess, quality };
  }

  private generateSummary(data: SitePlanData): string {
    const parts: string[] = [];

    if (data.area) {
      parts.push(`Площа ділянки: ${data.area} м²`);
    }

    if (data.elevationDifference) {
      parts.push(`Перепад висот: ${data.elevationDifference.toFixed(2)} м`);
    }

    const utilsList: string[] = [];
    if (data.existingUtilities.water) utilsList.push('водопровід');
    if (data.existingUtilities.sewerage) utilsList.push('каналізація');
    if (data.existingUtilities.electricity) utilsList.push('електрика');
    if (data.existingUtilities.gas) utilsList.push('газ');

    if (utilsList.length > 0) {
      parts.push(`Комунікації: ${utilsList.join(', ')}`);
    }

    if (data.existingStructures.length > 0) {
      parts.push(`Існуючі споруди: ${data.existingStructures.length} шт`);
    }

    return parts.join('. ') || 'План ділянки';
  }

  generateContext(data: SitePlanData): string {
    let context = `\n## ПЛАН ЗЕМЕЛЬНОЇ ДІЛЯНКИ\n\n`;

    context += `${data.summary}\n\n`;

    if (data.elevationDifference && data.elevationDifference > 1) {
      context += `⚠️ **УВАГА: Значний перепад висот ${data.elevationDifference.toFixed(2)} м!**\n`;
      context += `Це вимагає:\n`;
      context += `- Земляні роботи (планування, зрізання/досипання)\n`;
      context += `- Можливо підпірні стінки\n`;
      context += `- Дренажна система\n`;
      context += `- Ускладнення логістики\n\n`;
    }

    if (data.existingStructures.length > 0) {
      context += `**Існуючі споруди на ділянці:**\n`;
      data.existingStructures.forEach(s => context += `- ${s}\n`);
      context += `⚠️ Можливо потрібен демонтаж або перенесення!\n\n`;
    }

    context += `**Комунікації:**\n`;
    context += `- Водопровід: ${data.existingUtilities.water ? '✅ Є' : '❌ Немає (треба підключати)'}\n`;
    context += `- Каналізація: ${data.existingUtilities.sewerage ? '✅ Є' : '❌ Немає (треба підключати)'}\n`;
    context += `- Електрика: ${data.existingUtilities.electricity ? '✅ Є' : '❌ Немає (треба підключати)'}\n`;
    context += `- Газ: ${data.existingUtilities.gas ? '✅ Є' : '❌ Немає (якщо потрібно - підключати)'}\n\n`;

    if (!data.existingUtilities.water || !data.existingUtilities.sewerage || !data.existingUtilities.electricity) {
      context += `🚨 **ДОДАЙ В КОШТОРИС:** Підключення до зовнішніх мереж!\n\n`;
    }

    return context;
  }
}
