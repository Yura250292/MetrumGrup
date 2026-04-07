export interface SitePhotosData {
  photoCount: number;
  photoNames: string[];
  summary: string;
}

export class SitePhotosHandler {
  analyze(photos: File[]): SitePhotosData {
    const data: SitePhotosData = {
      photoCount: photos.length,
      photoNames: photos.map(p => p.name),
      summary: `${photos.length} фото місцевості`
    };

    return data;
  }

  generateContext(data: SitePhotosData): string {
    let context = `\n## ФОТО БУДІВЕЛЬНОГО МАЙДАНЧИКА\n\n`;

    context += `Завантажено ${data.photoCount} фото місцевості.\n\n`;

    context += `**AI, проаналізуй фото і визнач:**\n`;
    context += `- Рельєф місцевості (рівний, схил, нерівний)\n`;
    context += `- Існуючі споруди/перешкоди (що потрібно демонтувати)\n`;
    context += `- Стан підїздів (чи потрібен ремонт доріг)\n`;
    context += `- Дерева (чи потрібна вирубка/пересадка)\n`;
    context += `- Сусідні будівлі (захисні конструкції)\n`;
    context += `- Місце для складування матеріалів\n`;
    context += `- Місце для тимчасових споруд (бетонозмішувач, туалет)\n\n`;

    context += `**Додай в кошторис на основі фото:**\n`;
    context += `- Підготовка майданчика\n`;
    context += `- Демонтаж перешкод\n`;
    context += `- Тимчасові дороги/настили\n`;
    context += `- Захист сусідніх об'єктів\n\n`;

    return context;
  }
}
