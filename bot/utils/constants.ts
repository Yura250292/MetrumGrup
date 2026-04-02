import { ProjectStatus, ProjectStage, EstimateStatus } from '@prisma/client';
import Decimal from 'decimal.js';

export function translateStatus(status: ProjectStatus | EstimateStatus): string {
  const translations: Record<string, string> = {
    DRAFT: '📝 Чернетка',
    ACTIVE: '✅ Активний',
    ON_HOLD: '⏸ Призупинено',
    COMPLETED: '🏁 Завершено',
    CANCELLED: '❌ Скасовано',
    SENT: '📤 Відправлено',
    APPROVED: '✅ Затверджено',
    REJECTED: '❌ Відхилено',
    REVISION: '🔄 На доопрацюванні',
    ENGINEER_REVIEW: '🔍 Перевірка інженера',
    FINANCE_REVIEW: '💼 Перевірка фінансиста'
  };

  return translations[status] || status;
}

export function translateStage(stage: ProjectStage): string {
  const translations: Record<string, string> = {
    DESIGN: '📐 Проектування',
    FOUNDATION: '🏗 Фундамент',
    WALLS: '🧱 Стіни',
    ROOF: '🏠 Дах',
    ENGINEERING: '⚡️ Інженерія',
    FINISHING: '🎨 Оздоблення',
    HANDOVER: '🔑 Здача'
  };

  return translations[stage] || stage;
}

export function formatCurrency(amount: Decimal | number | string): string {
  const num = typeof amount === 'number'
    ? amount
    : typeof amount === 'string'
    ? parseFloat(amount)
    : parseFloat(amount.toString());

  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(dateObj);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
