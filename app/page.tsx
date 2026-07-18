"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coffee,
  History,
  Loader2,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TimerReset
} from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase-client";
import { buildCapacityCurve, estimateCaffeineSleepForecast } from "@/lib/cognitive-model";
import { calculateDeadlineRisks, deadlineRiskConsoleRows, type DeadlineRisk } from "@/lib/deadline-risk";
import { decodeCalendarTaskProvenance } from "@/lib/task-provenance";
import type { CaffeineLog, CapacityPoint, Chronotype, ScheduleBlock, SleepLog, StudyTask } from "@/lib/types";

type Notice = { type: "good" | "bad" | "neutral"; message: string } | null;

const supabase = createBrowserSupabase();
const INITIAL_PLANNER_START = "2026-05-10T12:00:00.000Z";
const STARTUP_TIMEOUT_MS = 4000;
const DEFAULT_API_TIMEOUT_MS = 8000;
const AGENT_TIMEOUT_MS = 60000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEMO_CLOCK_STORAGE_KEY = "cognitive-capacity-planner-demo-clock";
const LANGUAGE_STORAGE_KEY = "cognitive-capacity-planner-language";

type Language = "en" | "ko";
type ViewDate = "today" | "tomorrow" | "week";
type WeekTaskPlacement = {
  task: StudyTask;
  dayOffset: number | null;
  status: "planned" | "missed_due";
};

type WeekDayForecast = {
  offset: number;
  start: Date;
  peak: CapacityPoint;
  plannedTasks: StudyTask[];
  plannedMinutes: number;
  forecastBlocks: ScheduleBlock[];
  hasCarryover: boolean;
  hasUrgent: boolean;
  hasMissedDue: boolean;
  remainingMinutes: number;
};

type DemoClockAnchor = {
  plannerAt: string;
  deviceAt: string;
};

const copy = {
  en: {
    eyebrow: "Sleep pressure + circadian rhythm + caffeine PK",
    title: "Cognitive Capacity Planner",
    connectCalendar: "Connect calendar",
    reconnectCalendar: "Reconnect calendar",
    calendarConnected: "Calendar connected",
    deviceTime: "Device time",
    plannerNow: "Planner now",
    rightNow: "Right now",
    peakWindow: "Peak window",
    activeTasks: "Active tasks",
    demo: "Demo",
    curveTitle: "Next 24h Capacity Curve",
    curveTitleToday: "Today's 24h Capacity Curve",
    curveTitleTomorrow: "Tomorrow's 24h Capacity Forecast",
    curveTitleWeek: "This Week Capacity Forecast",
    curveTitleWeekDay: "Capacity Forecast",
    today: "Today",
    tomorrow: "Tomorrow",
    week: "This week",
    backToWeek: "Back to week",
    forecastOnly: "Forecast only",
    weekHint: "Client-side forecast from the next 7 daily capacity curves. AI scheduling still places only the next 24 hours.",
    peakShort: "Peak",
    plannedShort: "Planned",
    carryoverFlag: "Carry-over",
    urgentFlag: "Due soon",
    riskFlag: "Due risk",
    expected: "Expected",
    difficultBeforeDue: "Difficult before due",
    addTaskToUnlock: "Add a task to unlock AI scheduling.",
    scheduleWithAi: "Schedule with AI",
    noAiBlocks: "No AI blocks yet. Add tasks, connect Google Calendar, then run the scheduler.",
    queuedTitle: "Queued for a later pass",
    queuedHint: "Saved tasks outside the current 24-hour placement window.",
    demoClock: "Demo clock",
    running: "Running",
    plannerDateTime: "Planner date and time",
    setDemoTime: "Set demo time",
    closeDay: "Close day",
    closeDayTitle: "Carry unfinished work to the next demo day and reschedule",
    resetDeviceTime: "Reset to device time",
    demoClockHint: "Continues at normal speed after setting.",
    chronotype: "Chronotype",
    morning: "morning",
    neutral: "neutral",
    evening: "evening",
    sleep: "Sleep",
    sleptFrom: "Slept from",
    wokeUp: "Woke up",
    addSleep: "Add sleep",
    updateSleep: "Update sleep",
    addLatestSleep: "Add your latest sleep to personalize Process S.",
    curveUses: "Curve uses",
    ending: "ending",
    cancelEdit: "Cancel edit",
    recentSleep: "Recent sleep",
    noSleep: "No sleep history yet.",
    woke: "Woke",
    editSleep: "Edit sleep log",
    deleteSleep: "Delete sleep log",
    caffeine: "Caffeine",
    doseMg: "Dose mg",
    time: "Time",
    beforeAdd: "Before you add it",
    estimatedSleepWindow: "Estimated sleep window",
    remainsAtBaseline: "remains at the 11:00 PM baseline.",
    estimatedDelay: "Estimated delay",
    noPkDelay: "No PK-based delay predicted.",
    estimateOnly: "Estimate only: 5h half-life and a 25mg residual threshold.",
    addCaffeine: "Add caffeine",
    updateCaffeine: "Update caffeine",
    recentCaffeine: "Recent caffeine",
    noCaffeine: "No caffeine history yet.",
    sleepWindow: "Sleep window",
    editCaffeine: "Edit caffeine log",
    deleteCaffeine: "Delete caffeine log",
    tasks: "Tasks",
    calendarAgent: "Calendar agent",
    generateFromCalendar: "Generate from calendar",
    manualTask: "Manual task",
    taskPlaceholder: "AP Bio chapter review",
    hard: "Hard",
    medium: "Medium",
    light: "Light",
    addTask: "Add task",
    noActiveTasks: "No active tasks at the current planner time.",
    due: "Due",
    calendarSource: "Calendar source",
    reconnectGoogleNotice: "Google Calendar permission expired. Reconnect calendar once to continue.",
    hideCalendarSource: "Hide calendar source",
    viewCalendarSource: "View calendar source",
    markTaskDone: "Mark task done",
    deleteTask: "Delete task",
    deadlineRiskBadge: "Deadline risk",
    deadlineRiskSuggestion: "Start earlier or move lower-priority work to a later slot.",
    deadlineRiskRepeated: "This task has been pushed multiple times.",
    elapsedTasks: "Elapsed tasks",
    scheduledBlockPassed: "Scheduled block has passed",
    moveToTomorrow: "Move to tomorrow",
    peakCapacity: "Peak capacity",
    goodCapacity: "Good capacity",
    recoveryReview: "Recovery or review"
  },
  ko: {
    eyebrow: "수면 압력 + 생체 리듬 + 카페인 PK",
    title: "인지 역량 플래너",
    connectCalendar: "캘린더 연결",
    reconnectCalendar: "캘린더 재연결",
    calendarConnected: "캘린더 연결됨",
    deviceTime: "기기 시간",
    plannerNow: "플래너 시간",
    rightNow: "현재 컨디션",
    peakWindow: "최고 집중 시간",
    activeTasks: "활성 과제",
    demo: "데모",
    curveTitle: "다음 24시간 역량 곡선",
    curveTitleToday: "오늘 24시간 역량 곡선",
    curveTitleTomorrow: "내일 24시간 예상 역량 곡선",
    curveTitleWeek: "이번주 역량 예상",
    curveTitleWeekDay: "역량 예상",
    today: "오늘",
    tomorrow: "내일",
    week: "이번주",
    backToWeek: "이번주로 돌아가기",
    forecastOnly: "예상",
    weekHint: "다음 7일의 역량 곡선을 클라이언트에서 계산한 예상입니다. AI 스케줄러는 지금처럼 다음 24시간만 실제 배치합니다.",
    peakShort: "최고",
    plannedShort: "예정",
    carryoverFlag: "이월",
    urgentFlag: "마감 임박",
    riskFlag: "마감 위험",
    expected: "예상",
    difficultBeforeDue: "마감 내 배치 어려움",
    addTaskToUnlock: "AI 스케줄링을 시작하려면 과제를 추가하세요.",
    scheduleWithAi: "AI로 배치",
    noAiBlocks: "아직 AI 블록이 없습니다. 과제를 추가하고 Google Calendar를 연결한 뒤 스케줄러를 실행하세요.",
    queuedTitle: "다음 회차 대기",
    queuedHint: "현재 24시간 배치 구간 밖에 저장된 과제입니다.",
    demoClock: "데모 시계",
    running: "실행 중",
    plannerDateTime: "플래너 날짜와 시간",
    setDemoTime: "데모 시간 설정",
    closeDay: "하루 마감",
    closeDayTitle: "끝내지 못한 과제를 다음 데모 날짜로 이월하고 다시 배치",
    resetDeviceTime: "기기 시간으로 초기화",
    demoClockHint: "설정한 뒤에도 실제 시간과 같은 속도로 흐릅니다.",
    chronotype: "크로노타입",
    morning: "아침형",
    neutral: "중간형",
    evening: "저녁형",
    sleep: "수면",
    sleptFrom: "잠든 시간",
    wokeUp: "깬 시간",
    addSleep: "수면 추가",
    updateSleep: "수면 수정",
    addLatestSleep: "최근 수면을 추가하면 Process S가 개인화됩니다.",
    curveUses: "곡선 반영",
    ending: "종료",
    cancelEdit: "수정 취소",
    recentSleep: "최근 수면",
    noSleep: "수면 기록이 없습니다.",
    woke: "기상",
    editSleep: "수면 기록 수정",
    deleteSleep: "수면 기록 삭제",
    caffeine: "카페인",
    doseMg: "용량 mg",
    time: "시간",
    beforeAdd: "추가 전 미리보기",
    estimatedSleepWindow: "예상 수면 가능 시간",
    remainsAtBaseline: "이 11:00 PM 기준 시각에 남아 있습니다.",
    estimatedDelay: "예상 지연",
    noPkDelay: "PK 기반 수면 지연은 예측되지 않습니다.",
    estimateOnly: "추정값: 반감기 5시간, 잔여량 기준 25mg.",
    addCaffeine: "카페인 추가",
    updateCaffeine: "카페인 수정",
    recentCaffeine: "최근 카페인",
    noCaffeine: "카페인 기록이 없습니다.",
    sleepWindow: "수면 가능 시간",
    editCaffeine: "카페인 기록 수정",
    deleteCaffeine: "카페인 기록 삭제",
    tasks: "과제",
    calendarAgent: "캘린더 에이전트",
    generateFromCalendar: "캘린더에서 생성",
    manualTask: "수동 과제",
    taskPlaceholder: "AP Bio 단원 복습",
    hard: "어려움",
    medium: "보통",
    light: "가벼움",
    addTask: "과제 추가",
    noActiveTasks: "현재 플래너 시간에 활성 과제가 없습니다.",
    due: "마감",
    calendarSource: "캘린더 출처",
    reconnectGoogleNotice: "Google Calendar 권한이 만료되었습니다. 계속하려면 캘린더를 다시 연결하세요.",
    hideCalendarSource: "캘린더 출처 숨기기",
    viewCalendarSource: "캘린더 출처 보기",
    markTaskDone: "과제 완료 처리",
    deleteTask: "과제 삭제",
    deadlineRiskBadge: "마감 위험",
    deadlineRiskSuggestion: "더 일찍 시작하거나, 난이도 낮은 과제를 뒤로 미뤄보세요.",
    deadlineRiskRepeated: "여러 번 미뤄졌어요.",
    elapsedTasks: "지난 과제",
    scheduledBlockPassed: "배치된 학습 블록이 지났습니다",
    moveToTomorrow: "내일로 이동",
    peakCapacity: "최고 집중 구간",
    goodCapacity: "좋은 집중 구간",
    recoveryReview: "회복 또는 복습 구간"
  }
} as const;

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string) {
  return new Date(value).toISOString();
}

