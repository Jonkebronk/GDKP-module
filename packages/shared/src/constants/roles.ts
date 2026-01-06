import type { UserRole, ParticipantRole } from '../types';

export const USER_ROLES: Record<UserRole, { label: string; priority: number }> = {
  ADMIN: { label: 'Admin', priority: 100 },
  USER: { label: 'User', priority: 0 },
};

export const PARTICIPANT_ROLES: Record<ParticipantRole, { label: string; canStartAuction: boolean; canEditRaid: boolean }> = {
  LEADER: { label: 'Raid Leader', canStartAuction: true, canEditRaid: true },
  OFFICER: { label: 'Officer', canStartAuction: true, canEditRaid: false },
  MEMBER: { label: 'Member', canStartAuction: false, canEditRaid: false },
};

export function canStartAuction(role: ParticipantRole): boolean {
  return PARTICIPANT_ROLES[role]?.canStartAuction ?? false;
}

export function canEditRaid(role: ParticipantRole): boolean {
  return PARTICIPANT_ROLES[role]?.canEditRaid ?? false;
}
