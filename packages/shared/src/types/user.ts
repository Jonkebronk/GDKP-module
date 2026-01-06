export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  paypal_email: string | null;
  gold_balance: number;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface UserProfile {
  id: string;
  discord_username: string;
  discord_avatar: string | null;
  gold_balance: number;
  available_balance: number; // balance minus locked bids
  has_paypal: boolean;
}

export interface AuthUser {
  id: string;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  role: UserRole;
}
