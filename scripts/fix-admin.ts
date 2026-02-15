// Run with: railway run npx tsx scripts/fix-admin.ts
import { PrismaClient } from '../packages/prisma-client/generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  const discordId = '354710757109268481';

  const user = await prisma.user.update({
    where: { discord_id: discordId },
    data: {
      role: 'ADMIN',
      session_status: 'APPROVED',
    },
  });

  console.log('Updated user:', user.discord_username);
  console.log('Role:', user.role);
  console.log('Session status:', user.session_status);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
