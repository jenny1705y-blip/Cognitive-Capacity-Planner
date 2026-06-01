"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  CalendarPlus,
  CalendarCheck,
  Clock3,
  Coffee,
  History,
  Loader2,
  Moon,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TimerReset
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-client";
import { buildCapacityCurve, estimateCaffeineSleepForecast, recommendedBandForTask } from "@/lib/cognitive-model";
import type { CaffeineLog, Chronotype, ScheduleBlock, SleepLog, StudyTask } from "@/lib/types";

type Notice = { type: "good" | "bad" | "neutral"; message: string } | null;

const supabase = createBrowserSupabase();
const INITIAL_PLANNER_START = "2026-05-10T12:00:00.000Z";
const STARTUP_TIMEOUT_MS = 4000;
const DEFAULT_API_TIMEOUT_MS = 8000;
const AGENT_TIMEOUT_MS = 60000;

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return new Date(value).toISOString();
}

function displayDate(value: string | Date) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function displayClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function displayDay(date: Date) {
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function sleepDurationHours(log: SleepLog) {
  return (new Date(log.sleep_end).getTime() - new Date(log.sleep_start).getTime()) / (1000 * 60 * 60);
}

function validSleepLog(log: SleepLog) {
  const hours = sleepDurationHours(log);
  return hours > 0 && hours <= 18;
}

function sleepDuration(log: SleepLog) {
  const hours = sleepDurationHours(log);
  return validSleepLog(log) ? `${hours.toFixed(1)}h sleep` : "Invalid range · ignored";
}

function scheduleBlockKey(block: ScheduleBlock) {
  return block.google_event_id ?? `${block.task_id ?? ""}|${block.title}|${block.start_at}|${block.end_at}`;
}

function dedupeScheduleBlocks(blocks: ScheduleBlock[]) {
  const seen = new Set<string>();

  return blocks.filter((block) => {
    const key = scheduleBlockKey(block);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function api<T>(path: string, token: string, init?: RequestInit, timeoutMs = DEFAULT_API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
  const response = await fetch(path, {
    ...init,
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The server took too long to respond.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function withStartupTimeout<T>(promise: Promise<T>, message: string) {
  let timeout: number | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error(message)), STARTUP_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

function CapacityChart({
  curve,
  blocks,
  start
}: {
  curve: ReturnType<typeof buildCapacityCurve>;
  blocks: ScheduleBlock[];
  start: Date;
}) {
  const width = 920;
  const height = 300;
  const pad = 34;
  const points = curve
    .map((point) => {
      const x = pad + (point.hour / 24) * (width - pad * 2);
      const y = pad + ((100 - point.score) / 100) * (height - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chartShell">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="24 hour cognitive capacity curve">
        <defs>
          <linearGradient id="capacityLine" x1="0" x2="1">
            <stop offset="0%" stopColor="#0f766e" />
            <stop offset="48%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#be123c" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = pad + ((100 - tick) / 100) * (height - pad * 2);
          return (
            <g key={tick}>
              <line x1={pad} x2={width - pad} y1={y} y2={y} className="gridLine" />
              <text x={8} y={y + 4} className="axisText">
                {tick}
              </text>
            </g>
          );
        })}
        {[0, 6, 12, 18, 24].map((hour) => {
          const x = pad + (hour / 24) * (width - pad * 2);
          return (
            <g key={hour}>
              <line x1={x} x2={x} y1={pad} y2={height - pad} className="gridLine" />
              <text x={x - 18} y={height - 8} className="axisText">
                +{hour}h
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="url(#capacityLine)" strokeWidth="5" strokeLinecap="round" />
        {blocks.map((block, index) => {
          const blockStart = new Date(block.start_at).getTime();
          const hour = Math.max(0, Math.min(24, (blockStart - start.getTime()) / (1000 * 60 * 60)));
          const x = pad + (hour / 24) * (width - pad * 2);
          const tooltipX = Math.max(pad + 6, Math.min(x + 10, width - 224));
          const tooltipY = pad + 22 + (index % 4) * 42;
          return (
            <g className="taskMarker" key={`${scheduleBlockKey(block)}-${index}`} tabIndex={0}>
              <title>{`${block.title}: ${displayDate(block.start_at)} - ${displayDate(block.end_at)}`}</title>
              <line x1={x} x2={x} y1={pad} y2={height - pad} className="blockHitLine" />
              <line x1={x} x2={x} y1={pad} y2={height - pad} className="blockLine" />
              <circle cx={x} cy={pad + 10} r="9" className="blockDot" />
              <text x={x} y={pad + 13.5} className="blockIndexLabel">
                {index + 1}
              </text>
              <g className="markerTooltip">
                <rect x={tooltipX} y={tooltipY} width="216" height="36" rx="6" />
                <text x={tooltipX + 9} y={tooltipY + 15} className="markerTooltipTitle">
                  {block.title.slice(0, 30)}
                </text>
                <text x={tooltipX + 9} y={tooltipY + 29} className="markerTooltipTime">
                  {`${displayDate(block.start_at)} - ${displayDate(block.end_at)}`}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [plannerStart, setPlannerStart] = useState(() => new Date(INITIAL_PLANNER_START));
  const [token, setToken] = useState<string>("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [agentRunning, setAgentRunning] = useState(false);
  const [taskGenerating, setTaskGenerating] = useState(false);
  const [deviceNow, setDeviceNow] = useState(() => new Date(INITIAL_PLANNER_START));
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [chronotype, setChronotype] = useState<Chronotype>("neutral");
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [caffeineLogs, setCaffeineLogs] = useState<CaffeineLog[]>([]);
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [sleepStart, setSleepStart] = useState("2026-05-10T00:00");
  const [sleepEnd, setSleepEnd] = useState("2026-05-10T08:00");
  const [caffeineDose, setCaffeineDose] = useState(100);
  const [caffeineTime, setCaffeineTime] = useState("2026-05-10T09:00");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskMinutes, setTaskMinutes] = useState(60);
  const [taskDifficulty, setTaskDifficulty] = useState<"low" | "medium" | "high">("high");
  const [editingSleepId, setEditingSleepId] = useState<string | null>(null);
  const [editingCaffeineId, setEditingCaffeineId] = useState<string | null>(null);

  const curve = useMemo(
    () =>
      buildCapacityCurve({
        start: plannerStart,
        sleepLogs,
        caffeineLogs,
        chronotype
      }),
    [plannerStart, sleepLogs, caffeineLogs, chronotype]
  );

  const peak = useMemo(() => curve.reduce((best, point) => (point.score > best.score ? point : best), curve[0]), [curve]);
  const currentScore = curve[0]?.score ?? 0;
  const latestValidSleep = useMemo(
    () =>
      [...sleepLogs]
        .filter(validSleepLog)
        .sort((a, b) => new Date(b.sleep_end).getTime() - new Date(a.sleep_end).getTime())[0],
    [sleepLogs]
  );
  const visibleBlocks = useMemo(() => dedupeScheduleBlocks(blocks), [blocks]);
  const caffeinePreview = useMemo(
    () =>
      estimateCaffeineSleepForecast({
        doseMg: caffeineDose,
        consumedAt: new Date(caffeineTime || deviceNow)
      }),
    [caffeineDose, caffeineTime, deviceNow]
  );

  useEffect(() => {
    const clock = window.setInterval(() => setDeviceNow(new Date()), 1000);

    async function bootstrap() {
      const now = new Date();
      setMounted(true);
      setDeviceNow(now);
      setPlannerStart(now);
      setSleepStart(toLocalInput(new Date(now.getTime() - 8 * 60 * 60 * 1000)));
      setSleepEnd(toLocalInput(now));
      setCaffeineTime(toLocalInput(now));

      const params = new URLSearchParams(window.location.search);
      if (params.get("google") === "connected") {
        setGoogleConnected(true);
        setNotice({ type: "good", message: "Google Calendar connected. The agent can now schedule around real events." });
        window.history.replaceState({}, "", "/");
      }
      if (params.get("google") === "error") {
        setNotice({ type: "bad", message: "Google Calendar connection failed. Check OAuth settings and redirect URI." });
        window.history.replaceState({}, "", "/");
      }

      let accessToken = "";
      let authErrorMessage = "";

      try {
        const { data } = await withStartupTimeout(supabase.auth.getSession(), "Supabase session check timed out.");
        accessToken = data.session?.access_token ?? "";

        if (!accessToken) {
          const signedIn = await withStartupTimeout(supabase.auth.signInAnonymously(), "Supabase anonymous sign-in timed out.");
          authErrorMessage = signedIn.error?.message ?? "";
          accessToken = signedIn.data.session?.access_token ?? "";
        }
      } catch (error) {
        authErrorMessage = error instanceof Error ? error.message : "Supabase startup timed out.";
      }

      if (!accessToken) {
        const connectionHint = authErrorMessage.includes("Failed to fetch")
          ? " The Supabase project URL could not be reached. Open Supabase Project Settings > API and copy the current Project URL again. If the project is paused, restore it first."
          : "";
        setNotice({
          type: "bad",
          message: `Could not start anonymous Supabase session${authErrorMessage ? `: ${authErrorMessage}` : ""}.${connectionHint} Local demo mode is still active, but Google/AI scheduling needs Supabase auth.`
        });
        setLoading(false);
        return;
      }

      setToken(accessToken);
      try {
        const [settingsPayload, sleepPayload, caffeinePayload, taskPayload, schedulePayload, googlePayload] = await Promise.all([
          api<{ settings: { chronotype: Chronotype } }>("/api/settings", accessToken),
          api<{ sleepLogs: SleepLog[] }>("/api/logs/sleep", accessToken),
          api<{ caffeineLogs: CaffeineLog[] }>("/api/logs/caffeine", accessToken),
          api<{ tasks: StudyTask[] }>("/api/tasks", accessToken),
          api<{ scheduleBlocks: ScheduleBlock[] }>("/api/schedule-blocks", accessToken),
          api<{ connected: boolean; googleEmail: string | null; needsReconnect: boolean }>("/api/auth/google/status", accessToken)
        ]);
        setChronotype(settingsPayload.settings.chronotype ?? "neutral");
        setSleepLogs(sleepPayload.sleepLogs);
        setCaffeineLogs(caffeinePayload.caffeineLogs);
        setTasks(taskPayload.tasks);
        setBlocks(dedupeScheduleBlocks(schedulePayload.scheduleBlocks));
        setGoogleConnected(googlePayload.connected);
        setGoogleNeedsReconnect(googlePayload.needsReconnect);
        setGoogleEmail(googlePayload.googleEmail);
        if (googlePayload.needsReconnect) {
          setNotice({
            type: "neutral",
            message: "Reconnect Google Calendar once to grant availability access for conflict-aware scheduling."
          });
        }
      } catch (error) {
        setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not load planner data." });
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
    return () => window.clearInterval(clock);
  }, []);

  async function saveChronotype(next: Chronotype) {
    setChronotype(next);
    setNotice({ type: "neutral", message: `Chronotype set to ${next}.` });
    if (!token) return;
    try {
      await api("/api/settings", token, {
        method: "POST",
        body: JSON.stringify({ chronotype: next, caffeine_sensitivity: 1 })
      });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not save chronotype." });
    }
  }

  async function addSleep() {
    const startAt = new Date(sleepStart);
    const endAt = new Date(sleepEnd);
    if (!sleepStart || !sleepEnd || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      setNotice({ type: "bad", message: "Choose both a sleep start and wake-up time." });
      return;
    }
    if (endAt <= startAt) {
      setNotice({ type: "bad", message: "Wake-up time must be after the sleep start time." });
      return;
    }
    if ((endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60) > 18) {
      setNotice({ type: "bad", message: "Sleep duration looks too long. Please check the dates before saving." });
      return;
    }

    const payload = { sleep_start: fromLocalInput(sleepStart), sleep_end: fromLocalInput(sleepEnd), quality: 4 };
    const optimisticSleep = { id: editingSleepId ?? crypto.randomUUID(), ...payload };
    setSleepLogs((current) =>
      editingSleepId
        ? current.map((log) => (log.id === editingSleepId ? optimisticSleep : log))
        : [optimisticSleep, ...current]
    );
    setNotice({ type: "good", message: `Sleep ${editingSleepId ? "updated" : "added"}. The capacity curve has been recalculated.` });
    setEditingSleepId(null);
    if (!token) {
      return;
    }
    try {
      const result = await api<{ sleepLog: SleepLog }>("/api/logs/sleep", token, {
        method: editingSleepId ? "PATCH" : "POST",
        body: JSON.stringify(editingSleepId ? { id: editingSleepId, ...payload } : payload)
      });
      setSleepLogs((current) => current.map((log) => (log.id === optimisticSleep.id ? result.sleepLog : log)));
    } catch (error) {
      setNotice({
        type: "bad",
        message: `${error instanceof Error ? error.message : "Could not save sleep."} The sleep entry is still active locally for this demo.`
      });
    }
  }

  async function addCaffeine() {
    if (!caffeineTime || caffeineDose <= 0 || caffeineDose > 1000) {
      setNotice({ type: "bad", message: "Enter a caffeine dose between 1 and 1000mg and choose a time." });
      return;
    }

    const payload = { consumed_at: fromLocalInput(caffeineTime), dose_mg: caffeineDose, label: "Caffeine" };
    const optimisticCaffeine = { id: editingCaffeineId ?? crypto.randomUUID(), ...payload };
    setCaffeineLogs((current) =>
      editingCaffeineId
        ? current.map((log) => (log.id === editingCaffeineId ? optimisticCaffeine : log))
        : [optimisticCaffeine, ...current]
    );
    setNotice({ type: "good", message: `${caffeineDose}mg caffeine ${editingCaffeineId ? "updated" : "added"}. The curve has been recalculated.` });
    setEditingCaffeineId(null);
    if (!token) {
      return;
    }
    try {
      const result = await api<{ caffeineLog: CaffeineLog }>("/api/logs/caffeine", token, {
        method: editingCaffeineId ? "PATCH" : "POST",
        body: JSON.stringify(editingCaffeineId ? { id: editingCaffeineId, ...payload } : payload)
      });
      setCaffeineLogs((current) => current.map((log) => (log.id === optimisticCaffeine.id ? result.caffeineLog : log)));
    } catch (error) {
      setNotice({
        type: "bad",
        message: `${error instanceof Error ? error.message : "Could not save caffeine."} The caffeine entry is still active locally for this demo.`
      });
    }
  }

  async function addTask() {
    if (!taskTitle.trim()) return;
    const payload = {
      title: taskTitle.trim(),
      difficulty: taskDifficulty,
      estimated_minutes: taskMinutes,
      status: "unscheduled" as const,
      source: "manual" as const
    };
    const optimisticTask = { id: crypto.randomUUID(), ...payload };
    setTasks((current) => [optimisticTask, ...current]);
    setTaskTitle("");
    setNotice({ type: "good", message: `Task added: ${payload.title}.` });
    if (!token) {
      return;
    }
    try {
      const result = await api<{ task: StudyTask }>("/api/tasks", token, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setTasks((current) => current.map((task) => (task.id === optimisticTask.id ? result.task : task)));
    } catch (error) {
      setNotice({
        type: "bad",
        message: `${error instanceof Error ? error.message : "Could not save task."} The task is still active locally for this demo.`
      });
    }
  }

  async function addDemoTasks() {
    const demoTasks: StudyTask[] = [
      { id: crypto.randomUUID(), title: "Biology active recall", difficulty: "high", estimated_minutes: 75, status: "unscheduled", source: "manual" },
      { id: crypto.randomUUID(), title: "Calculus practice set", difficulty: "medium", estimated_minutes: 60, status: "unscheduled", source: "manual" },
      { id: crypto.randomUUID(), title: "History flashcard review", difficulty: "low", estimated_minutes: 35, status: "unscheduled", source: "manual" }
    ];
    setTasks((current) => [...demoTasks, ...current]);
    setNotice({ type: "good", message: "Three demo study tasks added. AI scheduling is ready." });

    if (!token) return;
    await Promise.all(
      demoTasks.map(async ({ id, ...payload }) => {
        try {
          const result = await api<{ task: StudyTask }>("/api/tasks", token, { method: "POST", body: JSON.stringify(payload) });
          setTasks((current) => current.map((task) => (task.id === id ? result.task : task)));
        } catch {
          // The optimistic demo tasks remain available for a local scheduling demo.
        }
      })
    );
  }

  async function generateCalendarTasks() {
    if (!googleConnected) {
      setNotice({
        type: "neutral",
        message: googleNeedsReconnect
          ? "Reconnect Google Calendar first so the agent can review upcoming assessments."
          : "Connect Google Calendar first so the agent can review upcoming assessments."
      });
      return;
    }
    if (!token) {
      setNotice({ type: "bad", message: "Supabase authentication is required before generating calendar-based tasks." });
      return;
    }

    setTaskGenerating(true);
    setNotice({ type: "neutral", message: "The agent is reviewing upcoming Google Calendar events for study work." });
    try {
      const result = await api<{ explanation: string; tasks: StudyTask[] }>(
        "/api/agent/generate-tasks",
        token,
        {
          method: "POST",
          body: JSON.stringify({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        },
        AGENT_TIMEOUT_MS
      );
      setTasks((current) => {
        const existing = new Set(current.map((task) => task.title.trim().toLowerCase()));
        return [...result.tasks.filter((task) => !existing.has(task.title.trim().toLowerCase())), ...current];
      });
      setNotice({
        type: result.tasks.length > 0 ? "good" : "neutral",
        message:
          result.tasks.length > 0
            ? `${result.tasks.length} calendar-based task${result.tasks.length === 1 ? "" : "s"} added. ${result.explanation}`
            : `${result.explanation} No new calendar-based tasks were added.`
      });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not generate calendar-based tasks." });
    } finally {
      setTaskGenerating(false);
    }
  }

  function startSleepEdit(log: SleepLog) {
    setEditingSleepId(log.id ?? null);
    setSleepStart(toLocalInput(new Date(log.sleep_start)));
    setSleepEnd(toLocalInput(new Date(log.sleep_end)));
  }

  function startCaffeineEdit(log: CaffeineLog) {
    setEditingCaffeineId(log.id ?? null);
    setCaffeineDose(log.dose_mg);
    setCaffeineTime(toLocalInput(new Date(log.consumed_at)));
  }

  async function deleteSleep(log: SleepLog) {
    if (!log.id) return;
    setSleepLogs((current) => current.filter((item) => item.id !== log.id));
    if (editingSleepId === log.id) setEditingSleepId(null);
    if (!token) return;
    try {
      await api(`/api/logs/sleep?id=${encodeURIComponent(log.id)}`, token, { method: "DELETE" });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not remove sleep history." });
    }
  }

  async function deleteCaffeine(log: CaffeineLog) {
    if (!log.id) return;
    setCaffeineLogs((current) => current.filter((item) => item.id !== log.id));
    if (editingCaffeineId === log.id) setEditingCaffeineId(null);
    if (!token) return;
    try {
      await api(`/api/logs/caffeine?id=${encodeURIComponent(log.id)}`, token, { method: "DELETE" });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not remove caffeine history." });
    }
  }

  async function deleteTask(task: StudyTask) {
    if (!task.id) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (!token) return;
    try {
      await api(`/api/tasks?id=${encodeURIComponent(task.id)}`, token, { method: "DELETE" });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not remove task." });
    }
  }

  async function connectGoogle() {
    if (!token) {
      setNotice({ type: "bad", message: "Google Calendar needs Supabase anonymous auth first. Enable Anonymous Sign-Ins and verify the anon key." });
      return;
    }
    try {
      const result = await api<{ url: string }>("/api/auth/google", token);
      window.location.href = result.url;
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not start Google OAuth." });
    }
  }

  async function runAgent() {
    if (tasks.length === 0) {
      setNotice({ type: "neutral", message: "Add at least one task first. The agent needs study work to place on your capacity curve." });
      return;
    }
    if (!googleConnected) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      setBlocks(localSchedule(tasks, curve, plannerStart));
      setNotice({ type: "neutral", message: "Connect Google Calendar to schedule around real events. A local curve-based schedule was created for now." });
      return;
    }
    if (!token) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      setBlocks(localSchedule(tasks, curve, plannerStart));
      setNotice({ type: "neutral", message: "Local demo schedule created. Connect Supabase + Google OAuth for real calendar-aware AI scheduling." });
      return;
    }
    setAgentRunning(true);
    setNotice({ type: "neutral", message: "The agent is checking Google Calendar and matching tasks to the curve." });
    try {
      const result = await api<{ explanation: string; blocks: ScheduleBlock[]; source: string }>(
        "/api/agent/schedule",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            tasks: tasks.filter((task) => task.status !== "completed"),
            curve,
            startIso: plannerStart.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        },
        AGENT_TIMEOUT_MS
      );
      setBlocks(dedupeScheduleBlocks(result.blocks));
      setNotice({ type: result.source === "openai-mcp" ? "good" : "neutral", message: result.explanation });
    } catch (error) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      setBlocks(localSchedule(tasks, curve, plannerStart));
      setNotice({
        type: "bad",
        message: `${error instanceof Error ? error.message : "Agent scheduling failed."} A local curve-based schedule was created instead.`
      });
    } finally {
      setAgentRunning(false);
    }
  }

  if (!mounted) {
    return (
      <main>
        <section className="topbar">
          <div>
            <p className="eyebrow">Sleep pressure + circadian rhythm + caffeine PK</p>
            <h1>Cognitive Capacity Planner</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <p className="eyebrow">Sleep pressure + circadian rhythm + caffeine PK</p>
          <h1>Cognitive Capacity Planner</h1>
        </div>
        <button className={`secondaryButton ${googleConnected ? "connectedButton" : ""}`} onClick={connectGoogle}>
          <CalendarCheck size={18} />
          {googleConnected ? "Calendar connected" : googleNeedsReconnect ? "Reconnect calendar" : "Connect calendar"}
        </button>
      </section>

      {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
      {googleConnected && <p className="connectionLine">Google Calendar linked{googleEmail ? ` as ${googleEmail}` : ""}.</p>}
      {googleNeedsReconnect && <p className="connectionLine">Google Calendar is linked, but calendar availability permission needs renewal.</p>}

      <section className="dashboard">
        <div className="metricPanel">
          <Clock3 size={22} />
          <span>Device time</span>
          <strong className="clockValue">{displayClock(deviceNow)}</strong>
          <small>{displayDay(deviceNow)}</small>
        </div>
        <div className="metricPanel">
          <Brain size={22} />
          <span>Right now</span>
          <strong>{currentScore}</strong>
        </div>
        <div className="metricPanel">
          <Sparkles size={22} />
          <span>Peak window</span>
          <strong>{peak?.label ?? "..."}</strong>
        </div>
        <div className="metricPanel">
          <TimerReset size={22} />
          <span>Saved tasks</span>
          <strong>{tasks.length}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="mainColumn">
          <div className="sectionHeader">
            <div>
              <h2>Capacity Curve</h2>
              <p className="sectionHint">{tasks.length === 0 ? "Add a task to unlock AI scheduling." : `${tasks.length} task${tasks.length === 1 ? "" : "s"} ready for placement.`}</p>
            </div>
            <button className="primaryButton" onClick={runAgent} disabled={agentRunning || loading} title={tasks.length === 0 ? "Add at least one task first" : "Schedule tasks around calendar conflicts"}>
              {agentRunning ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Schedule with AI
            </button>
          </div>
          <CapacityChart curve={curve} blocks={visibleBlocks} start={plannerStart} />

          <div className="timeline">
            {visibleBlocks.length === 0 ? (
              <p className="empty">No AI blocks yet. Add tasks, connect Google Calendar, then run the scheduler.</p>
            ) : (
              visibleBlocks.map((block, index) => (
                <article className="blockItem" key={`${scheduleBlockKey(block)}-${index}`}>
                  <span className="blockIndex">{index + 1}</span>
                  <div>
                    <strong>{block.title}</strong>
                    <span>
                      {displayDate(block.start_at)} - {displayDate(block.end_at)}
                    </span>
                  </div>
                  <b>{Math.round(block.capacity_score ?? 0)}</b>
                </article>
              ))
            )}
          </div>
        </div>

        <aside className="sideColumn">
          <section className="panel">
            <h2>Chronotype</h2>
            <div className="segmented">
              {(["morning", "neutral", "evening"] as Chronotype[]).map((type) => (
                <button className={chronotype === type ? "active" : ""} key={type} onClick={() => saveChronotype(type)}>
                  {type}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>
              <Moon size={18} /> Sleep
            </h2>
            <label>
              Slept from
              <input type="datetime-local" value={sleepStart} onChange={(event) => setSleepStart(event.target.value)} />
            </label>
            <label>
              Woke up
              <input type="datetime-local" value={sleepEnd} onChange={(event) => setSleepEnd(event.target.value)} />
            </label>
            <button className="secondaryButton full" onClick={addSleep}>
              <Plus size={17} />
              {editingSleepId ? "Update sleep" : "Add sleep"}
            </button>
            <p className="modelInsight">
              {latestValidSleep
                ? `Curve uses ${sleepDuration(latestValidSleep)} ending ${displayDate(latestValidSleep.sleep_end)}.`
                : "Add your latest sleep to personalize Process S."}
            </p>
            {editingSleepId && (
              <button className="textButton" onClick={() => setEditingSleepId(null)}>
                Cancel edit
              </button>
            )}
            <div className="historyHeader">
              <span><History size={15} /> Recent sleep</span>
              <b>{sleepLogs.length}</b>
            </div>
            <div className="historyList">
              {sleepLogs.length === 0 ? (
                <p className="panelHint">No sleep history yet.</p>
              ) : (
                sleepLogs.slice(0, 4).map((log) => (
                  <article className={`historyItem ${validSleepLog(log) ? "" : "invalid"}`} key={log.id ?? `${log.sleep_start}-${log.sleep_end}`}>
                    <div>
                      <strong>{sleepDuration(log)}</strong>
                      <span>Woke {displayDate(log.sleep_end)}</span>
                    </div>
                    <div className="itemActions">
                      <button className="iconButton" title="Edit sleep log" aria-label="Edit sleep log" onClick={() => startSleepEdit(log)}>
                        <Pencil size={15} />
                      </button>
                      <button className="iconButton danger" title="Delete sleep log" aria-label="Delete sleep log" onClick={() => deleteSleep(log)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <h2>
              <Coffee size={18} /> Caffeine
            </h2>
            <label>
              Dose mg
              <input type="number" value={caffeineDose} onChange={(event) => setCaffeineDose(Number(event.target.value))} />
            </label>
            <label>
              Time
              <input type="datetime-local" value={caffeineTime} onChange={(event) => setCaffeineTime(event.target.value)} />
            </label>
            <div className="caffeinePreview">
              <span>Before you add it</span>
              <strong>Estimated sleep window: {displayDate(caffeinePreview.estimatedSleepWindow)}</strong>
              <p>
                About {caffeinePreview.remainingAtBaselineMg}mg remains at the 11:00 PM baseline.
                {caffeinePreview.delayMinutes > 0 ? ` Estimated delay: ${caffeinePreview.delayMinutes} min.` : " No PK-based delay predicted."}
              </p>
              <small>Estimate only: 5h half-life and a 25mg residual threshold.</small>
            </div>
            <button className="secondaryButton full" onClick={addCaffeine}>
              <Plus size={17} />
              {editingCaffeineId ? "Update caffeine" : "Add caffeine"}
            </button>
            {editingCaffeineId && (
              <button className="textButton" onClick={() => setEditingCaffeineId(null)}>
                Cancel edit
              </button>
            )}
            <div className="historyHeader">
              <span><History size={15} /> Recent caffeine</span>
              <b>{caffeineLogs.length}</b>
            </div>
            <div className="historyList">
              {caffeineLogs.length === 0 ? (
                <p className="panelHint">No caffeine history yet.</p>
              ) : (
                caffeineLogs.slice(0, 4).map((log) => {
                  const forecast = estimateCaffeineSleepForecast({ doseMg: log.dose_mg, consumedAt: new Date(log.consumed_at) });
                  return (
                    <article className="historyItem" key={log.id ?? `${log.consumed_at}-${log.dose_mg}`}>
                      <div>
                        <strong>{log.dose_mg}mg</strong>
                        <span>{displayDate(log.consumed_at)}</span>
                        <span>Sleep window {displayDate(forecast.estimatedSleepWindow)}</span>
                      </div>
                      <div className="itemActions">
                        <button className="iconButton" title="Edit caffeine log" aria-label="Edit caffeine log" onClick={() => startCaffeineEdit(log)}>
                          <Pencil size={15} />
                        </button>
                        <button className="iconButton danger" title="Delete caffeine log" aria-label="Delete caffeine log" onClick={() => deleteCaffeine(log)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panelTitleRow">
              <h2>Tasks</h2>
              <button className="textButton" onClick={addDemoTasks}>Add demo tasks</button>
            </div>
            <button className="secondaryButton full calendarTaskButton" onClick={generateCalendarTasks} disabled={taskGenerating}>
              {taskGenerating ? <Loader2 className="spin" size={17} /> : <CalendarPlus size={17} />}
              Generate from calendar
            </button>
            <input placeholder="AP Bio chapter review" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
            <div className="twoCols">
              <select value={taskDifficulty} onChange={(event) => setTaskDifficulty(event.target.value as typeof taskDifficulty)}>
                <option value="high">Hard</option>
                <option value="medium">Medium</option>
                <option value="low">Light</option>
              </select>
              <input type="number" value={taskMinutes} onChange={(event) => setTaskMinutes(Number(event.target.value))} />
            </div>
            <button className="primaryButton full" onClick={addTask}>
              <Plus size={17} />
              Add task
            </button>
            <div className="taskList">
              {tasks.map((task) => (
                <article key={task.id ?? task.title}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {task.estimated_minutes} min · {recommendedBandForTask(task)}
                    </span>
                  </div>
                  <button className="iconButton danger" title="Delete task" aria-label="Delete task" onClick={() => deleteTask(task)}>
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
