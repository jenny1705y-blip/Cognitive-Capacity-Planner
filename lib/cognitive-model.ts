import type { CaffeineLog, CapacityPoint, Chronotype, SleepLog, StudyTask } from "@/lib/types";

const MS_PER_HOUR = 1000 * 60 * 60;

function sleepPressureAwakeFrom(initialPressure: number, hoursAwake: number, tau = 18.2) {
  return 1 - (1 - clamp(initialPressure, 0, 1)) * Math.exp(-Math.max(hoursAwake, 0) / tau);
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

export function estimateCaffeineSleepForecast({
  doseMg,
  consumedAt,
  baselineBedHour = 23,
  thresholdMg = 25
}: {
  doseMg: number;
  consumedAt: Date;
  baselineBedHour?: number;
  thresholdMg?: number;
}) {
  const baselineBedtime = new Date(consumedAt);
  baselineBedtime.setHours(baselineBedHour, 0, 0, 0);
  if (baselineBedtime.getTime() <= consumedAt.getTime()) baselineBedtime.setDate(baselineBedtime.getDate() + 1);

  const elapsedToBaseline = (baselineBedtime.getTime() - consumedAt.getTime()) / MS_PER_HOUR;
  const remainingAtBaselineMg = caffeineRemaining(Math.max(doseMg, 0), elapsedToBaseline);
  const hoursUntilThreshold = doseMg <= thresholdMg ? 0 : 5 * Math.log2(doseMg / thresholdMg);
  const clearsBelowThresholdAt = new Date(consumedAt.getTime() + hoursUntilThreshold * MS_PER_HOUR);
  const estimatedSleepWindow = new Date(Math.max(baselineBedtime.getTime(), clearsBelowThresholdAt.getTime()));
  estimatedSleepWindow.setMinutes(Math.ceil(estimatedSleepWindow.getMinutes() / 15) * 15, 0, 0);

  return {
    baselineBedtime,
    remainingAtBaselineMg: Math.round(remainingAtBaselineMg),
    clearsBelowThresholdAt,
    estimatedSleepWindow,
    delayMinutes: Math.max(0, Math.round((estimatedSleepWindow.getTime() - baselineBedtime.getTime()) / (60 * 1000))),
    thresholdMg
  };
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
    .filter((log) => {
      const sleepStart = new Date(log.sleep_start).getTime();
      const sleepEnd = new Date(log.sleep_end).getTime();
      const duration = (sleepEnd - sleepStart) / MS_PER_HOUR;
      return sleepEnd <= start.getTime() && duration > 0 && duration <= 18;
    })
    .sort((a, b) => new Date(b.sleep_end).getTime() - new Date(a.sleep_end).getTime())[0];

  const wakeTime = latestSleep ? new Date(latestSleep.sleep_end) : new Date(start);
  const sleepDuration = latestSleep
    ? (new Date(latestSleep.sleep_end).getTime() - new Date(latestSleep.sleep_start).getTime()) / MS_PER_HOUR
    : 8;
  const pressureAtWake = sleepPressureAsleep(0.9, sleepDuration);
  if (!latestSleep) {
    wakeTime.setHours(7, 0, 0, 0);
    if (wakeTime.getTime() > start.getTime()) wakeTime.setDate(wakeTime.getDate() - 1);
  }

  const nextBedtime = new Date(start);
  nextBedtime.setHours(23, 0, 0, 0);
  if (nextBedtime.getTime() <= start.getTime()) nextBedtime.setDate(nextBedtime.getDate() + 1);

  const nextWakeTime = new Date(nextBedtime.getTime() + 8 * MS_PER_HOUR);
  const pressureAtBedtime = sleepPressureAwakeFrom(
    pressureAtWake,
    (nextBedtime.getTime() - wakeTime.getTime()) / MS_PER_HOUR
  );
  const pressureAfterPlannedSleep = sleepPressureAsleep(pressureAtBedtime, 8);

  return Array.from({ length: 97 }, (_, index) => {
    const hour = index * 0.25;
    const instant = new Date(start.getTime() + hour * MS_PER_HOUR);
    const clockHour = instant.getHours() + instant.getMinutes() / 60;

    let sleepPressure: number;
    if (instant.getTime() < nextBedtime.getTime()) {
      sleepPressure = sleepPressureAwakeFrom(pressureAtWake, (instant.getTime() - wakeTime.getTime()) / MS_PER_HOUR);
    } else if (instant.getTime() < nextWakeTime.getTime()) {
      sleepPressure = sleepPressureAsleep(pressureAtBedtime, (instant.getTime() - nextBedtime.getTime()) / MS_PER_HOUR);
    } else {
      sleepPressure = sleepPressureAwakeFrom(
        pressureAfterPlannedSleep,
        (instant.getTime() - nextWakeTime.getTime()) / MS_PER_HOUR
      );
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
      score: Math.round(clamp(rawScore, 0, 1) * 100)
    };
  });
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
