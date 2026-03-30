/**
 * Перевірка наявності всіх необхідних змінних оточення
 */

const requiredEnvVars = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "NEXTAUTH_URL",
];

const optionalEnvVars = [
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

console.log("🔍 Перевірка змінних оточення\n");

let hasErrors = false;

// Перевірка обов'язкових змінних
console.log("📋 Обов'язкові змінні:");
requiredEnvVars.forEach((varName) => {
  const value = process.env[varName];
  if (!value) {
    console.log(`  ❌ ${varName} - ВІДСУТНЯ`);
    hasErrors = true;
  } else {
    // Приховуємо значення для безпеки
    const maskedValue = value.slice(0, 10) + "***";
    console.log(`  ✅ ${varName} - OK (${maskedValue})`);
  }
});

console.log("\n📋 Опціональні змінні (для додаткових функцій):");
optionalEnvVars.forEach((varName) => {
  const value = process.env[varName];
  if (!value) {
    console.log(`  ⚪ ${varName} - не встановлено`);
  } else {
    const maskedValue = value.slice(0, 10) + "***";
    console.log(`  ✅ ${varName} - OK (${maskedValue})`);
  }
});

console.log("\n" + "=".repeat(50));

if (hasErrors) {
  console.log("❌ Є відсутні обов'язкові змінні!");
  console.log("\nДодайте їх у Vercel:");
  console.log("Settings → Environment Variables\n");
  process.exit(1);
} else {
  console.log("✅ Всі обов'язкові змінні налаштовані правильно!");
  console.log("\nМожна продовжувати деплой.\n");
  process.exit(0);
}
