import { buildCapacityCurve } from "@/lib/cognitive-model";
import type { CaffeineLog, Chronotype, ScheduleBlock, SleepLog, StudyTask } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const SLOT_MINUTES = 15;
const SLOT_MS = SLOT_MINUTES * MS_PER_MINUTE;
const DEFAULT_FOCUS_THRESHOLD = 60;
const AWAKE_WINDOW_START_HOUR = 0.5;
const AWAKE_WINDOW_END_HOUR = 16;

export type DeadlineRisk = {
  task: StudyTask;
  at_risk: boolean;
  requiredMinutes: number;
  availableMinutes: number;
  daysRemaining: number;
  carriedOverCount: number;
  dueAt: string;
  focusThreshold: number;
};

type FocusSlot = {
  startsAt: number;
  score: number;
};

type DeadlineRiskInput = {
  plannerStart: Date;
  sleepLogs: SleepLog[];
  caffeineLogs: CaffeineLog[];
  chronotype: Chronotype;
  tasks: StudyTask[];
  blocks: ScheduleBlock[];
  focusThreshold?: number;
};

function taskKey(task: StudyTask) {
  return task.id ?? task.title.trim().toLowerCase();
}

function blockKey(block: ScheduleBlock) {
  return block.task_id ?? block.title.trim().toLowerCase();
}

function blockMatchesTask(block: ScheduleBlock, task: StudyTask) {
  return Boolean(task.id && block.task_id === task.id) || block.title.trim().toLowerCase() === task.title.trim().toLowerCase();
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function occupiedByAnotherTask(slot: FocusSlot, task: StudyTask, blocks: ScheduleBlock[], simulatedOwners: Map<number, string>) {
  const owner = simulatedOwners.get(slot.startsAt);
  if (owner && owner !== taskKey(task)) return true;

  const slotEnd = slot.startsAt + SLOT_MS;
  return blocks.some((block) => {
    if (blockMatchesTask(block, task)) return false;
    return overlaps(slot.startsAt, slotEnd, new Date(block.start_at).getTime(), new Date(block.end_at).getTime());
  });
}

function focusSlotsBeforeDue({
  task,
  plannerStart,
  sleepLogs,
  caffeineLogs,
  chronotype,
  focusThreshold
}: {
  task: StudyTask;
  plannerStart: Date;
  sleepLogs: SleepLog[];
  caffeineLogs: CaffeineLog[];
  chronotype: Chronotype;
  focusThreshold: number;
}) {
  const dueAt = task.due_at ? new Date(task.due_at) : null;
  if (!dueAt || dueAt.getTime() <= plannerStart.getTime()) return [];

  const dayCount = Math.max(1, Math.ceil((dueAt.getTime() - plannerStart.getTime()) / MS_PER_DAY));
  const slots: FocusSlot[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const dayStart = new Date(plannerStart.getTime() + offset * MS_PER_DAY);
    const curve = buildCapacityCurve({ start: dayStart, sleepLogs, caffeineLogs, chronotype });
    for (const point of curve) {
      const startsAt = dayStart.getTime() + point.hour * 60 * 60 * 1000;
      if (startsAt < plannerStart.getTime() || startsAt + SLOT_MS > dueAt.getTime()) continue;
      if (point.hour < AWAKE_WINDOW_START_HOUR || point.hour > AWAKE_WINDOW_END_HOUR) continue;
      if (point.score < focusThreshold) continue;
      slots.push({ startsAt, score: point.score });
    }
  }

  return slots;
}

function taskPriority(a: StudyTask, b: StudyTask) {
  const carryDelta = (b.carried_over_count ?? 0) - (a.carried_over_count ?? 0);
  if (carryDelta !== 0) return carryDelta;

  const dueA = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const dueB = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueA - dueB;

  const difficultyRank = { high: 3, medium: 2, low: 1 };
  return difficultyRank[b.difficulty] - difficultyRank[a.difficulty];
}

export function calculateDeadlineRisks({
  plannerStart,
  sleepLogs,
  caffeineLogs,
  chronotype,
  tasks,
  blocks,
  focusThreshold = DEFAULT_FOCUS_THRESHOLD
}: DeadlineRiskInput): DeadlineRisk[] {
  const simulatedOwners = new Map<number, string>();
  const dueTasks = tasks
    .filter((task) => task.status !== "completed" && task.status !== "archived" && task.due_at)
    .filter((task) => new Date(task.due_at ?? "").getTime() > plannerStart.getTime())
    .sort(taskPriority);

  return dueTasks.map((task) => {
    const dueAt = new Date(task.due_at ?? "");
    const slots = focusSlotsBeforeDue({ task, plannerStart, sleepLogs, caffeineLogs, chronotype, focusThreshold });
    const availableSlots = slots.filter((slot) => !occupiedByAnotherTask(slot, task, blocks, simulatedOwners));
    const requiredMinutes = Math.max(SLOT_MINUTES, Math.round(task.estimated_minutes));
    const availableMinutes = availableSlots.length * SLOT_MINUTES;
    const at_risk = availableMinutes < requiredMinutes;
    const slotsNeeded = Math.ceil(requiredMinutes / SLOT_MINUTES);

    if (!at_risk) {
      [...availableSlots]
        .sort((a, b) => b.score - a.score || a.startsAt - b.startsAt)
        .slice(0, slotsNeeded)
        .forEach((slot) => {
          simulatedOwners.set(slot.startsAt, taskKey(task));
        });
    }

    return {
      task,
      at_risk,
      requiredMinutes,
      availableMinutes,
      daysRemaining: Math.max(0, Math.floor((dueAt.getTime() - plannerStart.getTime()) / MS_PER_DAY)),
      carriedOverCount: task.carried_over_count ?? 0,
      dueAt: dueAt.toISOString(),
      focusThreshold
    };
  });
}

export function deadlineRiskConsoleRows(risks: DeadlineRisk[]) {
  return risks.map((risk) => ({
    task: risk.task.title,
    at_risk: risk.at_risk,
    required_min: risk.requiredMinutes,
    available_min: risk.availableMinutes,
    days_remaining: risk.daysRemaining,
    carried_over: risk.carriedOverCount,
    due_at: risk.dueAt
  }));
}
