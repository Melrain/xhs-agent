import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string };

export async function checkAppUpdate(): Promise<Update | null> {
  return check();
}

export async function installAppUpdate(
  update: Update,
  onProgress: (percent: number) => void,
): Promise<void> {
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
      onProgress(0);
    }
    if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      onProgress(total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0);
    }
    if (event.event === 'Finished') {
      onProgress(100);
    }
  });
  await relaunch();
}
