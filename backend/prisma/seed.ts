import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// plan_limits is the source of truth for tier caps. null = unlimited.
async function main() {
  await prisma.planLimit.upsert({
    where: { plan: 'FREE' },
    update: {},
    create: { plan: 'FREE', dailyMinutes: 30, dailyMatches: 20, adsEnabled: true, filtersEnabled: false },
  });
  for (const plan of ['MONTHLY', 'ANNUAL'] as const) {
    await prisma.planLimit.upsert({
      where: { plan },
      update: {},
      create: { plan, dailyMinutes: null, dailyMatches: null, adsEnabled: false, filtersEnabled: true },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
