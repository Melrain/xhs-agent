import { invoke } from '@tauri-apps/api/core';

export type SetupStep = {
  id: string;
  title: string;
  status: 'waiting' | 'running' | 'done' | 'error' | string;
  detail: string;
};

export type SetupReport = {
  ready: boolean;
  message: string;
  steps: SetupStep[];
};

export function setupProbe(): Promise<SetupReport> {
  return invoke<SetupReport>('setup_probe');
}

export function setupEnsure(): Promise<SetupReport> {
  return invoke<SetupReport>('setup_ensure');
}
