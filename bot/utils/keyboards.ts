import { Markup } from 'telegraf';

export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Мої проекти', 'menu:projects')],
    [Markup.button.callback('💰 Платежі', 'menu:payments')],
    [Markup.button.callback('📊 Кошториси', 'menu:estimates')],
    [Markup.button.callback('ℹ️ Допомога', 'menu:help')]
  ]);
}

export function projectsKeyboard(projects: Array<{ id: string; title: string }>) {
  const buttons = projects.slice(0, 5).map(project => [
    Markup.button.callback(
      project.title.substring(0, 30) + (project.title.length > 30 ? '...' : ''),
      `project:${project.id}`
    )
  ]);

  // Додаємо кнопку "Назад до меню"
  buttons.push([Markup.button.callback('🔙 Назад до меню', 'back_to_menu')]);

  return Markup.inlineKeyboard(buttons);
}

export function projectDetailKeyboard(projectId: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💰 Бюджет і платежі', `project_budget:${projectId}`)],
    [Markup.button.callback('📊 Кошториси', `project_estimates:${projectId}`)],
    [Markup.button.callback('📸 Фото звіти', `project_photos:${projectId}`)],
    [Markup.button.callback('« Назад до списку', 'menu:projects')]
  ]);
}

export function backButton(callbackData: string = 'menu:main') {
  return Markup.inlineKeyboard([
    [Markup.button.callback('« Назад', callbackData)]
  ]);
}
