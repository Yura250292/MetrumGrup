const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

(async () => {
  try {
    const hashedPassword = await bcrypt.hash('test123', 10);

    const user = await prisma.user.upsert({
      where: { email: 'test@test.com' },
      update: {
        password: hashedPassword,
        role: 'SUPER_ADMIN'
      },
      create: {
        email: 'test@test.com',
        name: 'Test Admin',
        password: hashedPassword,
        role: 'SUPER_ADMIN'
      }
    });

    console.log('✅ Створено тестового користувача:');
    console.log('📧 Email: test@test.com');
    console.log('🔑 Пароль: test123');
    console.log('👤 Роль:', user.role);

  } catch (error) {
    console.error('❌ Помилка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
