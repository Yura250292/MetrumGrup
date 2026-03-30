# Як зробити внесок у проєкт

Дякуємо за ваш інтерес до розвитку Metrum Group Construction Management System!

## 🚀 Початок роботи

1. Зробіть fork репозиторію
2. Створіть гілку для вашої функції: `git checkout -b feature/amazing-feature`
3. Зробіть комміт ваших змін: `git commit -m 'feat: add amazing feature'`
4. Запуште гілку: `git push origin feature/amazing-feature`
5. Створіть Pull Request

## 📝 Формат commit messages

Ми використовуємо [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - нова функція
- `fix:` - виправлення помилки
- `docs:` - зміни в документації
- `style:` - форматування коду
- `refactor:` - рефакторинг коду
- `test:` - додавання тестів
- `chore:` - оновлення залежностей, конфігурації

Приклад:
```
feat: add payment reminder notifications

- Add notification system for upcoming payments
- Send email alerts 3 days before payment due date
- Display notifications in client dashboard
```

## 🧪 Тестування

Перед створенням PR переконайтесь, що:
- [ ] Код запускається без помилок
- [ ] Всі існуючі функції працюють
- [ ] Додано коментарі для складних частин коду
- [ ] Немає console.log() у продакшн коді

## 🎨 Стиль коду

- Використовуйте TypeScript
- Слідуйте ESLint правилам проєкту
- Використовуйте функціональні компоненти React з hooks
- Назви змінних та функцій мають бути зрозумілими
- Компоненти повинні бути невеликими та переважно виконувати одну функцію

## 📁 Структура коду

```
src/
├── app/              # Pages та API routes
├── components/       # React компоненти
│   ├── ui/          # Базові UI компоненти
│   ├── dashboard/   # Компоненти дешборду
│   └── layout/      # Layout компоненти
├── lib/             # Утиліти, хелпери, конфігурація
└── types/           # TypeScript типи
```

## 🐛 Повідомлення про помилки

Якщо ви знайшли помилку:
1. Перевірте, чи не створено вже issue з цією проблемою
2. Створіть новий issue з детальним описом
3. Вкажіть кроки для відтворення помилки
4. Додайте скріншоти, якщо потрібно

## 💡 Пропозиції

Маєте ідею покращення? Створіть issue з міткою "enhancement"!

## ❓ Питання

Є питання? Створіть issue з міткою "question".

---

Дякуємо за ваш внесок! 🙏
