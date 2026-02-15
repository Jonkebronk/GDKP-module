import { PrismaClient } from '../packages/prisma-client/generated/client/index.js';

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({
  where: { discord_id: '354710757109268481' }
});

console.log('User found:', JSON.stringify(user, null, 2));

await prisma.$disconnect();
