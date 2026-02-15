import { PrismaClient } from '../packages/prisma-client/generated/client/index.js';

const prisma = new PrismaClient();

const user = await prisma.user.update({
  where: { discord_id: '1463994329881251974' },
  data: { role: 'ADMIN', session_status: 'APPROVED' }
});

console.log('Updated:', user.discord_username);
console.log('Role:', user.role);
console.log('Session status:', user.session_status);

await prisma.$disconnect();
