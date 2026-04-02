// Калькулятор для будівельних розрахунків

export class BuildingCalculator {
  // Податки України
  static readonly TAX_RATES = {
    PDV: 0.20,      // ПДВ 20%
    ESV: 0.22,      // ЄСВ 22%
    PDFO: 0.18,     // ПДФО 18%
    VZ: 0.015,      // Військовий збір 1.5%
    PP: 0.18        // Податок на прибуток 18%
  };

  /**
   * Розрахунок ПДВ
   */
  static calculatePDV(amount: number, includePDV = false): {
    base: number;
    pdv: number;
    total: number;
  } {
    if (includePDV) {
      // Сума вже включає ПДВ, треба виділити
      const base = amount / 1.20;
      const pdv = amount - base;
      return { base, pdv, total: amount };
    } else {
      // Нараховуємо ПДВ на суму
      const pdv = amount * this.TAX_RATES.PDV;
      return { base: amount, pdv, total: amount + pdv };
    }
  }

  /**
   * Розрахунок всіх податків на ФОП
   */
  static calculatePayrollTaxes(grossSalary: number): {
    gross: number;
    esv: number;
    pdfo: number;
    vz: number;
    totalTax: number;
    netSalary: number;
  } {
    const esv = grossSalary * this.TAX_RATES.ESV;
    const pdfo = grossSalary * this.TAX_RATES.PDFO;
    const vz = grossSalary * this.TAX_RATES.VZ;
    const totalTax = esv + pdfo + vz;
    const netSalary = grossSalary - pdfo - vz;

    return {
      gross: grossSalary,
      esv,
      pdfo,
      vz,
      totalTax,
      netSalary
    };
  }

  /**
   * Розрахунок маржі та націнки
   */
  static calculateMargin(cost: number, price: number): {
    cost: number;
    price: number;
    margin: number;
    marginPercent: number;
    markup: number;
    markupPercent: number;
  } {
    const margin = price - cost;
    const marginPercent = (margin / price) * 100;
    const markupPercent = (margin / cost) * 100;

    return {
      cost,
      price,
      margin,
      marginPercent,
      markup: margin,
      markupPercent
    };
  }

  /**
   * Розрахунок рентабельності
   */
  static calculateProfitability(
    revenue: number,
    costs: number
  ): {
    revenue: number;
    costs: number;
    profit: number;
    profitability: number;
    roi: number;
  } {
    const profit = revenue - costs;
    const profitability = (profit / revenue) * 100;
    const roi = (profit / costs) * 100;

    return {
      revenue,
      costs,
      profit,
      profitability,
      roi
    };
  }

  /**
   * Розрахунок необхідної кількості матеріалу
   */
  static calculateMaterialQuantity(
    area: number,
    consumptionPer1m2: number,
    wastePercent = 10
  ): {
    area: number;
    consumption: number;
    baseQuantity: number;
    waste: number;
    totalQuantity: number;
  } {
    const baseQuantity = area * consumptionPer1m2;
    const waste = baseQuantity * (wastePercent / 100);
    const totalQuantity = baseQuantity + waste;

    return {
      area,
      consumption: consumptionPer1m2,
      baseQuantity,
      waste,
      totalQuantity
    };
  }

  /**
   * Розрахунок об'єму бетону
   */
  static calculateConcreteVolume(
    length: number,
    width: number,
    height: number
  ): {
    length: number;
    width: number;
    height: number;
    volume: number;
    recommendedOrder: number;
  } {
    const volume = length * width * height;
    const recommendedOrder = Math.ceil(volume * 1.05); // +5% запас

    return {
      length,
      width,
      height,
      volume,
      recommendedOrder
    };
  }

  /**
   * Прогноз витрат з урахуванням інфляції
   */
  static forecastWithInflation(
    currentAmount: number,
    months: number,
    monthlyInflation = 1.0
  ): Array<{
    month: number;
    amount: number;
    totalInflation: number;
  }> {
    const forecast = [];
    for (let i = 1; i <= months; i++) {
      const inflationRate = monthlyInflation / 100;
      const amount = currentAmount * Math.pow(1 + inflationRate, i);
      const totalInflation = ((amount - currentAmount) / currentAmount) * 100;

      forecast.push({
        month: i,
        amount,
        totalInflation
      });
    }
    return forecast;
  }

  /**
   * Розрахунок дати завершення проекту
   */
  static estimateCompletionDate(
    startDate: Date,
    currentProgress: number,
    targetProgress = 100
  ): {
    startDate: Date;
    currentProgress: number;
    targetProgress: number;
    daysPassed: number;
    estimatedTotalDays: number;
    remainingDays: number;
    estimatedCompletionDate: Date;
    isOnTrack: boolean;
  } {
    const daysPassed = Math.floor(
      (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const estimatedTotalDays =
      currentProgress > 0 ? (daysPassed / currentProgress) * targetProgress : 0;
    const remainingDays = Math.ceil(estimatedTotalDays - daysPassed);
    const estimatedCompletionDate = new Date(
      Date.now() + remainingDays * 24 * 60 * 60 * 1000
    );

    // Вважаємо що проект "на треку" якщо прогрес відповідає часу
    const expectedProgress = (daysPassed / estimatedTotalDays) * targetProgress;
    const isOnTrack = currentProgress >= expectedProgress * 0.95;

    return {
      startDate,
      currentProgress,
      targetProgress,
      daysPassed,
      estimatedTotalDays,
      remainingDays,
      estimatedCompletionDate,
      isOnTrack
    };
  }

  /**
   * Бюджетний аналіз - відхилення від плану
   */
  static analyzeBudgetVariance(
    planned: number,
    actual: number
  ): {
    planned: number;
    actual: number;
    variance: number;
    variancePercent: number;
    status: 'OK' | 'WARNING' | 'CRITICAL';
  } {
    const variance = actual - planned;
    const variancePercent = (variance / planned) * 100;

    let status: 'OK' | 'WARNING' | 'CRITICAL' = 'OK';
    if (variancePercent > 10) status = 'CRITICAL';
    else if (variancePercent > 5) status = 'WARNING';

    return {
      planned,
      actual,
      variance,
      variancePercent,
      status
    };
  }

  /**
   * Розрахунок вартості робочої сили
   */
  static calculateLaborCost(
    hours: number,
    hourlyRate: number,
    workers = 1
  ): {
    hours: number;
    hourlyRate: number;
    workers: number;
    totalHours: number;
    baseCost: number;
    withTaxes: number;
  } {
    const totalHours = hours * workers;
    const baseCost = totalHours * hourlyRate;

    // Розрахунок з податками (ЄСВ, ПДФО, ВЗ)
    const taxes = this.calculatePayrollTaxes(baseCost);
    const withTaxes = baseCost + taxes.esv;

    return {
      hours,
      hourlyRate,
      workers,
      totalHours,
      baseCost,
      withTaxes
    };
  }
}
