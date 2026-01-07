import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { TBC_RAID_INSTANCES, ITEM_SLOTS } from '@gdkp/shared';
import { prisma } from '../config/database.js';
import {
  parseGargulExport,
  parseRCLootCouncilCSV,
  importLootHistory,
  getTbcItems,
  searchItems,
  getItemsByInstance,
  getLootHistory,
} from '../services/loot-import.service.js';
import { logger } from '../config/logger.js';

const itemFiltersSchema = z.object({
  raid_instance: z.string().optional(),
  boss_name: z.string().optional(),
  slot: z.string().optional(),
  quality: z.coerce.number().min(0).max(5).optional(),
  phase: z.coerce.number().min(1).max(5).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const searchQuerySchema = z.object({
  q: z.string().min(2),
  limit: z.coerce.number().min(1).max(50).default(20),
});

const gargulImportSchema = z.object({
  data: z.string().min(10),
  raid_id: z.string().uuid().optional(),
});

const rclcImportSchema = z.object({
  csv: z.string().min(10),
  raid_id: z.string().uuid().optional(),
});

const wowheadZoneImportSchema = z.object({
  url: z.string().url().refine(
    (url) => url.includes('wowhead.com') && url.includes('zone='),
    { message: 'Must be a WoWhead zone URL (e.g. https://www.wowhead.com/tbc/zone=3457/karazhan)' }
  ),
});

// Zone ID to instance name mapping
const ZONE_ID_TO_INSTANCE: Record<string, string> = {
  '3457': 'Karazhan',
  '3923': "Gruul's Lair",
  '3836': "Magtheridon's Lair",
  '3607': 'Serpentshrine Cavern',
  '3845': 'Tempest Keep',
  '3606': 'Mount Hyjal',
  '3959': 'Black Temple',
  '4075': 'Sunwell Plateau',
  '3805': "Zul'Aman",
};

const addItemSchema = z.object({
  wowhead_id: z.number().int().positive(),
  name: z.string().min(1).max(255),
  icon: z.string().optional(),
  slot: z.string().optional(),
  quality: z.number().int().min(0).max(5).default(4),
  raid_instance: z.string().optional(),
  boss_name: z.string().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slot: z.string().optional(),
  quality: z.number().int().min(0).max(5).optional(),
  raid_instance: z.string().optional(),
  boss_name: z.string().optional(),
});

const itemRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /items - List all TBC raid items with filters
   */
  fastify.get('/', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const filters = itemFiltersSchema.parse(query);

    const result = await getTbcItems(filters);

    return result;
  });

  /**
   * POST /items - Add a new item to the database
   */
  fastify.post('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const data = addItemSchema.parse(request.body);

    // Check if item already exists
    const existing = await prisma.tbcRaidItem.findUnique({
      where: { wowhead_id: data.wowhead_id },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Item already exists',
        item: existing,
      });
    }

    // Create the item
    const item = await prisma.tbcRaidItem.create({
      data: {
        wowhead_id: data.wowhead_id,
        name: data.name,
        icon: data.icon || 'inv_misc_questionmark',
        slot: data.slot || 'Unknown',
        quality: data.quality,
        raid_instance: data.raid_instance || 'Unknown',
        boss_name: data.boss_name || 'Unknown',
        phase: 1,
      },
    });

    logger.info({ userId: request.user.id, itemId: item.id, name: item.name }, 'Item added to database');

    return { success: true, item };
  });

  /**
   * PUT /items/:id - Update an existing item
   */
  fastify.put('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateItemSchema.parse(request.body);

    // Check if item exists
    const existing = await prisma.tbcRaidItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.status(404).send({
        error: 'Item not found',
      });
    }

    // Update the item
    const item = await prisma.tbcRaidItem.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.slot && { slot: data.slot }),
        ...(data.quality !== undefined && { quality: data.quality }),
        ...(data.raid_instance && { raid_instance: data.raid_instance }),
        ...(data.boss_name && { boss_name: data.boss_name }),
      },
    });

    logger.info({ userId: request.user.id, itemId: item.id, name: item.name }, 'Item updated');

    return { success: true, item };
  });

  /**
   * DELETE /items/:id - Delete an item
   */
  fastify.delete('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check if item exists
    const existing = await prisma.tbcRaidItem.findUnique({
      where: { id },
    });

    if (!existing) {
      return reply.status(404).send({
        error: 'Item not found',
      });
    }

    // Delete the item
    await prisma.tbcRaidItem.delete({
      where: { id },
    });

    logger.info({ userId: request.user.id, itemId: id, name: existing.name }, 'Item deleted');

    return { success: true };
  });

  /**
   * GET /items/search - Search items by name (autocomplete)
   */
  fastify.get('/search', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const { q, limit } = searchQuerySchema.parse(query);

    const items = await searchItems(q, limit);

    return { items };
  });

  /**
   * POST /items/:wowheadId/refresh-quality - Refresh item quality from WoWhead (admin only)
   */
  fastify.post('/:wowheadId/refresh-quality', { preHandler: [requireAdmin] }, async (request, reply) => {
    const { wowheadId } = request.params as { wowheadId: string };
    const wowheadIdNum = parseInt(wowheadId);

    if (isNaN(wowheadIdNum) || wowheadIdNum <= 0) {
      return reply.status(400).send({ error: 'Invalid WoWhead ID' });
    }

    // Find item in database
    const existingItem = await prisma.tbcRaidItem.findUnique({
      where: { wowhead_id: wowheadIdNum },
    });

    if (!existingItem) {
      return reply.status(404).send({ error: 'Item not found in database' });
    }

    // Fetch quality from WoWhead
    try {
      const response = await fetch(`https://nether.wowhead.com/tooltip/item/${wowheadIdNum}?dataEnv=5&locale=0`);
      if (!response.ok) {
        return reply.status(404).send({ error: 'Item not found on WoWhead' });
      }

      const data = await response.json() as { quality?: number };
      const newQuality = data.quality ?? 4;

      // Update item quality
      const updatedItem = await prisma.tbcRaidItem.update({
        where: { wowhead_id: wowheadIdNum },
        data: { quality: newQuality },
      });

      logger.info({
        wowheadId: wowheadIdNum,
        oldQuality: existingItem.quality,
        newQuality,
        name: existingItem.name,
      }, 'Refreshed item quality from WoWhead');

      return {
        success: true,
        item: updatedItem,
        oldQuality: existingItem.quality,
        newQuality,
      };
    } catch {
      return reply.status(500).send({ error: 'Failed to fetch from WoWhead' });
    }
  });

  /**
   * GET /items/instances - Get list of TBC raid instances
   */
  fastify.get('/instances', { preHandler: [requireAuth] }, async () => {
    return { instances: TBC_RAID_INSTANCES };
  });

  /**
   * GET /items/slots - Get list of item slots
   */
  fastify.get('/slots', { preHandler: [requireAuth] }, async () => {
    return { slots: ITEM_SLOTS };
  });

  /**
   * GET /items/bosses - Get unique boss names (optionally filtered by instance)
   */
  fastify.get('/bosses', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const { raid_instance } = z.object({
      raid_instance: z.string().optional(),
    }).parse(query);

    const where = raid_instance ? { raid_instance } : {};

    const bosses = await prisma.tbcRaidItem.findMany({
      where,
      select: { boss_name: true },
      distinct: ['boss_name'],
      orderBy: { boss_name: 'asc' },
    });

    // Filter out null/empty boss names and return sorted list
    const bossNames = bosses
      .map(b => b.boss_name)
      .filter((name): name is string => !!name && name !== 'Unknown')
      .sort();

    return { bosses: bossNames };
  });

  /**
   * GET /items/wowhead/:id - Lookup item from WoWhead by ID
   */
  fastify.get('/wowhead/:id', { preHandler: [requireAuth] }, async (request) => {
    const { id } = request.params as { id: string };
    const wowheadId = parseInt(id);

    if (isNaN(wowheadId) || wowheadId <= 0) {
      return { error: 'Invalid WoWhead ID' };
    }

    // First check if we have it in our database
    const existingItem = await prisma.tbcRaidItem.findUnique({
      where: { wowhead_id: wowheadId },
    });

    if (existingItem) {
      return {
        id: existingItem.wowhead_id,
        name: existingItem.name,
        icon: existingItem.icon,
        slot: existingItem.slot,
        quality: existingItem.quality,
        source: 'database',
      };
    }

    // If not in database, try to fetch from WoWhead
    try {
      // dataEnv=5 is for TBC Classic, locale=0 is English
      const response = await fetch(`https://nether.wowhead.com/tooltip/item/${wowheadId}?dataEnv=5&locale=0`);
      if (!response.ok) {
        return { error: 'Item not found on WoWhead' };
      }

      const data = await response.json() as { name?: string; icon?: string; quality?: number };

      if (!data.name) {
        return { error: 'Item not found on WoWhead' };
      }

      const itemQuality = data.quality ?? 4;
      const itemIcon = data.icon || 'inv_misc_questionmark';

      // Save to database for future lookups
      try {
        await prisma.tbcRaidItem.create({
          data: {
            wowhead_id: wowheadId,
            name: data.name,
            icon: itemIcon,
            quality: itemQuality,
            slot: 'Unknown',
            raid_instance: 'Unknown',
            boss_name: 'Unknown',
            phase: 1,
          },
        });
        logger.info({ wowheadId, name: data.name, quality: itemQuality }, 'Saved WoWhead item to database');
      } catch {
        // Item might already exist (race condition), ignore
      }

      return {
        id: wowheadId,
        name: data.name,
        icon: itemIcon,
        quality: itemQuality,
        source: 'wowhead',
      };
    } catch {
      return { error: 'Failed to fetch from WoWhead' };
    }
  });

  /**
   * GET /items/instance/:instance - Get items for a specific raid
   */
  fastify.get('/instance/:instance', { preHandler: [requireAuth] }, async (request) => {
    const { instance } = request.params as { instance: string };

    // Decode URL-encoded instance name
    const decodedInstance = decodeURIComponent(instance);

    const items = await getItemsByInstance(decodedInstance);

    // Group items by boss
    const groupedByBoss: Record<string, typeof items> = {};
    for (const item of items) {
      const bossName = item.boss_name || 'Unknown';
      if (!groupedByBoss[bossName]) {
        groupedByBoss[bossName] = [];
      }
      groupedByBoss[bossName].push(item);
    }

    return {
      instance: decodedInstance,
      total_items: items.length,
      bosses: Object.entries(groupedByBoss).map(([boss, bossItems]) => ({
        name: boss,
        items: bossItems.map((item) => ({
          ...item,
          drop_count: item._count.loot_history,
        })),
      })),
    };
  });

  /**
   * GET /items/history - Get loot drop history
   */
  fastify.get('/history', { preHandler: [requireAuth] }, async (request) => {
    const query = request.query as Record<string, string>;
    const { item_id, page, limit } = z
      .object({
        item_id: z.string().uuid().optional(),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(query);

    const result = await getLootHistory({ item_id, page, limit });

    return result;
  });

  /**
   * POST /items/import/gargul - Import loot from Gargul addon export
   */
  fastify.post('/import/gargul', { preHandler: [requireAuth] }, async (request) => {
    const { data, raid_id } = gargulImportSchema.parse(request.body);

    logger.info({ userId: request.user.id }, 'Starting Gargul import');

    try {
      // Parse the Gargul export
      const entries = await parseGargulExport(data);

      if (entries.length === 0) {
        return {
          success: false,
          imported_count: 0,
          matched_count: 0,
          unmatched_items: [],
          errors: ['No items found in Gargul export'],
        };
      }

      // Import loot history
      const result = await importLootHistory(
        entries.map((e) => ({
          itemId: e.itemId,
          player: e.player,
          gold: e.gold,
          timestamp: e.timestamp,
        })),
        'gargul',
        raid_id
      );

      logger.info(
        { userId: request.user.id, imported: result.imported_count },
        'Gargul import completed'
      );

      return result;
    } catch (error) {
      logger.error({ error, userId: request.user.id }, 'Gargul import failed');

      if (error instanceof Error) {
        return {
          success: false,
          imported_count: 0,
          matched_count: 0,
          unmatched_items: [],
          errors: [error.message],
        };
      }

      return {
        success: false,
        imported_count: 0,
        matched_count: 0,
        unmatched_items: [],
        errors: ['Unknown error during import'],
      };
    }
  });

  /**
   * POST /items/import/rclootcouncil - Import loot from RCLootCouncil CSV
   */
  fastify.post('/import/rclootcouncil', { preHandler: [requireAuth] }, async (request) => {
    const { csv, raid_id } = rclcImportSchema.parse(request.body);

    logger.info({ userId: request.user.id }, 'Starting RCLootCouncil import');

    try {
      // Parse the CSV
      const entries = await parseRCLootCouncilCSV(csv);

      if (entries.length === 0) {
        return {
          success: false,
          imported_count: 0,
          matched_count: 0,
          unmatched_items: [],
          errors: ['No items found in CSV'],
        };
      }

      // Import loot history
      const result = await importLootHistory(
        entries.map((e) => ({
          itemId: e.itemID,
          player: e.player,
        })),
        'rclootcouncil',
        raid_id
      );

      logger.info(
        { userId: request.user.id, imported: result.imported_count },
        'RCLootCouncil import completed'
      );

      return result;
    } catch (error) {
      logger.error({ error, userId: request.user.id }, 'RCLootCouncil import failed');

      if (error instanceof Error) {
        return {
          success: false,
          imported_count: 0,
          matched_count: 0,
          unmatched_items: [],
          errors: [error.message],
        };
      }

      return {
        success: false,
        imported_count: 0,
        matched_count: 0,
        unmatched_items: [],
        errors: ['Unknown error during import'],
      };
    }
  });

  /**
   * POST /items/import/wowhead-zone - Import all drops from a WoWhead zone URL
   */
  fastify.post('/import/wowhead-zone', { preHandler: [requireAuth] }, async (request, reply) => {
    const { url } = wowheadZoneImportSchema.parse(request.body);

    logger.info({ userId: request.user.id, url }, 'Starting WoWhead zone import');

    try {
      // Parse zone ID from URL
      const zoneMatch = url.match(/zone[=:](\d+)/i);
      if (!zoneMatch) {
        return reply.status(400).send({
          success: false,
          error: 'Could not parse zone ID from URL',
        });
      }

      const zoneId = zoneMatch[1];
      const instanceName = ZONE_ID_TO_INSTANCE[zoneId] || 'Unknown';

      // Fetch the WoWhead zone page to get item drops
      const zoneUrl = `https://www.wowhead.com/tbc/zone=${zoneId}#drops`;
      const response = await fetch(zoneUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return reply.status(404).send({
          success: false,
          error: 'Failed to fetch zone data from WoWhead',
        });
      }

      const html = await response.text();

      // Extract item IDs specifically from the "drops" listview section
      const itemIds: number[] = [];

      // Find the drops listview - look for id: 'drops' and then find the data array
      // The data array can be very long with nested objects, so we need a different approach
      const dropsListviewMatch = html.match(/new Listview\(\{[^{]*id:\s*['"]drops['"][^{]*data:\s*\[/);

      if (dropsListviewMatch) {
        // Find where this listview starts and extract items from that section
        const startIndex = dropsListviewMatch.index! + dropsListviewMatch[0].length;

        // Find the end of the data array by counting brackets
        let bracketCount = 1;
        let endIndex = startIndex;
        for (let i = startIndex; i < html.length && bracketCount > 0; i++) {
          if (html[i] === '[') bracketCount++;
          if (html[i] === ']') bracketCount--;
          endIndex = i;
        }

        const dropsData = html.substring(startIndex, endIndex);

        // Extract all item IDs from the drops data
        const idMatches = dropsData.matchAll(/"id"\s*:\s*(\d+)/g);
        for (const m of idMatches) {
          const id = parseInt(m[1]);
          if (id > 0 && !itemIds.includes(id)) {
            itemIds.push(id);
          }
        }
      }

      // Fallback: Try WH.Gatherer.addData for item type (3) with drops
      if (itemIds.length === 0) {
        // WH.Gatherer.addData(TYPE, ID, DATA) - type 3 is items
        const gathererMatches = html.matchAll(/WH\.Gatherer\.addData\(\s*3\s*,\s*\d+\s*,\s*(\{[^}]+\})\)/g);
        for (const m of gathererMatches) {
          const dataStr = m[1];
          const idMatches = dataStr.matchAll(/"(\d+)":/g);
          for (const idm of idMatches) {
            const id = parseInt(idm[1]);
            if (id > 1000 && id < 100000 && !itemIds.includes(id)) {
              itemIds.push(id);
            }
          }
        }
      }

      // Second fallback: Find all listviews with template:'item' and extract from those
      if (itemIds.length === 0) {
        const listviewMatches = html.matchAll(/new Listview\(\{[^}]*template:\s*['"]item['"][^}]*\}/g);
        for (const lvm of listviewMatches) {
          const startPos = html.indexOf('data:', lvm.index);
          if (startPos > 0 && startPos < lvm.index! + 500) {
            // Find items in the next 50000 characters (data arrays can be large)
            const searchSection = html.substring(startPos, startPos + 50000);
            const itemMatches = searchSection.matchAll(/"id"\s*:\s*(\d+)/g);
            for (const m of itemMatches) {
              const id = parseInt(m[1]);
              if (id > 1000 && id < 100000 && !itemIds.includes(id)) {
                itemIds.push(id);
              }
            }
            break; // Just use the first item listview
          }
        }
      }

      if (itemIds.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No drops found on zone page. The page format may have changed.',
        });
      }

      logger.info({ zoneId, instanceName, itemCount: itemIds.length }, 'Found items on WoWhead zone page');

      // Import each item
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];
      const importedItems: { id: number; name: string; quality: number }[] = [];

      for (const wowheadId of itemIds) {
        // Check if item already exists
        const existing = await prisma.tbcRaidItem.findUnique({
          where: { wowhead_id: wowheadId },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Fetch item data from WoWhead tooltip API
        try {
          const tooltipRes = await fetch(
            `https://nether.wowhead.com/tooltip/item/${wowheadId}?dataEnv=5&locale=0`
          );

          if (!tooltipRes.ok) {
            errors.push(`Failed to fetch item ${wowheadId}`);
            continue;
          }

          const tooltipData = await tooltipRes.json() as {
            name?: string;
            icon?: string;
            quality?: number;
            tooltip?: string;
          };

          if (!tooltipData.name) {
            errors.push(`No name for item ${wowheadId}`);
            continue;
          }

          // Try to extract slot from tooltip HTML
          let slot = 'Unknown';
          const tooltipHtml = tooltipData.tooltip || '';
          const slotMatch = tooltipHtml.match(/<!--(Head|Neck|Shoulder|Back|Chest|Wrist|Hands|Waist|Legs|Feet|Finger|Trinket|One-Hand|Two-Hand|Main Hand|Off Hand|Ranged|Relic|Thrown|Wand|Shield|Held In Off-hand)-->/i);
          if (slotMatch) {
            slot = slotMatch[1];
          }

          // Create the item
          await prisma.tbcRaidItem.create({
            data: {
              wowhead_id: wowheadId,
              name: tooltipData.name,
              icon: tooltipData.icon || 'inv_misc_questionmark',
              quality: tooltipData.quality ?? 4,
              slot,
              raid_instance: instanceName,
              boss_name: 'Unknown',
              phase: 1,
            },
          });

          imported++;
          importedItems.push({
            id: wowheadId,
            name: tooltipData.name,
            quality: tooltipData.quality ?? 4,
          });

          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 50));
        } catch (err) {
          errors.push(`Error importing item ${wowheadId}: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }

      logger.info(
        { userId: request.user.id, zoneId, instanceName, imported, skipped, errorCount: errors.length },
        'WoWhead zone import completed'
      );

      return {
        success: true,
        zone_id: zoneId,
        instance: instanceName,
        imported,
        skipped,
        total_found: itemIds.length,
        items: importedItems,
        errors: errors.slice(0, 10),
      };
    } catch (error) {
      logger.error({ error, userId: request.user.id }, 'WoWhead zone import failed');

      if (error instanceof Error) {
        return reply.status(500).send({
          success: false,
          error: error.message,
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Unknown error during import',
      });
    }
  });
};

export default itemRoutes;
