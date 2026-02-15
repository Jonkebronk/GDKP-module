import { PrismaClient } from '../packages/prisma-client/generated/client/index.js';

const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  orderBy: { created_at: 'desc' },
  take: 20,
  select: {
    id: true,
    discord_username: true,
    alias: true,
    gold_balance: true,
    role: true,
    session_status: true,
  },
});

console.log('Users found:', users.length);
users.forEach(u => {
  console.log(`- ${u.alias} | ${u.discord_username} | ${u.role} | ${u.session_status} | ${u.gold_balance}g`);
});

await prisma.$disconnect();
