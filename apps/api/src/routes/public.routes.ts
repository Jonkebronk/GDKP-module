import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { TBC_RAID_INSTANCES, ITEM_SLOTS } from '@gdkp/shared';

const itemFiltersSchema = z.object({
  raid_instance: z.string().optional(),
  boss_name: z.string().optional(),
  slot: z.string().optional(),
  quality: z.coerce.number().min(0).max(5).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(100),
});

const batchIdsSchema = z.object({
  ids: z.string().transform((str) => {
    const ids = str.split(',').map((id) => parseInt(id.trim(), 10));
    return ids.filter((id) => !isNaN(id) && id > 0);
  }),
});

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /public/items - List TBC raid items with filters (no auth required)
   */
  fastify.get('/items', async (request) => {
    const query = request.query as Record<string, string>;
    const filters = itemFiltersSchema.parse(query);

    const where: Record<string, unknown> = {};

    if (filters.raid_instance) {
      where.raid_instance = filters.raid_instance;
    }
    if (filters.boss_name) {
      where.boss_name = filters.boss_name;
    }
    if (filters.slot) {
      where.slot = filters.slot;
    }
    if (filters.quality !== undefined) {
      where.quality = filters.quality;
    }
    if (filters.search) {
      where.name = {
        contains: filters.search,
        mode: 'insensitive',
      };
    }

    const [items, total] = await Promise.all([
      prisma.tbcRaidItem.findMany({
        where,
        orderBy: [{ boss_name: 'asc' }, { name: 'asc' }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.tbcRaidItem.count({ where }),
    ]);

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
      total_pages: Math.ceil(total / filters.limit),
    };
  });

  /**
   * GET /public/items/instances - List all TBC raid instances with item counts
   */
  fastify.get('/items/instances', async () => {
    // Get counts per instance
    const counts = await prisma.tbcRaidItem.groupBy({
      by: ['raid_instance'],
      _count: { id: true },
    });

    const countMap = new Map(counts.map((c) => [c.raid_instance, c._count.id]));

    const instances = TBC_RAID_INSTANCES.map((instance) => ({
      ...instance,
      item_count: countMap.get(instance.name) || 0,
    }));

    return { instances };
  });

  /**
   * GET /public/items/batch - Fetch items by wowhead_ids
   */
  fastify.get('/items/batch', async (request, reply) => {
    const query = request.query as Record<string, string>;

    if (!query.ids) {
      return reply.status(400).send({ error: 'ids parameter is required' });
    }

    const { ids } = batchIdsSchema.parse(query);

    if (ids.length === 0) {
      return { items: [] };
    }

    if (ids.length > 100) {
      return reply.status(400).send({ error: 'Maximum 100 items per batch request' });
    }

    const items = await prisma.tbcRaidItem.findMany({
      where: {
        wowhead_id: { in: ids },
      },
      orderBy: { name: 'asc' },
    });

    return { items };
  });

  /**
   * GET /public/items/slots - Get list of item slots
   */
  fastify.get('/items/slots', async () => {
    return { slots: ITEM_SLOTS };
  });

  /**
   * GET /public/items/bosses - Get unique boss names (optionally filtered by instance)
   */
  fastify.get('/items/bosses', async (request) => {
    const query = request.query as Record<string, string>;
    const { raid_instance } = z
      .object({
        raid_instance: z.string().optional(),
      })
      .parse(query);

    const where = raid_instance ? { raid_instance } : {};

    const bosses = await prisma.tbcRaidItem.findMany({
      where,
      select: { boss_name: true },
      distinct: ['boss_name'],
      orderBy: { boss_name: 'asc' },
    });

    // Filter out null/empty boss names and return sorted list
    const bossNames = bosses
      .map((b) => b.boss_name)
      .filter((name): name is string => !!name && name !== 'Unknown')
      .sort();

    return { bosses: bossNames };
  });

  /**
   * GET /public/items/qualities - Get list of unique qualities with labels
   */
  fastify.get('/items/qualities', async () => {
    const qualities = await prisma.tbcRaidItem.findMany({
      select: { quality: true },
      distinct: ['quality'],
      orderBy: { quality: 'desc' },
    });

    const qualityLabels: Record<number, string> = {
      0: 'Poor',
      1: 'Common',
      2: 'Uncommon',
      3: 'Rare',
      4: 'Epic',
      5: 'Legendary',
    };

    return {
      qualities: qualities.map((q) => ({
        value: q.quality,
        label: qualityLabels[q.quality] || 'Unknown',
      })),
    };
  });
};

export default publicRoutes;
