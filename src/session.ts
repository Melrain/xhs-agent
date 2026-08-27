import { invoke } from '@tauri-apps/api/core';
import type { XhsProbe } from './xhs';

export type StoredAccount = {
  xhsUserId: string;
  redId?: string;
  nickname: string;
  bio?: string;
  sessionOk: boolean;
  lastUsedAt: number;
  hasSession: boolean;
  isActive: boolean;
};

export type SessionSnapshot = {
  accounts: StoredAccount[];
  activeAccountId?: string | null;
  probe: XhsProbe;
};

export function sessionBoot(): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('session_boot');
}

export function sessionSnapshot(): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('session_snapshot');
}

export function sessionSwitch(accountId: string): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('session_switch', { accountId });
}

export function sessionRemove(accountId: string): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('session_remove', { accountId });
}

export function sessionAdopt(): Promise<SessionSnapshot> {
  return invoke<SessionSnapshot>('session_adopt');
}

export function accountLabel(account: StoredAccount): string {
  const name = account.nickname || account.redId || account.xhsUserId;
  if (!account.hasSession) {
    return `${name}（无 session）`;
  }
  if (!account.sessionOk) {
    return `${name}（已过期）`;
  }
  return name;
}
