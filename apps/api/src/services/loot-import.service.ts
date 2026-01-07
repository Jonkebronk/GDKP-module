import pako from 'pako';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { GargulLootEntry, RCLootCouncilEntry, LootImportResult } from '@gdkp/shared';

/**
 * Parse Gargul addon export data
 * Format: base64 encoded -> zlib compressed -> JSON
 */
export async function parseGargulExport(encodedData: string): Promise<GargulLootEntry[]> {
  try {
    // Step 1: Base64 decode
    const binaryString = Buffer.from(encodedData, 'base64');

    // Step 2: Zlib decompress
    const decompressed = pako.inflate(binaryString, { to: 'string' });

    // Step 3: Parse JSON
    const data = JSON.parse(decompressed);

    // Gargul exports can have different structures
    // Common format: { AwardHistory: [...], ... }
    let entries: GargulLootEntry[] = [];

    if (data.AwardHistory && Array.isArray(data.AwardHistory)) {
      entries = data.AwardHistory.map((entry: any) => ({
        itemId: extractItemIdFromLink(entry.itemLink || entry.link),
        itemLink: entry.itemLink || entry.link || '',
        player: entry.winner || entry.player || 'Unknown',
        gold: entry.gold || entry.price || 0,
        timestamp: entry.timestamp || Date.now(),
      }));
    } else if (Array.isArray(data)) {
      // Direct array format
      entries = data.map((entry: any) => ({
        itemId: extractItemIdFromLink(entry.itemLink || entry.link),
        itemLink: entry.itemLink || entry.link || '',
        player: entry.winner || entry.player || 'Unknown',
        gold: entry.gold || entry.price || 0,
        timestamp: entry.timestamp || Date.now(),
      }));
    }

    logger.info({ count: entries.length }, 'Parsed Gargul export');
    return entries;
  } catch (error) {
    logger.error({ error }, 'Failed to parse Gargul export');
    throw new Error('Invalid Gargul export format. Please copy the full export string from the addon.');
  }
}

/**
 * Extract WoW item ID from item link
 * Item link format: |cff...|Hitem:ITEMID:...|h[Item Name]|h|r
 */
function extractItemIdFromLink(itemLink: string): number {
  if (!itemLink) return 0;

  // Pattern: item:ITEMID:
  const match = itemLink.match(/item:(\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }

  // Fallback: just a number
  const numMatch = itemLink.match(/(\d{4,6})/);
  if (numMatch && numMatch[1]) {
    return parseInt(numMatch[1], 10);
  }

  return 0;
}

/**
 * Parse RCLootCouncil CSV export
 * Format: CSV with headers
 */
export async function parseRCLootCouncilCSV(csvData: string): Promise<RCLootCouncilEntry[]> {
  try {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Parse header
    const headers = parseCSVLine(lines[0]);
    const headerMap: Record<string, number> = {};
    headers.forEach((h, i) => {
      headerMap[h.toLowerCase().trim()] = i;
    });

    // Required columns
    const requiredCols = ['player', 'itemid'];
    for (const col of requiredCols) {
      if (headerMap[col] === undefined) {
        throw new Error(`Missing required column: ${col}`);
      }
    }

    // Parse data rows
    const entries: RCLootCouncilEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;

      const itemIdStr = values[headerMap['itemid']] || values[headerMap['item id']];
      const itemId = parseInt(itemIdStr, 10);

      if (isNaN(itemId) || itemId <= 0) continue;

      entries.push({
        player: values[headerMap['player']] || 'Unknown',
        date: values[headerMap['date']] || '',
        time: values[headerMap['time']] || '',
        itemID: itemId,
        item: values[headerMap['item']] || '',
        response: values[headerMap['response']] || '',
        instance: values[headerMap['instance']] || '',
        boss: values[headerMap['boss']] || '',
      });
    }

    logger.info({ count: entries.length }, 'Parsed RCLootCouncil CSV');
    return entries;
  } catch (error) {
    logger.error({ error }, 'Failed to parse RCLootCouncil CSV');
    throw new Error('Invalid RCLootCouncil CSV format. Please export from the addon with default settings.');
  }
}

/**
 * Simple CSV line parser that handles quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Import loot history from parsed entries
 */
