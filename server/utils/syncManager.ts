import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { broadcastEvent } from "./sse";

export interface SyncState {
  isRunning: boolean;
  step: string;
  message: string;
  scannedCount: number;
  importedCount: number;
  error: string | null;
  requiresAuth: boolean;
  startedAt: number | null;
}

const currentSync: SyncState = {
  isRunning: false,
  step: "idle",
  message: "Idle",
  scannedCount: 0,
  importedCount: 0,
  error: null,
  requiresAuth: false,
  startedAt: null,
};

let syncProcess: ChildProcess | null = null;

export function getSyncStatus(): SyncState {
  return { ...currentSync };
}

export function startSyncJob(options: { fullScan?: boolean } = {}): { ok: boolean; message: string } {
  if (currentSync.isRunning) {
    return { ok: false, message: "A sync job is already in progress." };
  }

  currentSync.isRunning = true;
  currentSync.step = "init";
  currentSync.message = "Starting Threads sync engine...";
  currentSync.scannedCount = 0;
  currentSync.importedCount = 0;
  currentSync.error = null;
  currentSync.requiresAuth = false;
  currentSync.startedAt = Date.now();

  broadcastEvent("sync_event", currentSync);

  const scriptPath = path.resolve(process.cwd(), "scripts/auto-sync-threads.mjs");
  const args = ["--json-events"];
  if (options.fullScan) args.push("--full-scan");

  syncProcess = spawn("node", [scriptPath, ...args], {
    env: { ...process.env, JSON_EVENTS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  syncProcess.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.startsWith("[SYNC_EVENT] ")) {
        try {
          const raw = line.slice("[SYNC_EVENT] ".length).trim();
          const event = JSON.parse(raw);

          if (event.type === "step") {
            currentSync.step = event.step;
            currentSync.message = event.message || currentSync.message;
            if (event.scannedCount !== undefined) currentSync.scannedCount = event.scannedCount;
          } else if (event.type === "progress") {
            if (event.scannedCount !== undefined) currentSync.scannedCount = event.scannedCount;
            if (event.message) currentSync.message = event.message;
          } else if (event.type === "complete") {
            currentSync.step = "completed";
            currentSync.message = event.message || "Sync completed successfully!";
            currentSync.importedCount = event.importedCount || 0;
            currentSync.isRunning = false;
          } else if (event.type === "error") {
            currentSync.step = "error";
            currentSync.error = event.error || event.message;
            currentSync.message = event.message || "Sync failed";
            currentSync.requiresAuth = Boolean(event.requiresAuth);
            currentSync.isRunning = false;
          }

          broadcastEvent("sync_event", { ...currentSync, rawEvent: event });
        } catch {}
      }
    }
  });

  syncProcess.stderr?.on("data", (chunk: Buffer) => {
    const errText = chunk.toString().trim();
    if (errText) console.warn("[Sync Stderr]:", errText);
  });

  syncProcess.on("close", (code) => {
    syncProcess = null;
    if (currentSync.isRunning) {
      currentSync.isRunning = false;
      if (code !== 0 && currentSync.step !== "completed") {
        currentSync.step = "error";
        currentSync.error = `Sync process exited with code ${code}`;
        currentSync.message = "Sync terminated unexpectedly.";
      }
      broadcastEvent("sync_event", currentSync);
    }
  });

  return { ok: true, message: "Sync job started successfully." };
}

export function cancelSyncJob(): boolean {
  if (syncProcess) {
    syncProcess.kill("SIGTERM");
    syncProcess = null;
    currentSync.isRunning = false;
    currentSync.step = "cancelled";
    currentSync.message = "Sync cancelled by user.";
    broadcastEvent("sync_event", currentSync);
    return true;
  }
  return false;
}
