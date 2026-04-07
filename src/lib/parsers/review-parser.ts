export interface ProjectReviewData {
  comments: ReviewComment[];
  totalComments: number;
  criticalCount: number;
  summary: string;
}

export interface ReviewComment {
  severity: 'critical' | 'important' | 'recommendation';
  category: string;      // "Фундамент", "Електрика", etc.
  comment: string;
  action: string;        // "Додати", "Виправити", "Перевірити"
}

export class ProjectReviewParser {
  parse(text: string): ProjectReviewData {
    const comments = this.extractComments(text);

    const data: ProjectReviewData = {
      comments,
      totalComments: comments.length,
      criticalCount: comments.filter(c => c.severity === 'critical').length,
      summary: ''
    };

    data.summary = this.generateSummary(data);

    return data;
  }

  private extractComments(text: string): ReviewComment[] {
    const comments: ReviewComment[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.trim().length < 10) continue;

      const lowerLine = line.toLowerCase();

      // Detect severity
      let severity: ReviewComment['severity'] = 'recommendation';
      if (lowerLine.includes('критич') || lowerLine.includes('critical') ||
          lowerLine.includes('недопустим') || lowerLine.includes('обов\'язков')) {
        severity = 'critical';
      } else if (lowerLine.includes('важлив') || lowerLine.includes('important') ||
                 lowerLine.includes('необхідн')) {
        severity = 'important';
      }

      // Detect category
      let category = 'Загальне';
      if (lowerLine.includes('фундамент')) category = 'Фундамент';
      else if (lowerLine.includes('електр')) category = 'Електрика';
      else if (lowerLine.includes('сантех')) category = 'Сантехніка';
      else if (lowerLine.includes('опален')) category = 'Опалення';
      else if (lowerLine.includes('вентил')) category = 'Вентиляція';
      else if (lowerLine.includes('констру')) category = 'Конструкції';
      else if (lowerLine.includes('оздобл')) category = 'Оздоблення';

      // Detect action
      let action = 'Виправити';
      if (lowerLine.includes('додат') || lowerLine.includes('add')) action = 'Додати';
      else if (lowerLine.includes('видал') || lowerLine.includes('remove')) action = 'Видалити';
      else if (lowerLine.includes('перевір') || lowerLine.includes('check')) action = 'Перевірити';
      else if (lowerLine.includes('замін') || lowerLine.includes('replace')) action = 'Замінити';

      comments.push({
        severity,
        category,
        comment: line.trim(),
        action
      });
    }

    return comments.slice(0, 50); // Limit to 50
  }

  private generateSummary(data: ProjectReviewData): string {
    return `Рецензія проекту: ${data.totalComments} зауважень (критичних: ${data.criticalCount})`;
  }

  generateContext(data: ProjectReviewData): string {
    let context = `\n## РЕЦЕНЗІЯ ПРОЕКТУ (ЕКСПЕРТНА ОЦІНКА)\n\n`;

    context += `${data.summary}\n\n`;

    if (data.criticalCount > 0) {
      const critical = data.comments.filter(c => c.severity === 'critical');
      context += `🚨 **КРИТИЧНІ ЗАУВАЖЕННЯ (${critical.length}):**\n`;
      critical.slice(0, 10).forEach(c => {
        context += `- **[${c.category}]** ${c.comment}\n`;
      });
      context += `\n`;
      context += `**AI, ОБОВ'ЯЗКОВО врахуй ці зауваження в кошторисі!**\n`;
      context += `Додай відповідні роботи та матеріали для виправлення.\n\n`;
    }

    const important = data.comments.filter(c => c.severity === 'important');
    if (important.length > 0) {
      context += `⚠️ **Важливі зауваження (${important.length}):**\n`;
      important.slice(0, 10).forEach(c => {
        context += `- [${c.category}] ${c.comment}\n`;
      });
      context += `\n`;
    }

    return context;
  }
}
