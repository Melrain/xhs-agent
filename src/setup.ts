import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type SetupStep = {
  id: string;
  title: string;
  status: "waiting" | "running" | "done" | "error" | string;
  detail: string;
};

export type SetupReport = {
  ready: boolean;
  message: string;
  steps: SetupStep[];
};

export function setupProbe(): Promise<SetupReport> {
  return invoke<SetupReport>("setup_probe");
}

export function setupEnsure(): Promise<SetupReport> {
  return invoke<SetupReport>("setup_ensure");
}

const progressListeners = new Set<(report: SetupReport) => void>();

export function subscribeSetupProgress(listener: (report: SetupReport) => void) {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
}

function emitSetupProgress(report: SetupReport) {
  for (const listener of progressListeners) listener(report);
}

let ensureInFlight: Promise<SetupReport> | null = null;

/** 同一次安装只跑一遍，切页 / StrictMode 双挂载会复用同一个 Promise。 */
export function ensureRuntimeOnce(): Promise<SetupReport> {
  if (ensureInFlight) return ensureInFlight;
  ensureInFlight = (async () => {
    const first = await setupProbe();
    emitSetupProgress(first);
    if (first.ready) return first;
    const unlisten = await listen<SetupReport>("setup-progress", (event) => {
      emitSetupProgress(event.payload);
    });
    try {
      const result = await setupEnsure();
      emitSetupProgress(result);
      return result;
    } finally {
      unlisten();
    }
  })().finally(() => {
    ensureInFlight = null;
  });
  return ensureInFlight;
}
