import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const limitsFile = path.join(os.tmpdir(), "groq-limits.json");

type LimitsState = {
  minute: { windowStartMs: number; requestCount: number };
  hour: { windowStartMs: number; audioSeconds: number };
  day: { dateISO: string; requestCount: number; audioSeconds: number };
};

const DEFAULT_LIMITS: LimitsState = {
  minute: { windowStartMs: 0, requestCount: 0 },
  hour: { windowStartMs: 0, audioSeconds: 0 },
  day: { dateISO: "", requestCount: 0, audioSeconds: 0 },
};

async function readState(): Promise<LimitsState> {
  try {
    if (!fs.existsSync(limitsFile)) return { ...DEFAULT_LIMITS };
    const raw = JSON.parse(fs.readFileSync(limitsFile, "utf-8"));
    return {
      minute: raw.minute || { ...DEFAULT_LIMITS.minute },
      hour: raw.hour || { ...DEFAULT_LIMITS.hour },
      day: raw.day || { ...DEFAULT_LIMITS.day },
    } as LimitsState;
  } catch {
    return { ...DEFAULT_LIMITS };
  }
}

async function writeState(state: LimitsState): Promise<void> {
  try {
    fs.writeFileSync(limitsFile, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error('Error writing to filesystem:', error);
  }
}

function startOfMinute(nowMs: number): number {
  return nowMs - (nowMs % 60000);
}

function startOfHour(nowMs: number): number {
  const date = new Date(nowMs);
  date.setMinutes(0, 0, 0);
  return date.getTime();
}

function todayISO(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type DailyExhaustion = {
  requestsExhausted: boolean;
  audioSecondsExhausted: boolean;
};

export async function checkDailyExhaustion(anticipatedAudioSeconds: number): Promise<DailyExhaustion> {
  const now = Date.now();
  const state = await readState();
  // roll day window if needed
  const today = todayISO(now);
  if (state.day.dateISO !== today) {
    state.day = { dateISO: today, requestCount: 0, audioSeconds: 0 };
    await writeState(state);
  }
  const requestsExhausted = state.day.requestCount >= 2000;
  const audioSecondsExhausted = state.day.audioSeconds + (anticipatedAudioSeconds || 0) > 28800;
  return { requestsExhausted, audioSecondsExhausted };
}

export async function reserveForGroq(anticipatedAudioSeconds: number): Promise<void> {
  // Enforce: 20 requests/min (wait), 7.2k sec/hour (wait), 2k req/day (fail), 28.8k sec/day (fail)
  while (true) {
    const now = Date.now();
    let state = await readState();

    // Roll day window
    const today = todayISO(now);
    if (state.day.dateISO !== today) {
      state.day = { dateISO: today, requestCount: 0, audioSeconds: 0 };
    }

    // Fail-fast for daily limits
    if (state.day.requestCount >= 2000) {
      throw new Error("Daily request quota (2000) exhausted");
    }
    if (state.day.audioSeconds + anticipatedAudioSeconds > 28800) {
      throw new Error("Daily audio seconds quota (28800s) exhausted");
    }

    // Minute window
    const minStart = startOfMinute(now);
    if (state.minute.windowStartMs !== minStart) {
      state.minute = { windowStartMs: minStart, requestCount: 0 };
    }

    // Hour window
    const hourStart = startOfHour(now);
    if (state.hour.windowStartMs !== hourStart) {
      state.hour = { windowStartMs: hourStart, audioSeconds: 0 };
    }

    const minuteOk = state.minute.requestCount < 20;
    const hourOk = state.hour.audioSeconds + anticipatedAudioSeconds <= 7200;

    if (minuteOk && hourOk) {
      // Reserve and persist
      state.minute.requestCount += 1;
      state.day.requestCount += 1;
      state.hour.audioSeconds += anticipatedAudioSeconds;
      state.day.audioSeconds += anticipatedAudioSeconds;
      await writeState(state);
      return;
    }

    // Need to wait for the earliest window to reset
    let waitMs = 0;
    if (!minuteOk) {
      waitMs = Math.max(waitMs, minStart + 60000 - now);
    }
    if (!hourOk) {
      waitMs = Math.max(waitMs, hourStart + 3600000 - now);
    }
    await sleep(Math.max(waitMs, 100));
  }
}
