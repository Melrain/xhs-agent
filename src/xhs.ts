import { invoke } from '@tauri-apps/api/core';

export type XhsProbeKind = 'missing_cli' | 'logged_out' | 'logged_in' | 'error';

export type XhsUserView = {
  xhsUserId: string;
  redId?: string;
  nickname: string;
  bio?: string;
};

export type XhsProbe = {
  kind: XhsProbeKind;
  command: string;
  message: string;
  cliPath?: string;
  user?: XhsUserView;
};

export type XhsQrPhase =
  | 'idle'
  | 'waiting'
  | 'scanned'
  | 'confirming'
  | 'confirmed'
  | 'expired'
  | 'error';

export type XhsQrSessionView = {
  phase: XhsQrPhase;
  sessionId?: string;
  qrUrl?: string;
  expiresAt?: string;
  message?: string;
};

export function xhsStatus(): Promise<XhsProbe> {
  return invoke<XhsProbe>('xhs_status');
}

export function xhsLoginStart(): Promise<XhsQrSessionView> {
  return invoke<XhsQrSessionView>('xhs_login_start');
}

export function xhsLoginStatus(): Promise<XhsQrSessionView> {
  return invoke<XhsQrSessionView>('xhs_login_status');
}

export function xhsLoginCancel(): Promise<import('./session').SessionSnapshot> {
  return invoke('xhs_login_cancel');
}

export function kindLabel(kind: XhsProbeKind | 'idle'): string {
  switch (kind) {
    case 'logged_in':
      return '已登录';
    case 'logged_out':
      return '未登录';
    case 'missing_cli':
      return '需安装 CLI';
    case 'error':
      return '出错';
    default:
      return '未检查';
  }
}

export function isLoginActive(phase?: XhsQrPhase): boolean {
  return phase === 'waiting' || phase === 'scanned' || phase === 'confirming';
}

export function loginMessage(session: XhsQrSessionView | null): string {
  if (!session || session.phase === 'idle') {
    return '';
  }
  if (session.message) {
    return session.message;
  }
  switch (session.phase) {
    case 'waiting':
      return '请在弹出的浏览器窗口里扫码';
    case 'scanned':
      return '已扫码，请在手机上确认';
    case 'confirming':
      return '正在保存登录…';
    case 'confirmed':
      return '登录成功';
    case 'expired':
      return '扫码已超时，请重新登录';
    case 'error':
      return '扫码失败';
    default:
      return '';
  }
}
