/**
 * Генерація детального інженерного звіту на основі проаналізованих документів
 */

interface EngineeringReportInput {
  classification: any;
  parsedData: any;
  filesAnalyzed: number;
}

export async function generateEngineeringReport(
  input: EngineeringReportInput
): Promise<string> {
  const { classification, parsedData, filesAnalyzed } = input;

  const prompt = `Ти - головний інженер-кошторисник з 25-річним досвідом.

Проаналізуй завантажені документи проекту і створи ДЕТАЛЬНИЙ ІНЖЕНЕРНИЙ ЗВІТ.

# ЗАВАНТАЖЕНІ ДОКУМЕНТИ:

Всього файлів: ${filesAnalyzed}

Класифікація:
${JSON.stringify(classification, null, 2)}

# ВИТЯГНУТІ ДАНІ:

${parsedData.sitePlan ? `
## ПЛАН ДІЛЯНКИ / ТОПОГРАФІЯ:
- Площа: ${parsedData.sitePlan.area || 'не вказано'} м²
- Перепад висот: ${parsedData.sitePlan.elevationDifference?.toFixed(2) || 'не визначено'} м
- Мін відмітка: ${parsedData.sitePlan.minElevation || 'н/д'}
- Макс відмітка: ${parsedData.sitePlan.maxElevation || 'н/д'}
- Комунікації:
  * Водопровід: ${parsedData.sitePlan.existingUtilities.water ? 'є' : 'немає'}
  * Каналізація: ${parsedData.sitePlan.existingUtilities.sewerage ? 'є' : 'немає'}
  * Електрика: ${parsedData.sitePlan.existingUtilities.electricity ? 'є' : 'немає'}
  * Газ: ${parsedData.sitePlan.existingUtilities.gas ? 'є' : 'немає'}
- Існуючі споруди: ${parsedData.sitePlan.existingStructures.length} шт
- Підїзди: ${parsedData.sitePlan.accessRoads.exists ? 'є' : 'немає'}${parsedData.sitePlan.accessRoads.quality ? ` (${parsedData.sitePlan.accessRoads.quality})` : ''}
` : ''}

${parsedData.geological ? `
## ГЕОЛОГІЧНИЙ ЗВІТ:
- Шарів ґрунту: ${parsedData.geological.soilLayers.length}
- Типи ґрунту: ${parsedData.geological.soilLayers.map((l: any) => `${l.type} (${l.depth})`).join(', ')}
- Рівень підземних вод (УГВ): ${parsedData.geological.groundwaterLevel !== null ? `${parsedData.geological.groundwaterLevel} м` : 'не визначено'}
- Несуча здатність: ${parsedData.geological.bearingCapacity !== null ? `${parsedData.geological.bearingCapacity} кг/см²` : 'не визначено'}
- Рекомендований фундамент: ${parsedData.geological.recommendedFoundation || 'не вказано'}
- Попередження: ${parsedData.geological.warnings.length > 0 ? parsedData.geological.warnings.join('; ') : 'немає'}
` : ''}

${parsedData.review ? `
## РЕЦЕНЗІЯ ПРОЕКТУ:
- Всього зауважень: ${parsedData.review.totalComments}
- Критичних: ${parsedData.review.criticalCount}
- Коментарі по категоріях: ${parsedData.review.comments.slice(0, 10).map((c: any) => `[${c.category}] ${c.severity.toUpperCase()}: ${c.comment.substring(0, 100)}`).join('; ')}
` : ''}

${parsedData.photos ? `
## ФОТО МІСЦЕВОСТІ:
- Кількість фото: ${parsedData.photos.photoCount}
- Файли: ${parsedData.photos.photoNames.join(', ')}
` : ''}

---

# ТВОЄ ЗАВДАННЯ:

Створи ДЕТАЛЬНИЙ ІНЖЕНЕРНИЙ ЗВІТ в наступному форматі:

## 1. ЗАГАЛЬНИЙ ОГЛЯД ПРОЕКТУ
- Короткий опис що це за об'єкт (на основі документів)
- Складність проекту (низька/середня/висока)
- Очікувані виклики

## 2. КРИТИЧНІ МОМЕНТИ ⚠️
Перелічи ВСІ критичні аспекти які ОБОВ'ЯЗКОВО потрібно врахувати:
- З топографії (перепади, комунікації)
- З геології (УГВ, тип ґрунту, фундамент)
- З рецензії (критичні зауваження)
- З фото (перешкоди, підїзди)

## 3. РЕКОМЕНДАЦІЇ ПО ФУНДАМЕНТУ
- Який тип фундаменту підходить
- Чому саме цей тип
- Які роботи потрібні (дренаж, гідроізоляція, тощо)
- Очікувані складнощі

## 4. РЕКОМЕНДАЦІЇ ПО ЗЕМЛЯНИХ РОБОТАХ
- Чи потрібне планування ділянки
- Обсяги земляних робіт (орієнтовно)
- Підпірні стінки (якщо потрібні)
- Дренаж та відведення води

## 5. РЕКОМЕНДАЦІЇ ПО КОМУНІКАЦІЯХ
- Які комунікації є / немає
- Що потрібно підключити
- Орієнтовні відстані до мереж
- Можливі складнощі

## 6. ПІДГОТОВКА МАЙДАНЧИКА
- Що потрібно демонтувати
- Тимчасові споруди
- Логістика та підїзди
- Складування матеріалів

## 7. БЮДЖЕТНІ РИЗИКИ 💰
Які роботи можуть ЗНАЧНО збільшити кошторис:
- Непередбачені роботи
- Складні умови
- Додаткові вимоги

## 8. РЕКОМЕНДАЦІЇ ДЛЯ КОШТОРИСУ 📋
Конкретний чек-лист що ОБОВ'ЯЗКОВО включити:
- [ ] ...
- [ ] ...
- [ ] ...

## 9. ЩО ПОТРІБНО УТОЧНИТИ ❓
Які додаткові дані/документи потрібні для точного кошторису

---

ВИМОГИ:
- Пиши КОНКРЕТНО, з цифрами
- Використовуй дані з документів
- Якщо даних немає - скажи про це
- Виділяй критичні моменти 🚨
- Давай практичні поради
- Будь корисним для ІНЖЕНЕРА, не для клієнта

Формат відповіді: Markdown з емодзі для наочності.`;

  try {
    const response = await fetch('/api/admin/estimates/generate-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Report generation failed:', response.status, errorText);
      throw new Error(`Failed to generate report: ${response.status} ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.report;
  } catch (error) {
    console.error('Error generating engineering report:', error);
    return `Помилка генерації звіту: ${error instanceof Error ? error.message : 'Невідома помилка'}. Спробуйте ще раз.`;
  }
}

/**
 * Форматує короткий summary для швидкого перегляду
 */
export function generateQuickSummary(parsedData: any): string[] {
  const insights: string[] = [];

  // Топографія
  if (parsedData.sitePlan) {
    if (parsedData.sitePlan.elevationDifference && parsedData.sitePlan.elevationDifference > 2) {
      insights.push(`🗻 Значний перепад висот ${parsedData.sitePlan.elevationDifference.toFixed(1)}м - потрібні земляні роботи`);
    }

    const missingUtilities = [];
    if (!parsedData.sitePlan.existingUtilities.water) missingUtilities.push('водопровід');
    if (!parsedData.sitePlan.existingUtilities.sewerage) missingUtilities.push('каналізацію');
    if (!parsedData.sitePlan.existingUtilities.electricity) missingUtilities.push('електрику');

    if (missingUtilities.length > 0) {
      insights.push(`🔌 Треба підключити: ${missingUtilities.join(', ')}`);
    }
  }

  // Геологія
  if (parsedData.geological) {
    if (parsedData.geological.groundwaterLevel !== null && parsedData.geological.groundwaterLevel < 2) {
      insights.push(`💧 КРИТИЧНО: Високий УГВ (${parsedData.geological.groundwaterLevel}м) - обов'язковий дренаж!`);
    }

    if (parsedData.geological.recommendedFoundation) {
      insights.push(`🏗️ Фундамент: ${parsedData.geological.recommendedFoundation}`);
    }
  }

  // Рецензія
  if (parsedData.review && parsedData.review.criticalCount > 0) {
    insights.push(`📝 УВАГА: ${parsedData.review.criticalCount} критичних зауважень з рецензії!`);
  }

  // Фото
  if (parsedData.photos && parsedData.photos.photoCount > 0) {
    insights.push(`📸 Завантажено ${parsedData.photos.photoCount} фото місцевості для аналізу`);
  }

  return insights;
}
