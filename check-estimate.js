const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const estimate = await prisma.estimate.findFirst({
      where: { number: { contains: 'EST-1775732310050' } },
      select: {
        id: true,
        number: true,
        totalAmount: true,
        finalAmount: true,
        analysisSummary: true,
        prozorroAnalysis: true,
        prozorroChecked: true,
      }
    });

    console.log('📊 Кошторис з БД:');
    console.log(JSON.stringify(estimate, null, 2));

    if (estimate?.analysisSummary) {
      console.log('\n✅ Analysis Summary є (довжина:', estimate.analysisSummary.length, 'символів)');
    } else {
      console.log('\n❌ Analysis Summary відсутній');
    }

    if (estimate?.prozorroAnalysis) {
      console.log('✅ Prozorro Analysis є');
    } else {
      console.log('❌ Prozorro Analysis відсутній');
    }

  } catch (error) {
    console.error('❌ Помилка:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();
