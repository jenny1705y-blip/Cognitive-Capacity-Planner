"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  CalendarCheck,
  Coffee,
  Loader2,
  Moon,
  Plus,
  Sparkles,
  TimerReset
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-client";
import { buildCapacityCurve, recommendedBandForTask } from "@/lib/cognitive-model";
import type { CaffeineLog, Chronotype, ScheduleBlock, SleepLog, StudyTask } from "@/lib/types";

type Notice = { type: "good" | "bad" | "neutral"; message: string } | null;

const supabase = createBrowserSupabase();
const INITIAL_PLANNER_START = "2026-05-10T12:00:00.000Z";

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return new Date(value).toISOString();
}

function displayDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload as T;
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
        {blocks.map((block) => {
          const blockStart = new Date(block.start_at).getTime();
          const hour = Math.max(0, Math.min(24, (blockStart - start.getTime()) / (1000 * 60 * 60)));
          const x = pad + (hour / 24) * (width - pad * 2);
          return (
            <g key={`${block.title}-${block.start_at}`}>
              <line x1={x} x2={x} y1={pad} y2={height - pad} className="blockLine" />
              <circle cx={x} cy={pad + 10} r="5" className="blockDot" />
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="url(#capacityLine)" strokeWidth="5" strokeLinecap="round" />
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

  useEffect(() => {
    async function bootstrap() {
      const now = new Date();
      setMounted(true);
      setPlannerStart(now);
      setSleepStart(toLocalInput(new Date(now.getTime() - 8 * 60 * 60 * 1000)));
      setSleepEnd(toLocalInput(now));
      setCaffeineTime(toLocalInput(now));

      const params = new URLSearchParams(window.location.search);
      if (params.get("google") === "connected") {
        setNotice({ type: "good", message: "Google Calendar connected. The agent can now schedule around real events." });
        window.history.replaceState({}, "", "/");
      }
      if (params.get("google") === "error") {
        setNotice({ type: "bad", message: "Google Calendar connection failed. Check OAuth settings and redirect URI." });
        window.history.replaceState({}, "", "/");
      }

      const { data } = await supabase.auth.getSession();
      let accessToken = data.session?.access_token;
      let authErrorMessage = "";
      if (!accessToken) {
        const signedIn = await supabase.auth.signInAnonymously();
        authErrorMessage = signedIn.error?.message ?? "";
        accessToken = signedIn.data.session?.access_token;
      }

      if (!accessToken) {
        setNotice({
          type: "bad",
          message: `Could not start anonymous Supabase session${authErrorMessage ? `: ${authErrorMessage}` : ""}. Local demo mode is still active, but Google/AI scheduling needs Supabase auth.`
        });
        setLoading(false);
        return;
      }

      setToken(accessToken);
      try {
        const [settingsPayload, sleepPayload, caffeinePayload, taskPayload, schedulePayload] = await Promise.all([
          api<{ settings: { chronotype: Chronotype } }>("/api/settings", accessToken),
          api<{ sleepLogs: SleepLog[] }>("/api/logs/sleep", accessToken),
          api<{ caffeineLogs: CaffeineLog[] }>("/api/logs/caffeine", accessToken),
          api<{ tasks: StudyTask[] }>("/api/tasks", accessToken),
          api<{ scheduleBlocks: ScheduleBlock[] }>("/api/schedule-blocks", accessToken)
        ]);
        setChronotype(settingsPayload.settings.chronotype ?? "neutral");
        setSleepLogs(sleepPayload.sleepLogs);
        setCaffeineLogs(caffeinePayload.caffeineLogs);
        setTasks(taskPayload.tasks);
        setBlocks(schedulePayload.scheduleBlocks);
      } catch (error) {
        setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not load planner data." });
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
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
    const payload = { sleep_start: fromLocalInput(sleepStart), sleep_end: fromLocalInput(sleepEnd), quality: 4 };
    const optimisticSleep = { id: crypto.randomUUID(), ...payload };
    setSleepLogs((current) => [optimisticSleep, ...current]);
    setNotice({ type: "good", message: "Sleep added. The capacity curve has been updated." });
    if (!token) {
      return;
    }
    try {
      const result = await api<{ sleepLog: SleepLog }>("/api/logs/sleep", token, {
        method: "POST",
        body: JSON.stringify(payload)
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
    const payload = { consumed_at: fromLocalInput(caffeineTime), dose_mg: caffeineDose, label: "Caffeine" };
    const optimisticCaffeine = { id: crypto.randomUUID(), ...payload };
    setCaffeineLogs((current) => [optimisticCaffeine, ...current]);
    setNotice({ type: "good", message: `${caffeineDose}mg caffeine added. The curve has been updated.` });
    if (!token) {
      return;
    }
    try {
      const result = await api<{ caffeineLog: CaffeineLog }>("/api/logs/caffeine", token, {
        method: "POST",
        body: JSON.stringify(payload)
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
    if (!token) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      setBlocks(localSchedule(tasks, curve, plannerStart));
      setNotice({ type: "neutral", message: "Local demo schedule created. Connect Supabase + Google OAuth for real calendar-aware AI scheduling." });
      return;
    }
    setAgentRunning(true);
    setNotice({ type: "neutral", message: "The agent is checking Google Calendar and matching tasks to the curve." });
    try {
      const result = await api<{ explanation: string; blocks: ScheduleBlock[]; source: string }>("/api/agent/schedule", token, {
        method: "POST",
        body: JSON.stringify({
          tasks: tasks.filter((task) => task.status !== "completed"),
          curve,
          startIso: plannerStart.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });
      setBlocks(result.blocks);
      setNotice({ type: "good", message: `${result.explanation} Source: ${result.source}.` });
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
        <button className="secondaryButton" onClick={connectGoogle}>
          <CalendarCheck size={18} />
          Google Calendar
        </button>
      </section>

      {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}

      <section className="dashboard">
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
            <h2>Capacity Curve</h2>
            <button className="primaryButton" onClick={runAgent} disabled={agentRunning || loading || tasks.length === 0}>
              {agentRunning ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              Schedule with AI
            </button>
          </div>
          <CapacityChart curve={curve} blocks={blocks} start={plannerStart} />

          <div className="timeline">
            {blocks.length === 0 ? (
              <p className="empty">No AI blocks yet. Add tasks, connect Google Calendar, then run the scheduler.</p>
            ) : (
              blocks.map((block) => (
                <article className="blockItem" key={`${block.title}-${block.start_at}`}>
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
              Add sleep
            </button>
            <p className="panelHint">{sleepLogs.length} sleep entries active</p>
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
            <button className="secondaryButton full" onClick={addCaffeine}>
              <Plus size={17} />
              Add caffeine
            </button>
            <p className="panelHint">{caffeineLogs.length} caffeine entries active</p>
          </section>

          <section className="panel">
            <h2>Tasks</h2>
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
                  <strong>{task.title}</strong>
                  <span>
                    {task.estimated_minutes} min · {recommendedBandForTask(task)}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
