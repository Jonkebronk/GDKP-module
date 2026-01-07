export type RaidStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type ParticipantRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export interface SplitConfig {
  type: 'equal' | 'custom' | 'role_based';
  leader_cut_percent?: number;
  custom_shares?: Record<string, number>;
}

export interface Raid {
  id: string;
  name: string;
  instance: string;
  leader_id: string;
  status: RaidStatus;
  pot_total: number;
  split_config: SplitConfig;
  created_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
}

export interface RaidWithLeader extends Raid {
  leader: {
    id: string;
    discord_username: string;
    discord_avatar: string | null;
  };
}

export interface RaidParticipant {
  id: string;
  raid_id: string;
  user_id: string;
  role: ParticipantRole;
  payout_amount: number | null;
  paid_at: Date | null;
  joined_at: Date;
  user: {
    id: string;
    discord_username: string;
    discord_avatar: string | null;
  };
}

export interface CreateRaidInput {
  name: string;
  instance: string;
  split_config: SplitConfig;
}

export interface UpdateRaidInput {
  name?: string;
  split_config?: SplitConfig;
}

export const WOW_INSTANCES = [
  'Karazhan',
  'Gruul\'s Lair',
  'Magtheridon\'s Lair',
  'Serpentshrine Cavern',
  'Tempest Keep',
  'Mount Hyjal',
  'Black Temple',
  "Zul'Aman",
  'Sunwell Plateau',
  'Custom',
] as const;

export type WowInstance = typeof WOW_INSTANCES[number];
