import { PrismaClient } from './generated/client';
import tbcItemsData from './data/tbc-raid-items.json';

const prisma = new PrismaClient();

interface RaidBossItem {
  id: number;
  name: string;
  slot: string | null;
  quality: number;
}

interface RaidBoss {
  name: string;
  items: RaidBossItem[];
}

interface Raid {
  id: string;
  name: string;
  phase: number;
  size: string;
  bosses: RaidBoss[];
}

async function seedTbcItems() {
  console.log('Seeding TBC Raid Items...');

  const raids = tbcItemsData.raids as Raid[];
  let totalItems = 0;
  let createdItems = 0;
  let skippedItems = 0;

  for (const raid of raids) {
    console.log(`\nProcessing ${raid.name} (Phase ${raid.phase}, ${raid.size})...`);

    for (const boss of raid.bosses) {
      for (const item of boss.items) {
        totalItems++;

        try {
          // Generate icon name from item name (fallback)
          const iconName = `inv_misc_questionmark`;

          await prisma.tbcRaidItem.upsert({
            where: { wowhead_id: item.id },
            update: {
              name: item.name,
              slot: item.slot,
              quality: item.quality,
              raid_instance: raid.name,
              boss_name: boss.name,
              phase: raid.phase,
            },
            create: {
              wowhead_id: item.id,
              name: item.name,
              icon: iconName,
              slot: item.slot,
              quality: item.quality,
              raid_instance: raid.name,
              boss_name: boss.name,
              phase: raid.phase,
            },
          });

          createdItems++;
        } catch (error) {
          console.error(`  Failed to insert item ${item.name} (${item.id}):`, error);
          skippedItems++;
        }
      }
    }

    const raidItemCount = raid.bosses.reduce((sum, boss) => sum + boss.items.length, 0);
    console.log(`  Added ${raidItemCount} items from ${raid.bosses.length} bosses`);
  }

  console.log('\n========================================');
  console.log(`TBC Items Seeding Complete!`);
  console.log(`Total items processed: ${totalItems}`);
  console.log(`Successfully created/updated: ${createdItems}`);
  console.log(`Skipped (errors): ${skippedItems}`);
  console.log('========================================\n');

  // Print summary by raid
  const summary = await prisma.tbcRaidItem.groupBy({
    by: ['raid_instance'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('Items per raid instance:');
  for (const row of summary) {
    console.log(`  ${row.raid_instance}: ${row._count.id} items`);
  }
}

async function main() {
  try {
    await seedTbcItems();
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
