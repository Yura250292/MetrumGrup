import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from '../../src/lib/prisma';
import { formatCurrency, translateStatus, translateStage } from '../utils/constants';
import { BuildingCalculator } from '../utils/calculator';

let genAI: GoogleGenerativeAI | null = null;

// Ініціалізація тільки якщо є API ключ
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Функції які AI може викликати
const availableFunctions = {
  getProjects: async () => {
    const projects = await prisma.project.findMany({
      include: { client: true, manager: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return projects;
  },

  getEstimates: async () => {
    const estimates = await prisma.estimate.findMany({
      include: {
        project: true,
        sections: {
          include: {
            items: {
              include: {
                material: true
              }
            }
          },
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return estimates;
  },

  getProjectByName: async (projectName: string) => {
    const project = await prisma.project.findFirst({
      where: {
        title: { contains: projectName, mode: 'insensitive' }
      },
      include: {
        client: true,
        manager: true,
        estimates: {
          include: {
            sections: {
              include: {
                items: {
                  include: {
                    material: true
                  }
                }
              },
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    return project;
  },

  calculateProjectCosts: async (projectId: string, category?: string) => {
    const estimates = await prisma.estimate.findMany({
      where: { projectId },
      include: {
        sections: {
          include: {
            items: {
              include: { material: true }
            }
          }
        }
      }
    });

    let totalMaterials = 0;
    let totalLabor = 0;
    const breakdown: any = {};

    estimates.forEach(estimate => {
      estimate.sections.forEach(section => {
        section.items.forEach(item => {
          const itemTotal = parseFloat(item.amount?.toString() || '0');
          const laborCost = parseFloat(item.laborRate?.toString() || '0') * parseFloat(item.laborHours?.toString() || '0');

          if (category) {
            // Фільтрація по категорії (наприклад "фундамент")
            if (item.description.toLowerCase().includes(category.toLowerCase())) {
              totalMaterials += itemTotal;
              totalLabor += laborCost;
            }
          } else {
            totalMaterials += itemTotal;
            totalLabor += laborCost;

            // Група по опису
            const key = item.description || 'Інше';
            if (!breakdown[key]) {
              breakdown[key] = 0;
            }
            breakdown[key] += itemTotal + laborCost;
          }
        });
      });
    });

    return {
      totalMaterials,
      totalLabor,
      total: totalMaterials + totalLabor,
      breakdown: Object.entries(breakdown)
        .sort(([, a]: any, [, b]: any) => b - a)
        .slice(0, 10)
    };
  },

  getPaymentsSummary: async () => {
    const payments = await prisma.payment.findMany({
      include: { project: true },
      orderBy: { createdAt: 'desc' }
    });

    const total = payments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);
    const pending = payments.filter(p => p.status === 'PENDING');
    const paid = payments.filter(p => p.status === 'PAID');

    return {
      total,
      totalPending: pending.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0),
      totalPaid: paid.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0),
      count: payments.length,
      pendingCount: pending.length
    };
  },

  getMaterials: async (searchQuery?: string) => {
    const materials = await prisma.material.findMany({
      where: searchQuery ? {
        OR: [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { category: { contains: searchQuery, mode: 'insensitive' } }
        ]
      } : {},
      take: 20
    });
    return materials;
  },

  // Математичні та фінансові функції
  calculate: (expression: string): number => {
    try {
      // Безпечний калькулятор (тільки числа та основні операції)
      const sanitized = expression.replace(/[^0-9+\-*/().]/g, '');
      return eval(sanitized);
    } catch {
      return 0;
    }
  },

  calculateTax: (amount: number, taxType: 'ПДВ' | 'ЄСВ' | 'ПДФО' | 'ВЗ' | 'ПП'): { amount: number, tax: number, total: number } => {
    const rates: Record<string, number> = {
      'ПДВ': 0.20,    // 20%
      'ЄСВ': 0.22,    // 22%
      'ПДФО': 0.18,   // 18%
      'ВЗ': 0.015,    // 1.5%
      'ПП': 0.18      // 18%
    };
    const rate = rates[taxType] || 0;
    const tax = amount * rate;
    return {
      amount,
      tax,
      total: amount + tax
    };
  },

  calculateMargin: (cost: number, price: number): { margin: number, marginPercent: number, markup: number } => {
    const margin = price - cost;
    const marginPercent = (margin / price) * 100;
    const markup = (margin / cost) * 100;
    return {
      margin,
      marginPercent,
      markup
    };
  },

  calculateProjection: (currentAmount: number, months: number, growthRate: number): Array<{month: number, amount: number}> => {
    const projection = [];
    for (let i = 1; i <= months; i++) {
      projection.push({
        month: i,
        amount: currentAmount * Math.pow(1 + growthRate, i)
      });
    }
    return projection;
  },

  calculateCompletionDate: async (projectId: string): Promise<{ estimatedDays: number, completionDate: string }> => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { estimates: true }
    });

    if (!project) return { estimatedDays: 0, completionDate: 'Невідомо' };

    const progress = project.stageProgress;
    const startDate = project.startDate ? new Date(project.startDate) : new Date();
    const daysPassed = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Прогноз на основі поточного прогресу
    const estimatedTotalDays = progress > 0 ? (daysPassed / progress) * 100 : 365;
    const remainingDays = Math.ceil(estimatedTotalDays - daysPassed);

    const completionDate = new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000);

    return {
      estimatedDays: remainingDays,
      completionDate: completionDate.toLocaleDateString('uk-UA')
    };
  },

  analyzeProjectBudget: async (projectId: string) => {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        estimates: true,
        payments: true
      }
    });

    if (!project) return null;

    const totalBudget = parseFloat(project.totalBudget.toString());
    const totalPaid = parseFloat(project.totalPaid.toString());
    const remaining = totalBudget - totalPaid;

    const pendingPayments = project.payments.filter(p => p.status === 'PENDING');
    const totalPending = pendingPayments.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

    const estimatedTotal = project.estimates.reduce((sum, e) => sum + parseFloat(e.totalAmount.toString()), 0);
    const budgetVariance = totalBudget - estimatedTotal;

    return {
      totalBudget,
      totalPaid,
      remaining,
      paidPercent: (totalPaid / totalBudget) * 100,
      totalPending,
      estimatedTotal,
      budgetVariance,
      budgetStatus: budgetVariance >= 0 ? 'В межах бюджету' : 'Перевищення бюджету',
      overrunAmount: budgetVariance < 0 ? Math.abs(budgetVariance) : 0
    };
  }
};

export async function handleAdminAI(query: string, conversationHistory: Array<{role: string, content: string}> = []): Promise<string> {
  if (!genAI) {
    return '🤖 AI асистент недоступний. Додайте GEMINI_API_KEY до .env файлу.';
  }

  try {
    console.log('Processing AI query:', query);
    console.log('Conversation history length:', conversationHistory.length);

    // Спочатку аналізуємо запит і збираємо потрібні дані
    const intent = await analyzeIntent(query);
    console.log('Intent:', intent);

    // Перевіряємо історію розмови на наявність згадок про проекти
    let contextProjectName = intent.projectName;
    if (!contextProjectName && conversationHistory.length > 0) {
      // Шукаємо згадки проектів в останніх повідомленнях
      const recentHistory = conversationHistory.slice(-6).map(m => m.content).join(' ');
      const projectMatches = recentHistory.match(/проект[іа]?\s+["']?([^"'.,\n]+)["']?/i) ||
                            recentHistory.match(/Зубр[аи]?/i) ||
                            recentHistory.match(/EST-\d+/i);
      if (projectMatches) {
        contextProjectName = projectMatches[1] || projectMatches[0];
        console.log('Found project in context:', contextProjectName);
      }
    }

    // Якщо в запиті згадується "цей", "той", "тут" - завантажуємо дані з контексту
    const needsContext = /\b(цей|цьому|ця|цього|той|тому|тут|там)\b/i.test(query);
    if (needsContext && contextProjectName) {
      intent.projectName = contextProjectName;
      intent.needsEstimates = true;
      console.log('Loading context data for:', contextProjectName);
    }

    // Якщо в історії згадувались кошториси, а зараз питають про деталі - завантажуємо дані
    if (!intent.needsEstimates && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-6).map(m => m.content).join(' ').toLowerCase();
      if (recentHistory.includes('кошторис') || recentHistory.includes('est-')) {
        const asksForDetails = /матеріал|ціна|позиці|робот|розрахун|детал|скільки|яка|який|які/i.test(query);
        if (asksForDetails) {
          intent.needsEstimates = true;
          if (contextProjectName) {
            intent.projectName = contextProjectName;
          }
          console.log('Loading estimates based on conversation context');
        }
      }
    }

    let data = '';
    let projects: any = null;
    let estimates: any = null;
    let costs: any = null;
    let payments: any = null;

    // Збираємо дані на основі інтенції
    if (intent.needsProjects) {
      projects = await availableFunctions.getProjects();
      data += `\n\nДоступні проекти:\n${projects.map((p: any) =>
        `- ${p.title} (${translateStatus(p.status)}, ${translateStage(p.currentStage)}, бюджет: ${formatCurrency(p.totalBudget)})`
      ).join('\n')}`;
    }

    if (intent.needsEstimates) {
      estimates = await availableFunctions.getEstimates();
      console.log('Estimates found:', estimates.length);

      estimates.forEach((e: any) => {
        data += `\n\n📊 Кошторис ${e.number}: ${e.title}\n`;
        data += `Проект: ${e.project.title}\n`;
        data += `Статус: ${translateStatus(e.status)}\n`;
        data += `Фінанси:\n`;
        data += `  - Матеріали: ${formatCurrency(e.totalMaterials)}\n`;
        data += `  - Робота: ${formatCurrency(e.totalLabor)}\n`;
        data += `  - Накладні: ${formatCurrency(e.totalOverhead)}\n`;
        data += `  - Податки (${e.taxRate}%): ${formatCurrency(e.taxAmount)}\n`;
        data += `  - РАЗОМ: ${formatCurrency(e.finalAmount || e.totalAmount)}\n`;

        if (e.sections && e.sections.length > 0) {
          data += `\nРозділи та роботи:\n`;
          e.sections.forEach((section: any) => {
            data += `  📁 ${section.title}\n`;
            if (section.items && section.items.length > 0) {
              section.items.forEach((item: any) => {
                data += `    • ${item.description || item.material?.name || 'Позиція'}\n`;
                data += `      Кількість: ${item.quantity} ${item.unit || ''}\n`;
                if (item.unitPrice) {
                  data += `      Ціна: ${formatCurrency(item.unitPrice)} за ${item.unit || 'од.'}\n`;
                }
                if (item.amount) {
                  data += `      Сума: ${formatCurrency(item.amount)}\n`;
                }
                if (item.laborHours || item.laborRate) {
                  data += `      Робота: ${item.laborHours || 0} год × ${formatCurrency(item.laborRate || 0)} = ${formatCurrency((item.laborHours || 0) * parseFloat(item.laborRate?.toString() || '0'))}\n`;
                }
              });
            }
          });
        }
      });

      console.log('Data with estimates:', data.substring(0, 500));
    }

    if (intent.needsPayments) {
      payments = await availableFunctions.getPaymentsSummary();
      data += `\n\nПлатежі: Всього ${payments.count}, оплачено ${formatCurrency(payments.totalPaid)}, очікується ${formatCurrency(payments.totalPending)}`;
    }

    // Автоматичні розрахунки для проекту
    if (intent.projectName) {
      const project = await availableFunctions.getProjectByName(intent.projectName);
      if (project) {
        // Детальний бюджетний аналіз
        const budgetAnalysis = await availableFunctions.analyzeProjectBudget(project.id);
        if (budgetAnalysis) {
          data += `\n\n💰 ФІНАНСОВИЙ АНАЛІЗ ПРОЕКТУ:\n`;
          data += `Загальний бюджет: ${formatCurrency(budgetAnalysis.totalBudget)}\n`;
          data += `Оплачено: ${formatCurrency(budgetAnalysis.totalPaid)} (${budgetAnalysis.paidPercent.toFixed(1)}%)\n`;
          data += `Залишок: ${formatCurrency(budgetAnalysis.remaining)}\n`;
          data += `Очікується: ${formatCurrency(budgetAnalysis.totalPending)}\n`;
          data += `\nПланова сума по кошторисам: ${formatCurrency(budgetAnalysis.estimatedTotal)}\n`;
          data += `Відхилення від бюджету: ${formatCurrency(budgetAnalysis.budgetVariance)}\n`;
          data += `Статус: ${budgetAnalysis.budgetStatus}\n`;
          if (budgetAnalysis.overrunAmount > 0) {
            data += `⚠️ Перевищення: ${formatCurrency(budgetAnalysis.overrunAmount)}\n`;
          }
        }

        // Прогноз завершення
        const completion = await availableFunctions.calculateCompletionDate(project.id);
        data += `\n\n📅 ПРОГНОЗ ЗАВЕРШЕННЯ:\n`;
        data += `Поточний прогрес: ${project.stageProgress}%\n`;
        data += `Залишилось днів: ${completion.estimatedDays}\n`;
        data += `Очікувана дата завершення: ${completion.completionDate}\n`;
      }
    }

    // Розрахунок податків для кошторисів
    if (estimates && estimates.length > 0) {
      estimates.forEach((est: any) => {
        if (est.totalAmount > 0) {
          const baseAmount = parseFloat(est.totalAmount.toString());

          data += `\n\n🧮 ПОДАТКОВИЙ РОЗРАХУНОК для ${est.number}:\n`;
          data += `Базова сума: ${formatCurrency(baseAmount)}\n`;

          // Використовуємо BuildingCalculator
          const pdvCalc = BuildingCalculator.calculatePDV(baseAmount);
          data += `ПДВ (20%): ${formatCurrency(pdvCalc.pdv)}\n`;
          data += `Разом з ПДВ: ${formatCurrency(pdvCalc.total)}\n`;

          // ЄСВ (якщо є робота)
          if (est.totalLabor > 0) {
            const laborAmount = parseFloat(est.totalLabor.toString());
            const payrollTaxes = BuildingCalculator.calculatePayrollTaxes(laborAmount);

            data += `\nФонд оплати праці: ${formatCurrency(laborAmount)}\n`;
            data += `ЄСВ (22%): ${formatCurrency(payrollTaxes.esv)}\n`;
            data += `ПДФО (18%): ${formatCurrency(payrollTaxes.pdfo)}\n`;
            data += `Військовий збір (1.5%): ${formatCurrency(payrollTaxes.vz)}\n`;
            data += `Усього податків: ${formatCurrency(payrollTaxes.totalTax)}\n`;
            data += `На руки працівникам: ${formatCurrency(payrollTaxes.netSalary)}\n`;
          }

          // Рентабельність
          if (est.totalOverhead > 0) {
            const totalCost = baseAmount;
            const totalRevenue = baseAmount + parseFloat(est.totalOverhead.toString());
            const profitability = BuildingCalculator.calculateProfitability(totalRevenue, totalCost);

            data += `\n💰 РЕНТАБЕЛЬНІСТЬ:\n`;
            data += `Витрати: ${formatCurrency(profitability.costs)}\n`;
            data += `Виручка: ${formatCurrency(profitability.revenue)}\n`;
            data += `Прибуток: ${formatCurrency(profitability.profit)}\n`;
            data += `Рентабельність: ${profitability.profitability.toFixed(2)}%\n`;
            data += `ROI: ${profitability.roi.toFixed(2)}%\n`;
          }
        }
      });
    }

    // Додаткові розрахунки на основі запиту
    const needsCalculations = /розрахуй|порахуй|скільки|яка\s+(маржа|рентабельн|податк)|виділи\s+пдв/i.test(query);
    if (needsCalculations) {
      data += `\n\n📊 ДОСТУПНІ КАЛЬКУЛЯТОРИ:\n`;
      data += `• ПДВ калькулятор (нарахування та виділення)\n`;
      data += `• Податки на ФОП (ЄСВ, ПДФО, ВЗ)\n`;
      data += `• Маржа та націнка\n`;
      data += `• Рентабельність та ROI\n`;
      data += `• Прогноз завершення робіт\n`;
      data += `• Розрахунок матеріалів\n`;
      data += `• Об'єм бетону\n`;
      data += `• Вартість робочої сили\n`;
    }

    if (intent.projectName) {
      const project = await availableFunctions.getProjectByName(intent.projectName);
      if (project) {
        data += `\n\n🏗 Проект "${project.title}":\n`;
        data += `Клієнт: ${project.client?.name || 'Не вказано'}\n`;
        data += `Менеджер: ${project.manager?.name || 'Не вказано'}\n`;
        data += `Статус: ${translateStatus(project.status)}\n`;
        data += `Етап: ${translateStage(project.currentStage)} (${project.stageProgress}%)\n`;
        data += `Бюджет: ${formatCurrency(project.totalBudget)}\n`;
        data += `Оплачено: ${formatCurrency(project.totalPaid)}\n`;
        data += `Залишок: ${formatCurrency(parseFloat(project.totalBudget.toString()) - parseFloat(project.totalPaid.toString()))}\n`;

        // Додаємо інформацію про кошториси з деталями
        if (project.estimates && project.estimates.length > 0) {
          data += `\n📊 Кошториси проекту (${project.estimates.length}):\n`;
          project.estimates.forEach((est: any) => {
            data += `\n  ${est.number} - ${est.title} (${translateStatus(est.status)})\n`;
            data += `  Сума: ${formatCurrency(est.finalAmount || est.totalAmount)}\n`;

            if (est.sections && est.sections.length > 0) {
              est.sections.forEach((section: any) => {
                data += `    📁 ${section.title}\n`;
                if (section.items && section.items.length > 0) {
                  section.items.forEach((item: any) => {
                    data += `      • ${item.description || item.material?.name}\n`;
                    data += `        ${item.quantity} ${item.unit} × ${formatCurrency(item.unitPrice || 0)} = ${formatCurrency(item.amount || 0)}\n`;
                    if (item.laborHours) {
                      data += `        Робота: ${item.laborHours} год × ${formatCurrency(item.laborRate || 0)}\n`;
                    }
                  });
                }
              });
            }
          });
        }

        // Додаємо інформацію про платежі
        if (project.payments && project.payments.length > 0) {
          data += `\n💰 Платежі (${project.payments.length}):\n`;
          project.payments.forEach((payment: any) => {
            data += `  - ${formatCurrency(payment.amount)} (${translateStatus(payment.status)})\n`;
            if (payment.description) {
              data += `    ${payment.description}\n`;
            }
            if (payment.paidDate) {
              data += `    Дата: ${new Date(payment.paidDate).toLocaleDateString('uk-UA')}\n`;
            }
          });
        }

        if (intent.category) {
          costs = await availableFunctions.calculateProjectCosts(project.id, intent.category);
          data += `\n\nВитрати на "${intent.category}":\n`;
          data += `- Матеріали: ${formatCurrency(costs.totalMaterials)}\n`;
          data += `- Робота: ${formatCurrency(costs.totalLabor)}\n`;
          data += `- РАЗОМ: ${formatCurrency(costs.total)}`;
        }
      }
    }

    // Формуємо контекст розмови
    let conversationContext = '';
    if (conversationHistory.length > 0) {
      conversationContext = '\n\nІсторія розмови (останні повідомлення):\n';
      conversationHistory.slice(-6).forEach(msg => {
        conversationContext += `${msg.role === 'user' ? '👤 Адмін' : '🤖 Асистент'}: ${msg.content}\n`;
      });
    }

    // Генеруємо відповідь через Gemini
    const prompt = `
Ти - розумний AI асистент прораба для компанії Metrum Group з розширеними можливостями розрахунків.
Твоє завдання - допомагати адміністратору швидко отримувати інформацію про проекти, кошториси, платежі.
${conversationContext}

Поточний запит адміна: "${query}"

Дані з бази:${data}

ДОСТУПНІ ІНСТРУМЕНТИ ДЛЯ РОЗРАХУНКІВ:

📊 ПОДАТКИ (використовуй для розрахунку податків):
- ПДВ: 20% - податок на додану вартість
- ЄСВ: 22% - єдиний соціальний внесок (на фонд оплати праці)
- ПДФО: 18% - податок на доходи фізичних осіб
- ВЗ: 1.5% - військовий збір
- ПП: 18% - податок на прибуток

💰 ФІНАНСОВІ РОЗРАХУНКИ:
- Маржа = Ціна продажу - Собівартість
- Маржа % = (Маржа / Ціна продажу) × 100
- Націнка = (Маржа / Собівартість) × 100
- Рентабельність = (Чистий прибуток / Загальні витрати) × 100

📈 ПРОГНОЗУВАННЯ:
- Дата завершення проекту на основі прогресу
- Бюджетний аналіз (витрати vs планові показники)
- Відхилення від бюджету

🔢 МАТЕМАТИКА:
- Звичайні обчислення (+, -, ×, ÷)
- Відсотки
- Середні значення
- Співвідношення

ВАЖЛИВО:
- Використовуй історію розмови для розуміння контексту (наприклад, "цей проект", "той кошторис" тощо)
- Надай коротку, точну відповідь українською мовою на основі даних та контексту вище
- Використовуй форматування з емодзі для кращої читабельності
- Будь конкретним, вказуй цифри та суми
- Коли потрібно щось порахувати - обов'язково показуй формулу та розрахунок
- Якщо потрібно розрахувати податки - покажи детальний розрахунок по кожному податку
- Для прогнозів - вказуй на основі яких даних робиться прогноз
- Якщо дані неповні - скажи що саме потрібно уточнити
- Не вигадуй дані, використовуй тільки те що є вище

ПРИКЛАДИ РОЗРАХУНКІВ:
- "Скільки ПДВ на 100000?" → 100000 × 20% = 20000 грн. Разом: 120000 грн
- "Виділи ПДВ з 120000" → База: 100000 грн, ПДВ: 20000 грн
- "Яка маржа якщо собівартість 80000 а продали за 100000?" → Маржа: 20000 грн (20%), Націнка: 25%
- "Скільки податків на зарплату 20000?" → ЄСВ: 4400, ПДФО: 3600, ВЗ: 300, На руки: 16100
- "Коли завершимо проект?" → На основі прогресу XX% за YY днів = ще ZZ днів
- "Скільки бетону на фундамент 10×8×0.4м?" → Об'єм: 32 м³, Рекомендовано замовити: 34 м³ (з запасом)
- "Скільки цегли на 100м² стіни?" → При нормі 50 шт/м² + 10% запас = 5500 шт
- "Відхилення від бюджету?" → План: XXX грн, Факт: YYY грн, Відхилення: ±ZZZ грн (±N%)
- "Прогноз витрат на 3 місяці з інфляцією 2%?" → Місяць 1: XXX, Місяць 2: YYY, Місяць 3: ZZZ

💡 КОЛИ ВИКОРИСТОВУВАТИ РОЗРАХУНКИ:
- Користувач питає "скільки", "розрахуй", "порахуй"
- Потрібно показати податки, маржу, рентабельність
- Треба спрогнозувати терміни або витрати
- Аналіз відхилень від бюджету
- Розрахунок кількості матеріалів
`;

    console.log('Calling Gemini API...');
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log('Gemini API response received');

    return response.text();
  } catch (error) {
    console.error('AI Admin query error:', error);
    console.error('Error details:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    return '❌ Помилка при обробці запиту. Спробуйте перефразувати або використати команди: /menu';
  }
}

// Аналіз інтенції запиту
async function analyzeIntent(query: string) {
  const lowerQuery = query.toLowerCase();

  return {
    needsProjects: lowerQuery.includes('проект') || lowerQuery.includes('будів') || lowerQuery.includes('об\'єкт'),
    needsEstimates:
      lowerQuery.includes('кошторис') ||
      lowerQuery.includes('калькул') ||
      lowerQuery.includes('розрахун') ||
      lowerQuery.includes('матеріал') ||
      lowerQuery.includes('ціна') ||
      lowerQuery.includes('ціну') ||
      lowerQuery.includes('позиці') ||
      lowerQuery.includes('робот') ||
      lowerQuery.includes('витрат') ||
      lowerQuery.includes('потрат') ||
      lowerQuery.includes('сума') ||
      lowerQuery.includes('вартіст'),
    needsPayments: lowerQuery.includes('платіж') || lowerQuery.includes('оплат') || lowerQuery.includes('гроші') || lowerQuery.includes('борг'),
    projectName: extractProjectName(lowerQuery),
    category: extractCategory(lowerQuery)
  };
}

function extractProjectName(query: string): string | null {
  // Спроба витягти назву проекту з запиту
  const patterns = [
    /проект[іа]?\s+["']?([^"']+)["']?/i,
    /в\s+проект[іа]?\s+["']?([^"']+)["']?/i,
    /для\s+["']?([^"']+)["']?/i
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractCategory(query: string): string | null {
  const categories = [
    'фундамент', 'фундаментн',
    'стін', 'стен', 'мурування',
    'дах', 'покрівл',
    'інженер', 'комунікац',
    'оздоблен', 'обробл', 'штукатур',
    'електрик', 'електромонтаж',
    'сантехнік', 'водопровід'
  ];

  for (const cat of categories) {
    if (query.includes(cat)) {
      return cat;
    }
  }

  return null;
}
