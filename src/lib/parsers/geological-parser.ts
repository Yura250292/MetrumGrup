export interface GeologicalData {
  soilLayers: SoilLayer[];
  groundwaterLevel: number | null;        // Глибина УГВ (м)
  bearingCapacity: number | null;         // Несуча здатність (кг/см²)
  recommendedFoundation: string | null;    // "Стрічковий", "Пальовий"
  warnings: string[];
  summary: string;
}

export interface SoilLayer {
  depth: string;          // "0-1.5 м"
  type: string;           // "Глина", "Пісок"
  description: string;
}

export class GeologicalParser {
  parse(text: string): GeologicalData {
    const data: GeologicalData = {
      soilLayers: this.extractSoilLayers(text),
      groundwaterLevel: this.extractGroundwaterLevel(text),
      bearingCapacity: this.extractBearingCapacity(text),
      recommendedFoundation: this.extractFoundationRecommendation(text),
      warnings: [],
      summary: ''
    };

    data.warnings = this.generateWarnings(data);
    data.summary = this.generateSummary(data);

    return data;
  }

  private extractSoilLayers(text: string): SoilLayer[] {
    const layers: SoilLayer[] = [];
    const lines = text.split('\n');

    // Look for depth patterns like "0-1.5 м", "1.5-3.0 м"
    const depthPattern = /(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*м/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const depthMatch = line.match(depthPattern);

      if (depthMatch) {
        // Look for soil type in this line or next few lines
        let type = 'Невизначено';
        let description = line;

        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('глин')) type = 'Глина';
        else if (lowerLine.includes('пісок') || lowerLine.includes('песок')) type = 'Пісок';
        else if (lowerLine.includes('скал')) type = 'Скала';
        else if (lowerLine.includes('супіс')) type = 'Супісок';
        else if (lowerLine.includes('суглин')) type = 'Суглинок';
        else if (lowerLine.includes('грунт')) type = 'Ґрунт';

        layers.push({
          depth: `${depthMatch[1]}-${depthMatch[2]} м`,
          type,
          description: description.trim()
        });
      }
    }

    return layers;
  }

  private extractGroundwaterLevel(text: string): number | null {
    // "рівень підземних вод: 3.5 м"
    // "УГВ: 3.5 м"
    // "groundwater level: 3.5 m"

    const patterns = [
      /угв.*?(\d+(?:[.,]\d+)?)\s*м/i,
      /рівень.*?підземних.*?вод.*?(\d+(?:[.,]\d+)?)\s*м/i,
      /groundwater.*?level.*?(\d+(?:[.,]\d+)?)\s*m/i,
      /gwl.*?(\d+(?:[.,]\d+)?)\s*m/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    return null;
  }

  private extractBearingCapacity(text: string): number | null {
    // "несуча здатність: 2.5 кг/см²"
    // "bearing capacity: 2.5 kg/cm²"

    const patterns = [
      /несуч.*?здатніст.*?(\d+(?:[.,]\d+)?)\s*(?:кг\/см²|kg\/cm²)/i,
      /bearing.*?capacity.*?(\d+(?:[.,]\d+)?)\s*(?:кг\/см²|kg\/cm²)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(',', '.'));
      }
    }

    return null;
  }

  private extractFoundationRecommendation(text: string): string | null {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('пальов') || lowerText.includes('pile')) {
      return 'Пальовий';
    } else if (lowerText.includes('плитн') || lowerText.includes('slab')) {
      return 'Плитний';
    } else if (lowerText.includes('стрічков') || lowerText.includes('strip')) {
      return 'Стрічковий';
    } else if (lowerText.includes('комбінован') || lowerText.includes('combined')) {
      return 'Комбінований';
    }

    return null;
  }

  private generateWarnings(data: GeologicalData): string[] {
    const warnings: string[] = [];

    // High groundwater level
    if (data.groundwaterLevel !== null && data.groundwaterLevel < 2) {
      warnings.push(`⚠️ КРИТИЧНО: Високий рівень підземних вод (${data.groundwaterLevel} м)! Обов'язково потрібен дренаж та гідроізоляція фундаменту.`);
    }

    // Low bearing capacity
    if (data.bearingCapacity !== null && data.bearingCapacity < 1.5) {
      warnings.push(`⚠️ УВАГА: Низька несуча здатність ґрунту (${data.bearingCapacity} кг/см²). Може знадобитись посилення фундаменту.`);
    }

    // Pile foundation required
    if (data.recommendedFoundation === 'Пальовий') {
      warnings.push(`⚠️ Рекомендовано пальовий фундамент - додаткові роботи по забиванню/буронабивці паль.`);
    }

    return warnings;
  }

  private generateSummary(data: GeologicalData): string {
    const parts: string[] = [];

    if (data.soilLayers.length > 0) {
      parts.push(`Шарів ґрунту: ${data.soilLayers.length}`);
    }

    if (data.groundwaterLevel !== null) {
      parts.push(`УГВ: ${data.groundwaterLevel} м`);
    }

    if (data.bearingCapacity !== null) {
      parts.push(`Несуча здатність: ${data.bearingCapacity} кг/см²`);
    }

    if (data.recommendedFoundation) {
      parts.push(`Фундамент: ${data.recommendedFoundation}`);
    }

    return parts.join(', ') || 'Геологічний звіт';
  }

  generateContext(data: GeologicalData): string {
    let context = `\n## ГЕОЛОГІЧНИЙ ЗВІТ (ІНЖЕНЕРНО-ГЕОЛОГІЧНІ ВИШУКУВАННЯ)\n\n`;

    context += `${data.summary}\n\n`;

    if (data.soilLayers.length > 0) {
      context += `**Шари ґрунту:**\n`;
      data.soilLayers.forEach(layer => {
        context += `- **${layer.depth}:** ${layer.type}\n`;
      });
      context += `\n`;
    }

    if (data.warnings.length > 0) {
      context += `**КРИТИЧНІ ВИМОГИ З ГЕОЛОГІЇ:**\n`;
      data.warnings.forEach(w => context += `${w}\n`);
      context += `\n`;
    }

    if (data.recommendedFoundation) {
      context += `🏗️ **ОБОВ'ЯЗКОВО:** Тип фундаменту - ${data.recommendedFoundation}\n`;
      context += `**AI, використовуй ЦЕЙУ тип фундаменту в кошторисі!**\n\n`;
    }

    return context;
  }
}
