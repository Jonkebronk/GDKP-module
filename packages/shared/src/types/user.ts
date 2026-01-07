export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  alias: string | null;
  gold_balance: number;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  id: string;
  discord_username: string;
  discord_avatar: string | null;
  alias: string | null;
  gold_balance: number;
}

export interface AuthUser {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  alias: string | null;
  gold_balance: number;
  role: UserRole;
}

// Helper function to get display name (alias or discord_username)
export function getDisplayName(user: { alias?: string | null; discord_username?: string }): string {
  return user.alias || user.discord_username || 'Unknown';
}

// Type for public user display (shown to non-admins)
export interface PublicUser {
  id: string;
  display_name: string;
  discord_avatar: string | null;
}

// Admin user view includes real Discord identity
export interface AdminUserView extends PublicUser {
  discord_username: string;
  alias: string | null;
  role: UserRole;
}
