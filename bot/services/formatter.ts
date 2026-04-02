import { Project, Estimate, Payment, Material } from '@prisma/client';
import { formatCurrency, translateStatus, translateStage, escapeHtml } from '../utils/constants';

export function formatProjectsList(projects: any[]) {
  if (projects.length === 0) {
    return '📂 Проектів не знайдено';
  }

  let message = `📋 <b>Проекти (${projects.length})</b>\n\n`;

  projects.forEach((project, index) => {
    message += `${index + 1}. <b>${escapeHtml(project.title)}</b>\n`;
    message += `   └ Статус: ${translateStatus(project.status)}\n`;
    message += `   └ Етап: ${translateStage(project.currentStage)} (${project.stageProgress}%)\n`;
    message += `   └ Бюджет: ${formatCurrency(project.totalBudget)}\n`;
    if (project.address) {
      message += `   └ Адреса: ${escapeHtml(project.address)}\n`;
    }
    message += '\n';
  });

  return message;
}

export function formatProjectDetail(project: any) {
  let message = `🏗 <b>${escapeHtml(project.title)}</b>\n\n`;

  message += `<b>Інформація:</b>\n`;
  message += `└ Статус: ${translateStatus(project.status)}\n`;
  message += `└ Етап: ${translateStage(project.currentStage)} (${project.stageProgress}%)\n`;

  if (project.description) {
    message += `└ Опис: ${escapeHtml(project.description)}\n`;
  }

  if (project.address) {
    message += `└ Адреса: ${escapeHtml(project.address)}\n`;
  }

  message += `\n<b>Фінанси:</b>\n`;
  message += `└ Бюджет: ${formatCurrency(project.totalBudget)}\n`;
  message += `└ Оплачено: ${formatCurrency(project.totalPaid)}\n`;

  const remaining = parseFloat(project.totalBudget.toString()) - parseFloat(project.totalPaid.toString());
  message += `└ Залишок: ${formatCurrency(remaining)}\n`;

  if (project.client) {
    message += `\n<b>Клієнт:</b> ${escapeHtml(project.client.name)}\n`;
  }

  if (project.manager) {
    message += `<b>Менеджер:</b> ${escapeHtml(project.manager.name)}\n`;
  }

  return message;
}

export function formatEstimate(estimate: any) {
  let message = `📊 <b>Кошторис ${escapeHtml(estimate.number)}</b>\n\n`;

  message += `<b>${escapeHtml(estimate.title)}</b>\n`;
  message += `Проект: ${escapeHtml(estimate.project.title)}\n`;
  message += `Статус: ${translateStatus(estimate.status)}\n\n`;

  message += `💰 <b>Фінанси:</b>\n`;
  message += `   Матеріали: ${formatCurrency(estimate.totalMaterials)}\n`;
  message += `   Робота: ${formatCurrency(estimate.totalLabor)}\n`;
  message += `   Накладні: ${formatCurrency(estimate.totalOverhead)}\n`;

  if (estimate.taxAmount) {
    message += `   Податки: ${formatCurrency(estimate.taxAmount)}\n`;
  }

  message += `   ━━━━━━━━━━━━━━━\n`;
  message += `   <b>РАЗОМ: ${formatCurrency(estimate.finalAmount || estimate.totalAmount)}</b>\n`;

  if (estimate.description) {
    message += `\n<i>${escapeHtml(estimate.description)}</i>\n`;
  }

  return message;
}

export function formatPaymentsList(payments: any[]) {
  if (payments.length === 0) {
    return '💰 Платежів не знайдено';
  }

  let message = `💰 <b>Платежі (${payments.length})</b>\n\n`;

  payments.forEach((payment, index) => {
    message += `${index + 1}. ${formatCurrency(payment.amount)}\n`;
    message += `   └ Проект: ${escapeHtml(payment.project.title)}\n`;
    message += `   └ Статус: ${translateStatus(payment.status)}\n`;

    if (payment.invoiceNumber) {
      message += `   └ Рахунок: ${escapeHtml(payment.invoiceNumber)}\n`;
    }

    if (payment.paidDate) {
      message += `   └ Дата: ${new Date(payment.paidDate).toLocaleDateString('uk-UA')}\n`;
    }

    message += '\n';
  });

  return message;
}

export function formatMaterialsList(materials: Material[]) {
  if (materials.length === 0) {
    return '📦 Матеріалів не знайдено';
  }

  let message = `📦 <b>Матеріали (${materials.length})</b>\n\n`;

  materials.forEach((material, index) => {
    message += `${index + 1}. <b>${escapeHtml(material.name)}</b>\n`;
    message += `   └ Артикул: ${escapeHtml(material.sku)}\n`;
    message += `   └ Ціна: ${formatCurrency(material.basePrice)} за ${escapeHtml(material.unit)}\n`;

    if (material.category) {
      message += `   └ Категорія: ${escapeHtml(material.category)}\n`;
    }

    message += '\n';
  });

  return message;
}
