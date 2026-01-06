import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default config
  await prisma.config.upsert({
    where: { key: 'exchange_rates' },
    update: {},
    create: {
      key: 'exchange_rates',
      value: {
        SEK: 100, // 100 gold per SEK
        EUR: 1000, // 1000 gold per EUR
        USD: 900, // 900 gold per USD
        updated_at: new Date().toISOString(),
      },
    },
  });

  await prisma.config.upsert({
    where: { key: 'platform_settings' },
    update: {},
    create: {
      key: 'platform_settings',
      value: {
        platform_fee_percent: 5,
        min_deposit_eur: 5,
        min_withdrawal_eur: 10,
        max_withdrawal_eur: 1000,
        auction_default_duration: 60,
        anti_snipe_threshold_seconds: 30,
        anti_snipe_extension_seconds: 30,
      },
    },
  });

  // Create test admin user (only in development)
  if (process.env.NODE_ENV !== 'production') {
    const adminUser = await prisma.user.upsert({
      where: { discord_id: 'test_admin_123' },
      update: {},
      create: {
        discord_id: 'test_admin_123',
        discord_username: 'TestAdmin',
        discord_avatar: null,
        gold_balance: 100000,
        role: 'ADMIN',
      },
    });

    console.log('Created test admin user:', adminUser.id);

    // Create a test user
    const testUser = await prisma.user.upsert({
      where: { discord_id: 'test_user_456' },
      update: {},
      create: {
        discord_id: 'test_user_456',
        discord_username: 'TestUser',
        discord_avatar: null,
        gold_balance: 50000,
        role: 'USER',
      },
    });

    console.log('Created test user:', testUser.id);

    // Create a test raid
    const testRaid = await prisma.raid.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Test Molten Core Run',
        instance: 'Molten Core',
        leader_id: adminUser.id,
        status: 'PENDING',
        split_config: {
          type: 'equal',
          leader_cut_percent: 10,
        },
      },
    });

    console.log('Created test raid:', testRaid.id);

    // Add participants
    await prisma.raidParticipant.upsert({
      where: {
        raid_id_user_id: {
          raid_id: testRaid.id,
          user_id: adminUser.id,
        },
      },
      update: {},
      create: {
        raid_id: testRaid.id,
        user_id: adminUser.id,
        role: 'LEADER',
      },
    });

    await prisma.raidParticipant.upsert({
      where: {
        raid_id_user_id: {
          raid_id: testRaid.id,
          user_id: testUser.id,
        },
      },
      update: {},
      create: {
        raid_id: testRaid.id,
        user_id: testUser.id,
        role: 'MEMBER',
      },
    });

    // Create some test items
    const testItems = [
      { name: "Perdition's Blade", wowhead_id: 18816 },
      { name: 'Brutality Blade', wowhead_id: 18832 },
      { name: 'Gutgutter', wowhead_id: 17071 },
      { name: "Striker's Mark", wowhead_id: 18713 },
    ];

    for (const item of testItems) {
      await prisma.item.create({
        data: {
          raid_id: testRaid.id,
          name: item.name,
          wowhead_id: item.wowhead_id,
          starting_bid: 100,
          min_increment: 50,
          auction_duration: 60,
        },
      });
    }

    console.log('Created test items');
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
