import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
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

      return {
        id: wowheadId,
        name: data.name,
        icon: data.icon || 'inv_misc_questionmark',
        quality: data.quality || 4,
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
};

export default itemRoutes;