function displayDate(value: string | Date, language: Language = "en") {
  return new Date(value).toLocaleString(language === "ko" ? "ko-KR" : undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function displayClock(date: Date, language: Language = "en") {
  return date.toLocaleTimeString(language === "ko" ? "ko-KR" : undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function displayCurveHour(start: Date, hour: number, language: Language = "en") {
  const instant = new Date(start.getTime() + hour * 60 * 60 * 1000);
  return instant.toLocaleTimeString(language === "ko" ? "ko-KR" : undefined, { hour: "numeric", minute: "2-digit" });
}

function displayDay(date: Date, language: Language = "en") {
  return date.toLocaleDateString(language === "ko" ? "ko-KR" : undefined, { weekday: "short", month: "short", day: "numeric" });
}

function carriedOverLabel(count: number, language: Language = "en") {
  return language === "ko" ? `이월됨(${count}회)` : `Carried over (${count})`;
}

function taskIdentity(task: StudyTask) {
  return task.id ?? task.title.trim().toLowerCase();
}

function formatTaskMinutes(minutes: number, language: Language = "en") {
  if (minutes < 60) return language === "ko" ? `${minutes}분` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (language === "ko") return rest > 0 ? `${hours}시간 ${rest}분` : `${hours}시간`;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function dayLabel(date: Date, language: Language = "en") {
  return date.toLocaleDateString(language === "ko" ? "ko-KR" : undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function difficultyPriority(task: StudyTask) {
  if (task.difficulty === "high") return 3;
  if (task.difficulty === "medium") return 2;
  return 1;
}

function dueSortValue(task: StudyTask) {
  return task.due_at ? new Date(task.due_at).getTime() : Number.POSITIVE_INFINITY;
}

function dueDayOffset(task: StudyTask, start: Date) {
  if (!task.due_at) return 6;
  const dueDelta = new Date(task.due_at).getTime() - start.getTime();
  if (dueDelta <= 0) return -1;
  return Math.ceil(dueDelta / MS_PER_DAY) - 1;
}

function curveCapacityMinutes(curve: CapacityPoint[]) {
  const focusPoints = curve.filter((point) => point.hour >= 0.5 && point.hour <= 16 && point.score >= 46).length;
  const peakPoints = curve.filter((point) => point.hour >= 0.5 && point.hour <= 16 && point.score >= 62).length;
  return Math.max(90, Math.min(420, Math.round((focusPoints + peakPoints * 0.45) * 15)));
}

function scoreAtHour(curve: CapacityPoint[], hour: number) {
  return curve.reduce((best, point) => (Math.abs(point.hour - hour) < Math.abs(best.hour - hour) ? point : best), curve[0])?.score ?? 0;
}

function dueHourOnDay(task: StudyTask, dayStart: Date) {
  if (!task.due_at) return null;
  const dueTime = new Date(task.due_at).getTime();
  const dayStartTime = dayStart.getTime();
  if (dueTime <= dayStartTime) return -1;
  if (dueTime >= dayStartTime + MS_PER_DAY) return null;
  return (dueTime - dayStartTime) / (1000 * 60 * 60);
}

function canForecastTaskOnDay(task: StudyTask, day: WeekDayForecast, minutes: number) {
  const dueHour = dueHourOnDay(task, day.start);
  if (dueHour === -1) return false;
  if (dueHour === null) return day.remainingMinutes >= minutes;
  return day.remainingMinutes >= minutes && Math.min(16, dueHour) >= 0.5 + minutes / 60;
}

function forecastBlocksForDay(dayStart: Date, peak: CapacityPoint, curve: CapacityPoint[], tasks: StudyTask[]): ScheduleBlock[] {
  const clampStart = (hour: number, totalHours: number) => Math.max(0.5, Math.min(Math.max(0.5, 16 - totalHours), hour));
  const urgentTasks = tasks
    .filter((task) => {
      const dueHour = dueHourOnDay(task, dayStart);
      return dueHour !== null && dueHour !== -1 && dueHour < 16;
    })
    .sort((a, b) => dueSortValue(a) - dueSortValue(b));
  const flexibleTasks = tasks
    .filter((task) => !urgentTasks.includes(task))
    .sort((a, b) => difficultyPriority(b) - difficultyPriority(a));
  const urgentHours = urgentTasks.reduce((sum, task) => sum + task.estimated_minutes / 60, 0);
  const earliestDueHour = urgentTasks.reduce((earliest, task) => {
    const dueHour = dueHourOnDay(task, dayStart);
    return dueHour === null || dueHour === -1 ? earliest : Math.min(earliest, dueHour);
  }, 16);
  let urgentCursor = urgentTasks.length > 0 ? Math.max(0.5, Math.min(peak.hour - urgentHours / 2, earliestDueHour - urgentHours)) : 0.5;
  let flexibleCursor = 0.5;

  const makeBlock = (task: StudyTask, cursor: number) => {
    const startAt = new Date(dayStart.getTime() + cursor * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + task.estimated_minutes * 60 * 1000);
    return {
      task_id: task.id ?? null,
      title: task.title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      capacity_score: scoreAtHour(curve, cursor),
      created_by: "ai"
    } satisfies ScheduleBlock;
  };

  const blocks = urgentTasks.map((task) => {
    const block = makeBlock(task, urgentCursor);
    urgentCursor += task.estimated_minutes / 60 + 0.25;
    return block;
  });

  const flexibleHours = flexibleTasks.reduce((sum, task) => sum + task.estimated_minutes / 60, 0);
  flexibleCursor = clampStart(Math.max(urgentCursor, peak.hour - flexibleHours / 2), flexibleHours);

  for (const task of flexibleTasks) {
    blocks.push(makeBlock(task, flexibleCursor));
    flexibleCursor += task.estimated_minutes / 60 + 0.25;
  }

  return blocks;
}

function buildWeekForecast({
  plannerStart,
  sleepLogs,
  caffeineLogs,
  chronotype,
  tasks
}: {
  plannerStart: Date;
  sleepLogs: SleepLog[];
  caffeineLogs: CaffeineLog[];
  chronotype: Chronotype;
  tasks: StudyTask[];
}) {
  const dayPlans: WeekDayForecast[] = Array.from({ length: 7 }, (_, offset) => {
    const start = new Date(plannerStart.getTime() + offset * MS_PER_DAY);
    const curve = buildCapacityCurve({ start, sleepLogs, caffeineLogs, chronotype });
    const peak = curve.reduce((best, point) => (point.score > best.score ? point : best), curve[0]);
    return {
      offset,
      start,
      peak,
      plannedTasks: [],
      plannedMinutes: 0,
      forecastBlocks: [],
      hasCarryover: false,
      hasUrgent: false,
      hasMissedDue: false,
      remainingMinutes: curveCapacityMinutes(curve)
    };
  });

  const incompleteTasks = uniqueStudyTasks(tasks.filter((task) => task.status !== "completed" && task.status !== "archived")).sort((a, b) => {
    const carryDelta = (b.carried_over_count ?? 0) - (a.carried_over_count ?? 0);
    if (carryDelta !== 0) return carryDelta;
    const dueDelta = dueSortValue(a) - dueSortValue(b);
    if (dueDelta !== 0) return dueDelta;
    return difficultyPriority(b) - difficultyPriority(a);
  });

  const placements: WeekTaskPlacement[] = [];

  for (const task of incompleteTasks) {
    const minutes = Math.max(15, task.estimated_minutes);
    const latestOffset = Math.min(6, dueDayOffset(task, plannerStart));
    if (latestOffset < 0) {
      placements.push({ task, dayOffset: null, status: "missed_due" });
      dayPlans[0].hasMissedDue = true;
      continue;
    }

    const candidates = dayPlans.filter((day) => day.offset <= latestOffset && canForecastTaskOnDay(task, day, minutes));
    if (candidates.length === 0) {
      placements.push({ task, dayOffset: null, status: "missed_due" });
      dayPlans[Math.max(0, latestOffset)].hasMissedDue = true;
      continue;
    }

    const chosen =
      task.difficulty === "low"
        ? candidates[0]
        : [...candidates].sort((a, b) => {
            const aScore = a.peak.score - a.offset * (task.difficulty === "high" ? 1.2 : 2.4);
            const bScore = b.peak.score - b.offset * (task.difficulty === "high" ? 1.2 : 2.4);
            return bScore - aScore;
          })[0];

    chosen.plannedTasks.push(task);
    chosen.plannedMinutes += minutes;
    chosen.remainingMinutes -= minutes;
    chosen.hasCarryover = chosen.hasCarryover || (task.carried_over_count ?? 0) > 0;
    chosen.hasUrgent = chosen.hasUrgent || Boolean(task.due_at && new Date(task.due_at).getTime() <= chosen.start.getTime() + MS_PER_DAY);
    placements.push({ task, dayOffset: chosen.offset, status: "planned" });
  }

  const days = dayPlans.map((day) => {
    const curve = buildCapacityCurve({ start: day.start, sleepLogs, caffeineLogs, chronotype });
    const sortedTasks = [...day.plannedTasks].sort((a, b) => difficultyPriority(b) - difficultyPriority(a));
    return {
      ...day,
      forecastBlocks: forecastBlocksForDay(day.start, day.peak, curve, sortedTasks)
    };
  });

  return { days, placements };
}

function sleepDurationHours(log: SleepLog) {
  return (new Date(log.sleep_end).getTime() - new Date(log.sleep_start).getTime()) / (1000 * 60 * 60);
}

function validSleepLog(log: SleepLog) {
  const hours = sleepDurationHours(log);
  return hours > 0 && hours <= 18;
}

function sleepDuration(log: SleepLog, language: Language = "en") {
  const hours = sleepDurationHours(log);
  if (!validSleepLog(log)) return language === "ko" ? "잘못된 범위 · 반영 안 됨" : "Invalid range · ignored";
  return language === "ko" ? `${hours.toFixed(1)}시간 수면` : `${hours.toFixed(1)}h sleep`;
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

function blockMatchesTask(block: ScheduleBlock, task: StudyTask) {
  return Boolean(task.id && block.task_id === task.id) || block.title.trim().toLowerCase() === task.title.trim().toLowerCase();
}

function readDemoClockAnchor() {
  try {
    const saved = window.localStorage.getItem(DEMO_CLOCK_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<DemoClockAnchor>;
    if (
      typeof parsed.plannerAt !== "string" ||
      typeof parsed.deviceAt !== "string" ||
      Number.isNaN(new Date(parsed.plannerAt).getTime()) ||
      Number.isNaN(new Date(parsed.deviceAt).getTime())
    ) {
      return null;
    }
    return parsed as DemoClockAnchor;
  } catch {
    return null;
  }
}

function plannerNowFromAnchor(deviceNow: Date, anchor: DemoClockAnchor | null) {
  if (!anchor) return deviceNow;
  const elapsed = deviceNow.getTime() - new Date(anchor.deviceAt).getTime();
  return new Date(new Date(anchor.plannerAt).getTime() + elapsed);
}

function activeStudyTasks(tasks: StudyTask[], plannerNow?: Date) {
  return tasks.filter(
    (task) =>
      task.status !== "completed" &&
      task.status !== "archived" &&
      (!plannerNow || !task.due_at || new Date(task.due_at).getTime() > plannerNow.getTime())
  );
}

function tasksBeforePlannerNow(tasks: StudyTask[], blocks: ScheduleBlock[], plannerNow: Date) {
  const expiredBlocks = blocks.filter((block) => new Date(block.end_at).getTime() <= plannerNow.getTime());
  const expiredTaskIds = new Set(expiredBlocks.flatMap((block) => (block.task_id ? [block.task_id] : [])));
  const expiredTitles = new Set(expiredBlocks.map((block) => block.title.trim().toLowerCase()));

  return activeStudyTasks(tasks, plannerNow).filter(
    (task) => !(task.id && expiredTaskIds.has(task.id)) && !expiredTitles.has(task.title.trim().toLowerCase())
  );
}

function elapsedStudyTasks(tasks: StudyTask[], blocks: ScheduleBlock[], plannerNow: Date) {
  const expiredBlocks = blocks.filter((block) => new Date(block.end_at).getTime() <= plannerNow.getTime());

  return tasks.filter((task) => {
    if (task.status === "completed" || task.status === "archived") return false;
    const pastDue = Boolean(task.due_at && new Date(task.due_at).getTime() <= plannerNow.getTime());
    const hadExpiredBlock = expiredBlocks.some((block) => blockMatchesTask(block, task));
    return pastDue || hadExpiredBlock;
  });
}

function tasksMissingFromBlocks(tasks: StudyTask[], blocks: ScheduleBlock[], plannerNow?: Date) {
  const scheduledIds = new Set(blocks.flatMap((block) => (block.task_id ? [block.task_id] : [])));
  const scheduledTitles = new Set(blocks.map((block) => block.title.trim().toLowerCase()));

  return activeStudyTasks(tasks, plannerNow).filter(
    (task) => !(task.id && scheduledIds.has(task.id)) && !scheduledTitles.has(task.title.trim().toLowerCase())
  );
}

function blocksInWindow(blocks: ScheduleBlock[], start: Date) {
  const windowEnd = start.getTime() + MS_PER_DAY;
  return dedupeScheduleBlocks(blocks).filter(
    (block) => new Date(block.end_at).getTime() > start.getTime() && new Date(block.start_at).getTime() < windowEnd
  );
}

function uniqueStudyTasks(tasks: StudyTask[]) {
  const seen = new Set<string>();

  return tasks.filter((task) => {
    const key = task.id ?? task.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dayCloseCarryoverTasks(tasks: StudyTask[], blocks: ScheduleBlock[], plannerNow: Date) {
  const currentBlocks = blocksInWindow(blocks, plannerNow);
  const incompleteTasks = tasks.filter((task) => task.status !== "completed" && task.status !== "archived");
  const scheduledToday = incompleteTasks.filter((task) => currentBlocks.some((block) => blockMatchesTask(block, task)));
  const elapsed = elapsedStudyTasks(tasks, blocks, plannerNow);
  const readyTasks = tasksBeforePlannerNow(tasks, blocks, plannerNow);
  const notPlacedToday = currentBlocks.length > 0 ? tasksMissingFromBlocks(readyTasks, currentBlocks, plannerNow) : readyTasks;

  return uniqueStudyTasks([...elapsed, ...scheduledToday, ...notPlacedToday]);
}

function scheduleSummary(tasks: StudyTask[], blocks: ScheduleBlock[], plannerNow: Date, language: Language = "en") {
  const activeTasks = activeStudyTasks(tasks, plannerNow);
  const queuedCount = tasksMissingFromBlocks(activeTasks, blocks, plannerNow).length;
  if (language === "ko") {
    return `다음 24시간 곡선에 ${activeTasks.length}개 중 ${blocks.length}개를 배치했습니다${queuedCount > 0 ? `; ${queuedCount}개는 다음 회차로 대기합니다.` : "."}`;
  }
  return `Placed ${blocks.length} of ${activeTasks.length} tasks on the next 24-hour curve${queuedCount > 0 ? `; ${queuedCount} remain queued for a later pass.` : "."}`;
}

function scheduleSummaryForTasks(tasks: StudyTask[], blocks: ScheduleBlock[], language: Language = "en") {
  const queuedCount = tasksMissingFromBlocks(tasks, blocks).length;
  if (language === "ko") {
    return `다음 24시간 곡선에 ${tasks.length}개 중 ${blocks.length}개를 배치했습니다${queuedCount > 0 ? `; ${queuedCount}개는 다음 회차로 대기합니다.` : "."}`;
  }
  return `Placed ${blocks.length} of ${tasks.length} tasks on the next 24-hour curve${queuedCount > 0 ? `; ${queuedCount} remain queued for a later pass.` : "."}`;
}

function readLanguage() {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === "ko" ? "ko" : "en";
}

function bandForTask(task: StudyTask, language: Language) {
  const labels = copy[language];
  if (task.difficulty === "high") return labels.peakCapacity;
  if (task.difficulty === "medium") return labels.goodCapacity;
  return labels.recoveryReview;
}

function difficultyText(task: StudyTask, language: Language) {
  if (language === "ko") {
    if (task.difficulty === "high") return "난이도 높음";
    if (task.difficulty === "medium") return "난이도 보통";
    return "난이도 낮음";
  }
  if (task.difficulty === "high") return "hard";
  if (task.difficulty === "medium") return "medium";
  return "light";
}

function dDayLabel(daysRemaining: number) {
  return `D-${Math.max(0, daysRemaining)}`;
}

function deadlineRiskWarning(risk: DeadlineRisk, language: Language) {
  if (language === "ko") {
    return `"${risk.task.title}"는 마감(${dDayLabel(risk.daysRemaining)})까지 남은 집중 시간이 부족해요. 필요 ${risk.requiredMinutes}분 / 확보 가능 ${risk.availableMinutes}분`;
  }
  return `"${risk.task.title}" may miss its deadline (${dDayLabel(risk.daysRemaining)}). Needs ${risk.requiredMinutes} min / ${risk.availableMinutes} min available.`;
}

function deadlineRiskSuggestion(risk: DeadlineRisk, language: Language) {
  const labels = copy[language];
  const repeated = risk.carriedOverCount >= 2 ? ` ${labels.deadlineRiskRepeated}` : "";
  return `${labels.deadlineRiskSuggestion}${repeated}`;
}

function findTaskForBlock(block: ScheduleBlock, tasks: StudyTask[]) {
  return tasks.find((task) => blockMatchesTask(block, task));
}

function placementReasonForBlock({
  block,
  tasks,
  curve,
  start,
  language
}: {
  block: ScheduleBlock;
  tasks: StudyTask[];
  curve: CapacityPoint[];
  start: Date;
  language: Language;
}) {
  const task = findTaskForBlock(block, tasks);
  const blockStart = new Date(block.start_at);
  const hour = Math.max(0, Math.min(24, (blockStart.getTime() - start.getTime()) / (1000 * 60 * 60)));
  const score = Math.round(block.capacity_score ?? scoreAtHour(curve, hour));
  const peakScore = curve.reduce((best, point) => Math.max(best, point.score), 0);
  const nearPeak = score >= peakScore - 5;
  const goodScore = score >= 60;
  const parts: string[] = [];

  if (language === "ko") {
    parts.push(`이 시간대 집중도 ${score}점${nearPeak ? "(오늘 최고 구간)" : goodScore ? "(좋은 집중 구간)" : "(보통 구간)"}`);
    if (!task) return parts.join(" · ");

    if (task.due_at) {
      const dueDays = Math.max(0, Math.floor((new Date(task.due_at).getTime() - blockStart.getTime()) / MS_PER_DAY));
      parts.push(dueDays <= 1 ? `마감 ${dDayLabel(dueDays)}라 우선 배치` : `마감 ${dDayLabel(dueDays)}를 고려`);
    }
    if (task.difficulty === "high") {
      parts.push(goodScore ? "난이도 높음이라 높은 집중 시간에 배치" : "난이도 높지만 남은 창 안에서 가능한 구간에 배치");
    } else if (task.difficulty === "medium") {
      parts.push(goodScore ? "난이도 보통이라 안정적인 집중 구간에 배치" : "중간 난이도 과제로 남은 시간에 맞춰 배치");
    } else {
      parts.push(goodScore ? "가벼운 과제라 좋은 구간에 빠르게 배치" : "급한 과제가 없어 가벼운 복습 시간으로 배치");
    }
    return parts.join(" · ");
  }

  parts.push(`Capacity ${score}${nearPeak ? " (peak window)" : goodScore ? " (good focus window)" : " (moderate window)"}`);
  if (!task) return parts.join(" · ");

  if (task.due_at) {
    const dueDays = Math.max(0, Math.floor((new Date(task.due_at).getTime() - blockStart.getTime()) / MS_PER_DAY));
    parts.push(dueDays <= 1 ? `deadline ${dDayLabel(dueDays)}, so it was prioritized` : `deadline ${dDayLabel(dueDays)} considered`);
  }
  if (task.difficulty === "high") {
    parts.push(goodScore ? "hard task matched to a high-focus slot" : "hard task placed in the best remaining slot");
  } else if (task.difficulty === "medium") {
    parts.push(goodScore ? "medium task placed in a stable focus slot" : "medium task fit into remaining capacity");
  } else {
    parts.push(goodScore ? "light task placed in an efficient open slot" : "light review placed where no urgent task needed peak capacity");
  }
  return parts.join(" · ");
}

function isGoogleReconnectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Google Calendar permission expired") ||
    message.includes("invalid_grant") ||
    message.includes("Token has been expired or revoked")
  );
}

function isStaleSupabaseSessionError(message: string) {
  return (
    message.includes("User from sub claim in JWT does not exist") ||
    message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found")
  );
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
  start,
  language,
  getBlockReason
}: {
  curve: ReturnType<typeof buildCapacityCurve>;
  blocks: ScheduleBlock[];
  start: Date;
  language: Language;
  getBlockReason?: (block: ScheduleBlock) => string;
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
          const reason = getBlockReason?.(block);
          return (
            <g className="taskMarker" key={`${scheduleBlockKey(block)}-${index}`} tabIndex={0}>
              <title>
                {`${block.title}: ${displayDate(block.start_at, language)} - ${displayDate(block.end_at, language)}${reason ? `\n${reason}` : ""}`}
              </title>
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
                  {`${displayDate(block.start_at, language)} - ${displayDate(block.end_at, language)}`}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WeekForecastGrid({
  days,
  language,
  labels,
  onSelectDay
}: {
  days: WeekDayForecast[];
  language: Language;
  labels: (typeof copy)["en"] | (typeof copy)["ko"];
  onSelectDay: (offset: number) => void;
}) {
  return (
    <div className="weekGrid">
      {days.map((day) => (
        <button
          className={`weekDayCard ${day.hasMissedDue ? "risk" : ""} ${day.hasCarryover ? "carry" : ""}`}
          key={day.offset}
          onClick={() => onSelectDay(day.offset)}
        >
          <div className="weekCardTop">
            <strong>{dayLabel(day.start, language)}</strong>
            <span>{labels.forecastOnly}</span>
          </div>
          <div className="weekMetric">
            <span>{labels.peakShort}</span>
            <b>{day.peak ? displayCurveHour(day.start, day.peak.hour, language) : "..."}</b>
          </div>
          <div className="weekMetric">
            <span>{labels.plannedShort}</span>
            <b>
              {day.plannedTasks.length} · {formatTaskMinutes(day.plannedMinutes, language)}
            </b>
          </div>
          <div className="weekFlags">
            {day.hasCarryover && <span className="carryFlag">{labels.carryoverFlag}</span>}
            {day.hasUrgent && <span className="urgentFlag">{labels.urgentFlag}</span>}
            {day.hasMissedDue && <span className="riskFlag">{labels.riskFlag}</span>}
            {!day.hasCarryover && !day.hasUrgent && !day.hasMissedDue && <span>{language === "ko" ? "여유" : "Clear"}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [plannerStart, setPlannerStart] = useState(() => new Date(INITIAL_PLANNER_START));
  const [token, setToken] = useState<string>("");
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(true);
  const [agentRunning, setAgentRunning] = useState(false);
  const [dayClosing, setDayClosing] = useState(false);
  const [taskGenerating, setTaskGenerating] = useState(false);
  const [deviceNow, setDeviceNow] = useState(() => new Date(INITIAL_PLANNER_START));
  const [demoClockAnchor, setDemoClockAnchor] = useState<DemoClockAnchor | null>(null);
  const [demoTimeInput, setDemoTimeInput] = useState("2026-06-01T12:00");
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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<ViewDate>("today");
  const [weekDetailOffset, setWeekDetailOffset] = useState<number | null>(null);
  const labels = copy[language];

  const selectedDayOffset = useMemo(() => {
    if (viewDate === "tomorrow") return 1;
    if (viewDate === "week" && weekDetailOffset !== null) return weekDetailOffset;
    return 0;
  }, [viewDate, weekDetailOffset]);
  const isWeekOverview = viewDate === "week" && weekDetailOffset === null;
  const viewStart = useMemo(
    () => new Date(plannerStart.getTime() + selectedDayOffset * MS_PER_DAY),
    [plannerStart, selectedDayOffset]
  );
  const todayCurve = useMemo(
    () =>
      buildCapacityCurve({
        start: plannerStart,
        sleepLogs,
        caffeineLogs,
        chronotype
      }),
    [plannerStart, sleepLogs, caffeineLogs, chronotype]
  );
  const curve = useMemo(
    () =>
      selectedDayOffset === 0
        ? todayCurve
        : buildCapacityCurve({
            start: viewStart,
            sleepLogs,
            caffeineLogs,
            chronotype
          }),
    [selectedDayOffset, todayCurve, viewStart, sleepLogs, caffeineLogs, chronotype]
  );
  const weekForecast = useMemo(
    () => buildWeekForecast({ plannerStart, sleepLogs, caffeineLogs, chronotype, tasks }),
    [plannerStart, sleepLogs, caffeineLogs, chronotype, tasks]
  );
  const selectedWeekDay = weekForecast.days[selectedDayOffset];
  const curveTitle = isWeekOverview
    ? labels.curveTitleWeek
    : selectedDayOffset === 0
      ? labels.curveTitleToday
      : selectedDayOffset === 1
        ? labels.curveTitleTomorrow
        : `${dayLabel(viewStart, language)} ${labels.curveTitleWeekDay}`;

  const peak = useMemo(() => curve.reduce((best, point) => (point.score > best.score ? point : best), curve[0]), [curve]);
  const currentScore = curve[0]?.score ?? 0;
  const latestValidSleep = useMemo(
    () =>
      [...sleepLogs]
        .filter(validSleepLog)
        .filter((log) => new Date(log.sleep_end).getTime() <= plannerStart.getTime())
        .sort((a, b) => new Date(b.sleep_end).getTime() - new Date(a.sleep_end).getTime())[0],
    [sleepLogs, plannerStart]
  );
  const planningTasks = useMemo(() => tasksBeforePlannerNow(tasks, blocks, plannerStart), [tasks, blocks, plannerStart]);
  const elapsedTasks = useMemo(() => elapsedStudyTasks(tasks, blocks, plannerStart), [tasks, blocks, plannerStart]);
  const actualVisibleBlocks = useMemo(() => blocksInWindow(blocks, viewStart), [blocks, viewStart]);
  const currentVisibleBlocks = useMemo(() => blocksInWindow(blocks, plannerStart), [blocks, plannerStart]);
  const visibleBlocks = useMemo(() => {
    if (viewDate === "week" && weekDetailOffset !== null && actualVisibleBlocks.length === 0) {
      return selectedWeekDay?.forecastBlocks ?? [];
    }
    return actualVisibleBlocks;
  }, [actualVisibleBlocks, selectedWeekDay, viewDate, weekDetailOffset]);
  const queuedTasks = useMemo(
    () => (currentVisibleBlocks.length > 0 ? tasksMissingFromBlocks(planningTasks, currentVisibleBlocks, plannerStart) : []),
    [planningTasks, currentVisibleBlocks, plannerStart]
  );
  const weeklyPlacementByTask = useMemo(
    () => new Map(weekForecast.placements.map((placement) => [taskIdentity(placement.task), placement])),
    [weekForecast]
  );
  const deadlineRisks = useMemo(
    () =>
      calculateDeadlineRisks({
        plannerStart,
        sleepLogs,
        caffeineLogs,
        chronotype,
        tasks: activeStudyTasks(tasks, plannerStart),
        blocks
      }),
    [plannerStart, sleepLogs, caffeineLogs, chronotype, tasks, blocks]
  );
  const deadlineRiskRows = useMemo(() => deadlineRiskConsoleRows(deadlineRisks), [deadlineRisks]);
  const deadlineRiskLogKey = useMemo(() => JSON.stringify(deadlineRiskRows), [deadlineRiskRows]);
  const deadlineRiskByTask = useMemo(
    () => new Map(deadlineRisks.map((risk) => [taskIdentity(risk.task), risk])),
    [deadlineRisks]
  );
  const atRiskTasks = useMemo(() => deadlineRisks.filter((risk) => risk.at_risk), [deadlineRisks]);
  const topDeadlineRisk = atRiskTasks[0];
  const caffeinePreview = useMemo(
    () =>
      estimateCaffeineSleepForecast({
        doseMg: caffeineDose,
        consumedAt: new Date(caffeineTime || deviceNow)
      }),
    [caffeineDose, caffeineTime, deviceNow]
  );

  useEffect(() => {
    async function bootstrap() {
      const now = new Date();
      const savedDemoClock = readDemoClockAnchor();
      const savedLanguage = readLanguage();
      const nextPlannerNow = plannerNowFromAnchor(now, savedDemoClock);
      setMounted(true);
      setLanguage(savedLanguage);
      setDeviceNow(now);
      setDemoClockAnchor(savedDemoClock);
      setPlannerStart(nextPlannerNow);
      setDemoTimeInput(toLocalInput(nextPlannerNow));
      setSleepStart(toLocalInput(new Date(nextPlannerNow.getTime() - 8 * 60 * 60 * 1000)));
      setSleepEnd(toLocalInput(nextPlannerNow));
      setCaffeineTime(toLocalInput(nextPlannerNow));

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

        if (accessToken) {
          const { data: userData, error: userError } = await withStartupTimeout(
            supabase.auth.getUser(accessToken),
            "Supabase user validation timed out."
          );
          if (userError || !userData.user) {
            authErrorMessage = userError?.message ?? "Stored Supabase session is no longer valid.";
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            accessToken = "";
          }
        }

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
            message: copy[savedLanguage].reconnectGoogleNotice
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load planner data.";
        if (isStaleSupabaseSessionError(message)) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          setToken("");
          setNotice({
            type: "neutral",
            message: "Supabase session was stale after project resume. I cleared it; refresh once to create a new anonymous session."
          });
        } else {
          setNotice({ type: "bad", message });
        }
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    console.table(deadlineRiskRows);
  }, [deadlineRiskLogKey, loading, mounted]);

  useEffect(() => {
    if (!mounted) return;

    const updateClock = () => {
      const nextDeviceNow = new Date();
      setDeviceNow(nextDeviceNow);
      setPlannerStart(plannerNowFromAnchor(nextDeviceNow, demoClockAnchor));
    };
    updateClock();
    const clock = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(clock);
  }, [demoClockAnchor, mounted]);

  function setDemoClockAt(nextPlannerNow: Date) {
    const nextDeviceNow = new Date();
    const anchor = { plannerAt: nextPlannerNow.toISOString(), deviceAt: nextDeviceNow.toISOString() };
    window.localStorage.setItem(DEMO_CLOCK_STORAGE_KEY, JSON.stringify(anchor));
    setDemoClockAnchor(anchor);
    setPlannerStart(nextPlannerNow);
    setSleepStart(toLocalInput(new Date(nextPlannerNow.getTime() - 8 * 60 * 60 * 1000)));
    setSleepEnd(toLocalInput(nextPlannerNow));
    setCaffeineTime(toLocalInput(nextPlannerNow));
  }

  function saveDemoClock() {
    const nextPlannerNow = new Date(demoTimeInput);
    if (!demoTimeInput || Number.isNaN(nextPlannerNow.getTime())) {
      setNotice({ type: "bad", message: "Choose a valid date and time for the demo clock." });
      return;
    }

    setDemoClockAt(nextPlannerNow);
    setNotice({ type: "good", message: `Demo clock started at ${displayDate(nextPlannerNow)}. It will continue advancing at normal speed.` });
  }

  function resetDemoClock() {
    const now = new Date();
    window.localStorage.removeItem(DEMO_CLOCK_STORAGE_KEY);
    setDemoClockAnchor(null);
    setPlannerStart(now);
    setDemoTimeInput(toLocalInput(now));
    setSleepStart(toLocalInput(new Date(now.getTime() - 8 * 60 * 60 * 1000)));
    setSleepEnd(toLocalInput(now));
    setCaffeineTime(toLocalInput(now));
    setNotice({ type: "neutral", message: "Demo clock cleared. Planner time now matches the device clock." });
  }

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }

  function selectCurveView(nextView: ViewDate) {
    setViewDate(nextView);
    setWeekDetailOffset(null);
  }

  function openWeekDay(offset: number) {
    if (offset === 0) {
      selectCurveView("today");
      return;
    }
    if (offset === 1) {
      selectCurveView("tomorrow");
      return;
    }
    setViewDate("week");
    setWeekDetailOffset(offset);
  }

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
          body: JSON.stringify({
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            startIso: plannerStart.toISOString()
          })
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
      if (isGoogleReconnectError(error)) {
        setGoogleConnected(false);
        setGoogleNeedsReconnect(true);
        setNotice({ type: "neutral", message: labels.reconnectGoogleNotice });
      } else {
        setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not generate calendar-based tasks." });
      }
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

  async function clearScheduleBlocksForTask(task: StudyTask) {
    setBlocks((current) => current.filter((block) => !blockMatchesTask(block, task)));
    if (!token) return;

    const params = new URLSearchParams();
    if (task.id) params.set("taskId", task.id);
    params.set("title", task.title);
    try {
      await api(`/api/schedule-blocks?${params.toString()}`, token, { method: "DELETE" });
    } catch (error) {
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not clear old schedule blocks." });
    }
  }

  async function patchTask(task: StudyTask, patch: Partial<StudyTask>) {
    if (!task.id) return false;
    let previousTasks: StudyTask[] | null = null;
    setTasks((current) => {
      previousTasks = current;
      return current.map((item) => (item.id === task.id ? { ...item, ...patch } : item));
    });
    if (!token) return true;

    try {
      const result = await api<{ task: StudyTask }>("/api/tasks", token, {
        method: "PATCH",
        body: JSON.stringify({ id: task.id, ...patch })
      });
      setTasks((current) => current.map((item) => (item.id === task.id ? result.task : item)));
      return true;
    } catch (error) {
      if (previousTasks) setTasks(previousTasks);
      setNotice({ type: "bad", message: error instanceof Error ? error.message : "Could not update task." });
      return false;
    }
  }

  async function markTaskDone(task: StudyTask) {
    const updated = await patchTask(task, { status: "completed" });
    if (!updated) return;
    await clearScheduleBlocksForTask(task);
    setNotice({ type: "good", message: `Marked done: ${task.title}.` });
  }

  async function carryTaskToNextPass(task: StudyTask) {
    const nextCarryCount = (task.carried_over_count ?? 0) + 1;
    return patchTask(task, { carried_over_count: nextCarryCount, status: "unscheduled" });
  }

  async function moveTaskToTomorrow(task: StudyTask) {
    const updated = await carryTaskToNextPass(task);
    if (!updated) return;
    await clearScheduleBlocksForTask(task);
    setNotice({ type: "good", message: `Moved to tomorrow: ${task.title}.` });
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

  async function scheduleTasksForStart({
    tasksToSchedule,
    curveForStart,
    startAt,
    emptyMessage
  }: {
    tasksToSchedule: StudyTask[];
    curveForStart: typeof todayCurve;
    startAt: Date;
    emptyMessage: string;
  }) {
    const scheduleTasks = uniqueStudyTasks(tasksToSchedule).filter((task) => task.status !== "completed" && task.status !== "archived");
    if (scheduleTasks.length === 0) {
      setBlocks([]);
      return { blocks: [] as ScheduleBlock[], source: "empty", explanation: emptyMessage };
    }

    if (!googleConnected) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      const nextBlocks = dedupeScheduleBlocks(localSchedule(scheduleTasks, curveForStart, startAt));
      setBlocks(nextBlocks);
      return {
        blocks: nextBlocks,
        source: "local-fallback",
        explanation: language === "ko"
          ? "Google Calendar를 연결하면 실제 일정 충돌을 피해서 배치할 수 있습니다. 지금은 로컬 곡선 기반 스케줄을 만들었습니다."
          : "Connect Google Calendar to schedule around real events. A local curve-based schedule was created for now."
      };
    }
    if (!token) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      const nextBlocks = dedupeScheduleBlocks(localSchedule(scheduleTasks, curveForStart, startAt));
      setBlocks(nextBlocks);
      return {
        blocks: nextBlocks,
        source: "local-fallback",
        explanation: language === "ko"
          ? "로컬 데모 스케줄을 만들었습니다. 실제 캘린더 기반 AI 배치에는 Supabase와 Google OAuth 연결이 필요합니다."
          : "Local demo schedule created. Connect Supabase + Google OAuth for real calendar-aware AI scheduling."
      };
    }

    try {
      const result = await api<{ explanation: string; blocks: ScheduleBlock[]; source: string }>(
        "/api/agent/schedule",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            tasks: scheduleTasks,
            curve: curveForStart,
            startIso: startAt.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
          })
        },
        AGENT_TIMEOUT_MS
      );
      const nextBlocks = dedupeScheduleBlocks(result.blocks);
      setBlocks(nextBlocks);
      return { ...result, blocks: nextBlocks };
    } catch (error) {
      const { localSchedule } = await import("@/lib/cognitive-model");
      const nextBlocks = dedupeScheduleBlocks(localSchedule(scheduleTasks, curveForStart, startAt));
      setBlocks(nextBlocks);
      if (isGoogleReconnectError(error)) {
        setGoogleConnected(false);
        setGoogleNeedsReconnect(true);
        return {
          blocks: nextBlocks,
          source: "local-fallback",
          explanation: labels.reconnectGoogleNotice
        };
      }
      return {
        blocks: nextBlocks,
        source: "local-fallback",
        explanation: `${error instanceof Error ? error.message : language === "ko" ? "에이전트 스케줄링에 실패했습니다." : "Agent scheduling failed."} ${language === "ko" ? "대신 로컬 곡선 기반 스케줄을 만들었습니다." : "A local curve-based schedule was created instead."}`
      };
    }
  }

  async function runAgent() {
    if (planningTasks.length === 0) {
      setNotice({ type: "neutral", message: "Add at least one task first. The agent needs study work to place on your capacity curve." });
      return;
    }
    setAgentRunning(true);
    setNotice({ type: "neutral", message: "The agent is checking Google Calendar and matching tasks to the curve." });
    try {
      const result = await scheduleTasksForStart({
        tasksToSchedule: planningTasks,
        curveForStart: todayCurve,
        startAt: plannerStart,
        emptyMessage: language === "ko" ? "배치할 활성 과제가 없습니다." : "No active tasks are available to schedule."
      });
      setNotice({
        type: result.source === "openai-mcp" ? "good" : "neutral",
        message: `${result.explanation} ${scheduleSummary(planningTasks, result.blocks, plannerStart, language)}`
      });
    } finally {
      setAgentRunning(false);
    }
  }

  async function closeDemoDay() {
    const carryoverTasks = dayCloseCarryoverTasks(tasks, blocks, plannerStart);
    const nextPlannerStart = new Date(plannerStart.getTime() + MS_PER_DAY);

    setDayClosing(true);
    setNotice({
      type: "neutral",
      message: language === "ko"
        ? "하루를 마감하는 중입니다. 끝내지 못한 과제를 이월하고 다음 날 곡선에 다시 배치합니다."
        : "Closing the day. Unfinished tasks will carry over and be rescheduled on the next curve."
    });

    try {
      for (const task of carryoverTasks) {
        const updated = await carryTaskToNextPass(task);
        if (!updated) return;
      }

      const carryoverKeys = new Set(carryoverTasks.map((task) => task.id ?? task.title.trim().toLowerCase()));
      const updatedTasks = tasks.map((task) => {
        const key = task.id ?? task.title.trim().toLowerCase();
        if (!carryoverKeys.has(key)) return task;
        return {
          ...task,
          carried_over_count: (task.carried_over_count ?? 0) + 1,
          status: "unscheduled" as const
        };
      });
      setTasks(updatedTasks);
      setDemoClockAt(nextPlannerStart);
      setViewDate("today");
      setWeekDetailOffset(null);

      const nextCurve = buildCapacityCurve({
        start: nextPlannerStart,
        sleepLogs,
        caffeineLogs,
        chronotype
      });
      const carriedTasksForSchedule = carryoverTasks.map((task) => ({
        ...task,
        carried_over_count: (task.carried_over_count ?? 0) + 1,
        status: "unscheduled" as const
      }));
      const nextScheduleTasks = uniqueStudyTasks([...activeStudyTasks(updatedTasks, nextPlannerStart), ...carriedTasksForSchedule]);
      const result = await scheduleTasksForStart({
        tasksToSchedule: nextScheduleTasks,
        curveForStart: nextCurve,
        startAt: nextPlannerStart,
        emptyMessage: language === "ko" ? "다음 날에 배치할 과제가 없습니다." : "No tasks are available for the next day."
      });

      const carriedText = language === "ko"
        ? `${carryoverTasks.length}개 과제를 이월했습니다.`
        : `${carryoverTasks.length} task${carryoverTasks.length === 1 ? "" : "s"} carried over.`;
      setNotice({
        type: result.source === "openai-mcp" ? "good" : "neutral",
        message: `${carriedText} ${result.explanation} ${scheduleSummaryForTasks(nextScheduleTasks, result.blocks, language)}`
      });
    } finally {
      setDayClosing(false);
    }
  }

  if (!mounted) {
    return (
      <main>
        <section className="topbar">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h1>{labels.title}</h1>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="topbar">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h1>{labels.title}</h1>
        </div>
        <div className="topbarActions">
          <div className="languageToggle" aria-label="Language">
            {(["en", "ko"] as Language[]).map((option) => (
              <button className={language === option ? "active" : ""} key={option} onClick={() => changeLanguage(option)}>
                {option === "en" ? "EN" : "한"}
              </button>
            ))}
          </div>
          <button className={`secondaryButton ${googleConnected ? "connectedButton" : ""}`} onClick={connectGoogle}>
            <CalendarCheck size={18} />
            {googleConnected ? labels.calendarConnected : googleNeedsReconnect ? labels.reconnectCalendar : labels.connectCalendar}
          </button>
        </div>
      </section>

      {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
      {topDeadlineRisk && (
        <section className="deadlineRiskBanner">
          <AlertTriangle size={22} />
          <div>
            <strong>{deadlineRiskWarning(topDeadlineRisk, language)}</strong>
            <p>{deadlineRiskSuggestion(topDeadlineRisk, language)}</p>
            {atRiskTasks.length > 1 && (
              <span>
                {language === "ko"
                  ? `추가로 ${atRiskTasks.length - 1}개 과제도 마감 위험 상태입니다.`
                  : `${atRiskTasks.length - 1} more task${atRiskTasks.length - 1 === 1 ? "" : "s"} also at deadline risk.`}
              </span>
            )}
          </div>
        </section>
      )}
      {googleConnected && (
        <p className="connectionLine">
          {language === "ko"
            ? `Google Calendar 연결됨${googleEmail ? ` (${googleEmail})` : ""}.`
            : `Google Calendar linked${googleEmail ? ` as ${googleEmail}` : ""}.`}
        </p>
      )}
      {googleNeedsReconnect && (
        <p className="connectionLine">
          {language === "ko"
            ? "Google Calendar는 연결되어 있지만, 충돌 확인 권한을 다시 승인해야 합니다."
            : "Google Calendar is linked, but calendar availability permission needs renewal."}
        </p>
      )}

      <section className="dashboard">
        <div className="metricPanel">
          <Clock3 size={22} />
          <span>{labels.deviceTime}</span>
          <strong className="clockValue">{displayClock(deviceNow, language)}</strong>
          <small>{displayDay(deviceNow, language)}</small>
        </div>
        <div className={`metricPanel ${demoClockAnchor ? "demoMetric" : ""}`}>
          <CalendarClock size={22} />
          <span>{labels.plannerNow}</span>
          <strong className="clockValue">{displayClock(plannerStart, language)}</strong>
          <small>{displayDay(plannerStart, language)}{demoClockAnchor ? ` · ${labels.demo}` : ""}</small>
        </div>
        <div className="metricPanel">
          <Brain size={22} />
          <span>{labels.rightNow}</span>
          <strong>{currentScore}</strong>
        </div>
        <div className="metricPanel">
          <Sparkles size={22} />
          <span>{labels.peakWindow}</span>
          <strong>{peak ? displayCurveHour(viewStart, peak.hour, language) : "..."}</strong>
        </div>
        <div className="metricPanel">
          <TimerReset size={22} />
          <span>{labels.activeTasks}</span>
          <strong>{planningTasks.length}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="mainColumn">
          <div className="sectionHeader">
            <div>
              <h2>{curveTitle}</h2>
              <p className="sectionHint">
                {isWeekOverview
                  ? labels.weekHint
                  : planningTasks.length === 0
                    ? labels.addTaskToUnlock
                    : visibleBlocks.length > 0
                      ? language === "ko"
                        ? `${visibleBlocks.length}개 배치 · ${queuedTasks.length}개 대기`
                        : `${visibleBlocks.length} placed on this curve · ${queuedTasks.length} queued for later.`
                      : language === "ko"
                        ? `${planningTasks.length}개 과제가 다음 24시간 배치를 기다립니다.`
                        : `${planningTasks.length} task${planningTasks.length === 1 ? "" : "s"} ready for placement in the next 24 hours.`}
              </p>
            </div>
            <div className="curveActions">
              <div className="segmented viewToggle" aria-label={language === "ko" ? "곡선 날짜 선택" : "Curve date view"}>
                {(["today", "tomorrow", "week"] as ViewDate[]).map((dateView) => (
                  <button className={viewDate === dateView ? "active" : ""} key={dateView} onClick={() => selectCurveView(dateView)}>
                    {dateView === "today" ? labels.today : dateView === "tomorrow" ? labels.tomorrow : labels.week}
                  </button>
                ))}
              </div>
              {viewDate === "week" && weekDetailOffset !== null && (
                <button className="secondaryButton" onClick={() => setWeekDetailOffset(null)}>
                  {labels.backToWeek}
                </button>
              )}
              <button className="primaryButton" onClick={runAgent} disabled={agentRunning || loading} title={planningTasks.length === 0 ? "Add at least one active task first" : "Schedule tasks around calendar conflicts"}>
                {agentRunning ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
                {labels.scheduleWithAi}
              </button>
            </div>
          </div>
          {isWeekOverview ? (
            <WeekForecastGrid days={weekForecast.days} language={language} labels={labels} onSelectDay={openWeekDay} />
          ) : (
            <>
              <CapacityChart
                curve={curve}
                blocks={visibleBlocks}
                start={viewStart}
                language={language}
                getBlockReason={(block) => placementReasonForBlock({ block, tasks, curve, start: viewStart, language })}
              />

              <div className="timeline">
                {visibleBlocks.length === 0 ? (
                  <p className="empty">{labels.noAiBlocks}</p>
                ) : (
                  visibleBlocks.map((block, index) => {
                    const reason = placementReasonForBlock({ block, tasks, curve, start: viewStart, language });
                    return (
                      <article className="blockItem" key={`${scheduleBlockKey(block)}-${index}`} title={reason}>
                        <span className="blockIndex">{index + 1}</span>
                        <div className="blockDetails">
                          <strong>{block.title}</strong>
                          <span>
                            {displayDate(block.start_at, language)} - {displayDate(block.end_at, language)}
                          </span>
                          <p className="blockReason">{reason}</p>
                        </div>
                        <b>{Math.round(block.capacity_score ?? 0)}</b>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          )}

          {queuedTasks.length > 0 && (
            <section className="queuedTasks">
              <div className="queuedHeader">
                <h3>{labels.queuedTitle}</h3>
                <span>{queuedTasks.length}</span>
              </div>
              <p className="queuedHint">{labels.queuedHint}</p>
              <div className="queuedList">
                {queuedTasks.map((task) => {
                  const placement = weeklyPlacementByTask.get(taskIdentity(task));
                  const forecastText =
                    placement?.status === "planned" && placement.dayOffset !== null
                      ? `${labels.expected}: ${dayLabel(new Date(plannerStart.getTime() + placement.dayOffset * MS_PER_DAY), language)}`
                      : labels.difficultBeforeDue;
                  return (
                    <article className={placement?.status === "missed_due" ? "queueRisk" : ""} key={task.id ?? task.title}>
                      <strong>{task.title}</strong>
                      <span>{task.due_at ? `${labels.due} ${displayDate(task.due_at, language)}` : `${task.estimated_minutes}${language === "ko" ? "분" : " min"}`}</span>
                      <span className={placement?.status === "missed_due" ? "queueForecast danger" : "queueForecast"}>{forecastText}</span>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="sideColumn">
          <section className={`panel demoClockPanel ${demoClockAnchor ? "active" : ""}`}>
            <div className="panelTitleRow">
              <h2><CalendarClock size={18} /> {labels.demoClock}</h2>
              {demoClockAnchor && <span className="demoBadge">{labels.running}</span>}
            </div>
            <label>
              {labels.plannerDateTime}
              <input type="datetime-local" value={demoTimeInput} onChange={(event) => setDemoTimeInput(event.target.value)} />
            </label>
            <div className="demoClockActions">
              <button className="secondaryButton" onClick={saveDemoClock}>
                <CalendarClock size={16} />
                {labels.setDemoTime}
              </button>
              <button className="secondaryButton" onClick={closeDemoDay} disabled={dayClosing || agentRunning || loading} title={labels.closeDayTitle}>
                {dayClosing ? <Loader2 className="spin" size={16} /> : <TimerReset size={16} />}
                {labels.closeDay}
              </button>
              {demoClockAnchor && (
                <button className="iconButton" title={labels.resetDeviceTime} aria-label={labels.resetDeviceTime} onClick={resetDemoClock}>
                  <RotateCcw size={16} />
                </button>
              )}
            </div>
            <p className="panelHint">{labels.demoClockHint}</p>
          </section>

          <section className="panel">
            <h2>{labels.chronotype}</h2>
            <div className="segmented">
              {(["morning", "neutral", "evening"] as Chronotype[]).map((type) => (
                <button className={chronotype === type ? "active" : ""} key={type} onClick={() => saveChronotype(type)}>
                  {labels[type]}
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>
              <Moon size={18} /> {labels.sleep}
            </h2>
            <label>
              {labels.sleptFrom}
              <input type="datetime-local" value={sleepStart} onChange={(event) => setSleepStart(event.target.value)} />
            </label>
            <label>
              {labels.wokeUp}
              <input type="datetime-local" value={sleepEnd} onChange={(event) => setSleepEnd(event.target.value)} />
            </label>
            <button className="secondaryButton full" onClick={addSleep}>
              <Plus size={17} />
              {editingSleepId ? labels.updateSleep : labels.addSleep}
            </button>
            <p className="modelInsight">
              {latestValidSleep
                ? `${labels.curveUses} ${sleepDuration(latestValidSleep, language)} ${labels.ending} ${displayDate(latestValidSleep.sleep_end, language)}.`
                : labels.addLatestSleep}
            </p>
            {editingSleepId && (
              <button className="textButton" onClick={() => setEditingSleepId(null)}>
                {labels.cancelEdit}
              </button>
            )}
            <div className="historyHeader">
              <span><History size={15} /> {labels.recentSleep}</span>
              <b>{sleepLogs.length}</b>
            </div>
            <div className="historyList">
              {sleepLogs.length === 0 ? (
                <p className="panelHint">{labels.noSleep}</p>
              ) : (
                sleepLogs.slice(0, 4).map((log) => (
                  <article className={`historyItem ${validSleepLog(log) ? "" : "invalid"}`} key={log.id ?? `${log.sleep_start}-${log.sleep_end}`}>
                    <div>
                      <strong>{sleepDuration(log, language)}</strong>
                      <span>{labels.woke} {displayDate(log.sleep_end, language)}</span>
                    </div>
                    <div className="itemActions">
                      <button className="iconButton" title={labels.editSleep} aria-label={labels.editSleep} onClick={() => startSleepEdit(log)}>
                        <Pencil size={15} />
                      </button>
                      <button className="iconButton danger" title={labels.deleteSleep} aria-label={labels.deleteSleep} onClick={() => deleteSleep(log)}>
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
              <Coffee size={18} /> {labels.caffeine}
            </h2>
            <label>
              {labels.doseMg}
              <input type="number" value={caffeineDose} onChange={(event) => setCaffeineDose(Number(event.target.value))} />
            </label>
            <label>
              {labels.time}
              <input type="datetime-local" value={caffeineTime} onChange={(event) => setCaffeineTime(event.target.value)} />
            </label>
            <div className="caffeinePreview">
              <span>{labels.beforeAdd}</span>
              <strong>{labels.estimatedSleepWindow}: {displayDate(caffeinePreview.estimatedSleepWindow, language)}</strong>
              <p>
                {language === "ko"
                  ? `약 ${caffeinePreview.remainingAtBaselineMg}mg${labels.remainsAtBaseline} `
                  : `About ${caffeinePreview.remainingAtBaselineMg}mg ${labels.remainsAtBaseline} `}
                {caffeinePreview.delayMinutes > 0 ? `${labels.estimatedDelay}: ${caffeinePreview.delayMinutes} min.` : labels.noPkDelay}
              </p>
              <small>{labels.estimateOnly}</small>
            </div>
            <button className="secondaryButton full" onClick={addCaffeine}>
              <Plus size={17} />
              {editingCaffeineId ? labels.updateCaffeine : labels.addCaffeine}
            </button>
            {editingCaffeineId && (
              <button className="textButton" onClick={() => setEditingCaffeineId(null)}>
                {labels.cancelEdit}
              </button>
            )}
            <div className="historyHeader">
              <span><History size={15} /> {labels.recentCaffeine}</span>
              <b>{caffeineLogs.length}</b>
            </div>
            <div className="historyList">
              {caffeineLogs.length === 0 ? (
                <p className="panelHint">{labels.noCaffeine}</p>
              ) : (
                caffeineLogs.slice(0, 4).map((log) => {
                  const forecast = estimateCaffeineSleepForecast({ doseMg: log.dose_mg, consumedAt: new Date(log.consumed_at) });
                  return (
                    <article className="historyItem" key={log.id ?? `${log.consumed_at}-${log.dose_mg}`}>
                      <div>
                        <strong>{log.dose_mg}mg</strong>
                        <span>{displayDate(log.consumed_at, language)}</span>
                        <span>{labels.sleepWindow} {displayDate(forecast.estimatedSleepWindow, language)}</span>
                      </div>
                      <div className="itemActions">
                        <button className="iconButton" title={labels.editCaffeine} aria-label={labels.editCaffeine} onClick={() => startCaffeineEdit(log)}>
                          <Pencil size={15} />
                        </button>
                        <button className="iconButton danger" title={labels.deleteCaffeine} aria-label={labels.deleteCaffeine} onClick={() => deleteCaffeine(log)}>
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
              <h2>{labels.tasks} <span className="countBadge">{planningTasks.length}</span></h2>
            </div>
            <div className="taskAutomation">
              <span className="miniLabel"><CalendarCheck size={14} /> {labels.calendarAgent}</span>
              <button className="secondaryButton full calendarTaskButton" onClick={generateCalendarTasks} disabled={taskGenerating}>
                {taskGenerating ? <Loader2 className="spin" size={17} /> : <CalendarPlus size={17} />}
                {labels.generateFromCalendar}
              </button>
            </div>
            <div className="taskComposer">
              <span className="miniLabel">{labels.manualTask}</span>
              <input placeholder={labels.taskPlaceholder} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
              <div className="twoCols">
                <select value={taskDifficulty} onChange={(event) => setTaskDifficulty(event.target.value as typeof taskDifficulty)}>
                  <option value="high">{labels.hard}</option>
                  <option value="medium">{labels.medium}</option>
                  <option value="low">{labels.light}</option>
                </select>
                <input type="number" value={taskMinutes} onChange={(event) => setTaskMinutes(Number(event.target.value))} />
              </div>
              <button className="primaryButton full" onClick={addTask}>
                <Plus size={17} />
                {labels.addTask}
              </button>
            </div>
            <div className="taskList">
              {planningTasks.length === 0 ? (
                <p className="panelHint">{labels.noActiveTasks}</p>
              ) : planningTasks.map((task) => {
                const provenance = decodeCalendarTaskProvenance(task.description);
                const taskKey = task.id ?? task.title;
                const expanded = expandedTaskId === taskKey;
                const carryCount = task.carried_over_count ?? 0;
                const deadlineRisk = deadlineRiskByTask.get(taskIdentity(task));
                return (
                  <article className={`taskItem ${provenance ? "aiTask" : ""} ${deadlineRisk?.at_risk ? "taskAtRisk" : ""}`} key={taskKey}>
                    <div className="taskMain">
                      <div>
                        <div className="taskTitleRow">
                          <strong>{task.title}</strong>
                          {deadlineRisk?.at_risk && <span className="riskBadge">{labels.deadlineRiskBadge}</span>}
                          {carryCount > 0 && <span className="carryBadge">{carriedOverLabel(carryCount, language)}</span>}
                        </div>
                        <span>
                          {task.estimated_minutes}{language === "ko" ? "분" : " min"} · {bandForTask(task, language)}
                        </span>
                        {task.due_at && <span>{labels.due} {displayDate(task.due_at, language)}</span>}
                        {deadlineRisk?.at_risk && (
                          <span className="riskInline">
                            {language === "ko"
                              ? `필요 ${deadlineRisk.requiredMinutes}분 / 확보 가능 ${deadlineRisk.availableMinutes}분 · ${dDayLabel(deadlineRisk.daysRemaining)}`
                              : `Needs ${deadlineRisk.requiredMinutes} min / ${deadlineRisk.availableMinutes} min available · ${dDayLabel(deadlineRisk.daysRemaining)}`}
                          </span>
                        )}
                      </div>
                      <div className="itemActions">
                        {provenance && (
                          <button
                            className="iconButton sourceButton"
                            title={expanded ? labels.hideCalendarSource : labels.viewCalendarSource}
                            aria-label={expanded ? labels.hideCalendarSource : labels.viewCalendarSource}
                            onClick={() => setExpandedTaskId(expanded ? null : taskKey)}
                          >
                            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </button>
                        )}
                        <button className="iconButton" title={labels.moveToTomorrow} aria-label={labels.moveToTomorrow} onClick={() => moveTaskToTomorrow(task)}>
                          <CalendarPlus size={15} />
                        </button>
                        <button className="iconButton success" title={labels.markTaskDone} aria-label={labels.markTaskDone} onClick={() => markTaskDone(task)}>
                          <CheckCircle2 size={15} />
                        </button>
                        <button className="iconButton danger" title={labels.deleteTask} aria-label={labels.deleteTask} onClick={() => deleteTask(task)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    {provenance && (
                      <span className="sourceBadge"><CalendarCheck size={12} /> {labels.calendarSource}</span>
                    )}
                    {provenance && expanded && (
                      <div className="taskSourceDetails">
                        <strong>{provenance.calendarEventTitle}</strong>
                        {provenance.calendarEventAt && <span>{displayDate(provenance.calendarEventAt, language)}</span>}
                        <p>{provenance.reason}</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {elapsedTasks.length > 0 && (
              <>
                <div className="historyHeader">
                  <span><TimerReset size={15} /> {labels.elapsedTasks}</span>
                  <b>{elapsedTasks.length}</b>
                </div>
                <div className="historyList">
                  {elapsedTasks.slice(0, 5).map((task) => (
                    <article className="historyItem elapsedTask" key={task.id ?? task.title}>
                      <div>
                        <div className="taskTitleRow">
                          <strong>{task.title}</strong>
                          {(task.carried_over_count ?? 0) > 0 && (
                            <span className="carryBadge">{carriedOverLabel(task.carried_over_count ?? 0, language)}</span>
                          )}
                        </div>
                        <span>{task.due_at ? `${labels.due} ${displayDate(task.due_at, language)}` : labels.scheduledBlockPassed}</span>
                      </div>
                      <div className="itemActions">
                        <button className="iconButton" title={labels.moveToTomorrow} aria-label={labels.moveToTomorrow} onClick={() => moveTaskToTomorrow(task)}>
                          <CalendarPlus size={15} />
                        </button>
                        <button className="iconButton success" title={labels.markTaskDone} aria-label={labels.markTaskDone} onClick={() => markTaskDone(task)}>
                          <CheckCircle2 size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </aside>
      </section>
    </main>
  );
}
