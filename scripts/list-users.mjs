import { PrismaClient } from '../packages/prisma-client/generated/client/index.js';

const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  select: {
    id: true,
    discord_id: true,
    discord_username: true,
    alias: true,
    role: true,
    session_status: true
  }
});

console.log('All users:');
users.forEach(u => {
  console.log(`- ${u.alias} | ${u.discord_username} | discord_id: ${u.discord_id} | ${u.role} | ${u.session_status}`);
});

await prisma.$disconnect();