export async function importLootHistory(
  entries: { itemId: number; player?: string; gold?: number; timestamp?: number }[],
  source: 'gargul' | 'rclootcouncil',
  raidId?: string
): Promise<LootImportResult> {
  const result: LootImportResult = {
    success: true,
    imported_count: 0,
    matched_count: 0,
    unmatched_items: [],
    errors: [],
  };

  // Get all item IDs from entries
  const itemIds = [...new Set(entries.map((e) => e.itemId).filter((id) => id > 0))];

  if (itemIds.length === 0) {
    result.success = false;
    result.errors.push('No valid item IDs found in import data');
    return result;
  }

  // Find matching TBC items in database
  const tbcItems = await prisma.tbcRaidItem.findMany({
    where: {
      wowhead_id: { in: itemIds },
    },
  });

  const tbcItemMap = new Map(tbcItems.map((item) => [item.wowhead_id, item]));

  logger.info(
    { total: itemIds.length, matched: tbcItemMap.size },
    'Matching items to TBC database'
  );

  // Import each entry
  for (const entry of entries) {
    if (entry.itemId <= 0) continue;

    const tbcItem = tbcItemMap.get(entry.itemId);

    if (!tbcItem) {
      result.unmatched_items.push(`Item ID ${entry.itemId}`);
      continue;
    }

    try {
      await prisma.lootHistory.create({
        data: {
          tbc_item_id: tbcItem.id,
          raid_id: raidId || null,
          winner_name: entry.player || null,
          gold_amount: entry.gold || null,
          import_source: source,
          dropped_at: entry.timestamp ? new Date(entry.timestamp) : new Date(),
        },
      });

      result.imported_count++;
      result.matched_count++;
    } catch (error) {
      logger.error({ error, itemId: entry.itemId }, 'Failed to import loot entry');
      result.errors.push(`Failed to import item ${entry.itemId}`);
    }
  }

  // Deduplicate unmatched items
  result.unmatched_items = [...new Set(result.unmatched_items)];

  logger.info(
    {
      imported: result.imported_count,
      unmatched: result.unmatched_items.length,
      errors: result.errors.length,
    },
    'Loot import completed'
  );

  return result;
}

/**
 * Get all TBC items with optional filters
 */
export async function getTbcItems(filters: {
  raid_instance?: string;
  boss_name?: string;
  slot?: string;
  quality?: number;
  phase?: number;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { raid_instance, boss_name, slot, quality, phase, search, page = 1, limit = 50 } = filters;

  const where: any = {};

  if (raid_instance) {
    where.raid_instance = raid_instance;
  }

  if (boss_name) {
    where.boss_name = boss_name;
  }

  if (slot) {
    where.slot = slot;
  }

  if (quality !== undefined) {
    where.quality = quality;
  }

  if (phase !== undefined) {
    where.phase = phase;
  }

  if (search) {
    where.name = {
      contains: search,
      mode: 'insensitive',
    };
  }

  const [items, total] = await Promise.all([
    prisma.tbcRaidItem.findMany({
      where,
      orderBy: [{ raid_instance: 'asc' }, { boss_name: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: {
          select: { loot_history: true },
        },
      },
    }),
    prisma.tbcRaidItem.count({ where }),
  ]);

  // Transform to include drop count
  const itemsWithDropCount = items.map((item) => ({
    ...item,
    drop_count: item._count.loot_history,
  }));

  return {
    items: itemsWithDropCount,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}

/**
 * Search items by name
 */
export async function searchItems(query: string, limit = 20) {
  return prisma.tbcRaidItem.findMany({
    where: {
      name: {
        contains: query,
        mode: 'insensitive',
      },
    },
    orderBy: { name: 'asc' },
    take: limit,
  });
}

/**
 * Get items by raid instance
 */
export async function getItemsByInstance(instance: string) {
  return prisma.tbcRaidItem.findMany({
    where: { raid_instance: instance },
    orderBy: [{ boss_name: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { loot_history: true },
      },
    },
  });
}

/**
 * Get loot history with pagination
 */
export async function getLootHistory(filters: {
  item_id?: string;
  page?: number;
  limit?: number;
}) {
  const { item_id, page = 1, limit = 50 } = filters;

  const where: any = {};

  if (item_id) {
    where.tbc_item_id = item_id;
  }

  const [entries, total] = await Promise.all([
    prisma.lootHistory.findMany({
      where,
      orderBy: { dropped_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        tbc_item: true,
      },
    }),
    prisma.lootHistory.count({ where }),
  ]);

  return {
    entries,
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit),
  };
}
