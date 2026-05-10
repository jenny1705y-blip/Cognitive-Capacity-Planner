import type { CaffeineLog, CapacityPoint, Chronotype, SleepLog, StudyTask } from "@/lib/types";

const MS_PER_HOUR = 1000 * 60 * 60;

function sleepPressureAwake(hoursAwake: number, tau = 18.2) {
  return 1 - Math.exp(-Math.max(hoursAwake, 0) / tau);
}

function sleepPressureAsleep(sAtBedtime: number, hoursAsleep: number, tau = 4.2) {
  return sAtBedtime * Math.exp(-Math.max(hoursAsleep, 0) / tau);
}

function circadian(clockHour: number, peakHour = 17) {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * (clockHour - peakHour)) / 24);
}

function caffeineRemaining(doseMg: number, hours: number, halfLife = 5) {
  return doseMg * Math.pow(0.5, hours / halfLife);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatHour(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function peakHourForChronotype(chronotype: Chronotype) {
  if (chronotype === "morning") return 15;
  if (chronotype === "evening") return 19;
  return 17;
}

export function buildCapacityCurve({
  start,
  sleepLogs,
  caffeineLogs,
  chronotype,
  caffeineSensitivity = 1
}: {
  start: Date;
  sleepLogs: SleepLog[];
  caffeineLogs: CaffeineLog[];
  chronotype: Chronotype;
  caffeineSensitivity?: number;
}): CapacityPoint[] {
  const peakHour = peakHourForChronotype(chronotype);
  const latestSleep = [...sleepLogs]
    .filter((log) => new Date(log.sleep_end).getTime() <= start.getTime())
    .sort((a, b) => new Date(b.sleep_end).getTime() - new Date(a.sleep_end).getTime())[0];

  const wakeTime = latestSleep ? new Date(latestSleep.sleep_end) : new Date(start);
  wakeTime.setHours(7, 0, 0, 0);

  const raw = Array.from({ length: 97 }, (_, index) => {
    const hour = index * 0.25;
    const instant = new Date(start.getTime() + hour * MS_PER_HOUR);
    const clockHour = instant.getHours() + instant.getMinutes() / 60;
    const bedtime = new Date(instant);
    bedtime.setHours(23, 0, 0, 0);

    let sleepPressure: number;
    if (instant.getHours() >= 23 || instant.getHours() < 7) {
      const bedStart = new Date(instant);
      if (instant.getHours() < 7) bedStart.setDate(bedStart.getDate() - 1);
      bedStart.setHours(23, 0, 0, 0);
      const sAtBedtime = sleepPressureAwake((bedStart.getTime() - wakeTime.getTime()) / MS_PER_HOUR);
      sleepPressure = sleepPressureAsleep(sAtBedtime, (instant.getTime() - bedStart.getTime()) / MS_PER_HOUR);
    } else {
      sleepPressure = sleepPressureAwake((instant.getTime() - wakeTime.getTime()) / MS_PER_HOUR);
    }

    const conditionS = 1 - clamp(sleepPressure, 0, 1);
    const processC = circadian(clockHour, peakHour);
    const caffeineMg = caffeineLogs.reduce((sum, log) => {
      const elapsed = (instant.getTime() - new Date(log.consumed_at).getTime()) / MS_PER_HOUR;
      return elapsed >= 0 ? sum + caffeineRemaining(log.dose_mg, elapsed) : sum;
    }, 0);
    const caffeineEffect = clamp((caffeineMg * caffeineSensitivity) / 100, 0, 1);

    const rawScore = 0.45 * conditionS + 0.35 * processC + 0.2 * caffeineEffect;
    return {
      hour,
      clockHour,
      label: formatHour(instant),
      processS: conditionS,
      processC,
      caffeine: caffeineEffect,
      rawScore
    };
  });

  const min = Math.min(...raw.map((point) => point.rawScore));
  const max = Math.max(...raw.map((point) => point.rawScore));

  return raw.map((point) => ({
    hour: point.hour,
    clockHour: point.clockHour,
    label: point.label,
    processS: point.processS,
    processC: point.processC,
    caffeine: point.caffeine,
    score: Math.round(((point.rawScore - min) / Math.max(max - min, 0.001)) * 100)
  }));
}

export function recommendedBandForTask(task: StudyTask) {
  if (task.difficulty === "high") return "Peak capacity";
  if (task.difficulty === "medium") return "Good capacity";
  return "Recovery or review";
}

export function localSchedule(tasks: StudyTask[], curve: CapacityPoint[], start: Date) {
  const freePoints = [...curve]
    .filter((point) => point.hour >= 0.5 && point.hour <= 16)
    .sort((a, b) => b.score - a.score);

  return tasks.slice(0, 6).map((task, index) => {
    const target = freePoints[index * 4] ?? freePoints[index] ?? curve[0];
    const startAt = new Date(start.getTime() + target.hour * MS_PER_HOUR);
    const endAt = new Date(startAt.getTime() + task.estimated_minutes * 60 * 1000);

    return {
      task_id: task.id ?? null,
      title: task.title,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      capacity_score: target.score,
      created_by: "ai" as const
    };
  });
}
