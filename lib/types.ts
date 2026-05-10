export type Chronotype = "morning" | "neutral" | "evening";
export type Difficulty = "low" | "medium" | "high";

export type SleepLog = {
  id?: string;
  sleep_start: string;
  sleep_end: string;
  quality?: number | null;
  notes?: string | null;
};

export type CaffeineLog = {
  id?: string;
  consumed_at: string;
  dose_mg: number;
  label?: string | null;
};

export type StudyTask = {
  id?: string;
  title: string;
  description?: string | null;
  difficulty: Difficulty;
  estimated_minutes: number;
  due_at?: string | null;
  status?: "unscheduled" | "scheduled" | "completed" | "archived";
  source?: "manual" | "google_calendar" | "ai";
};

export type CapacityPoint = {
  hour: number;
  clockHour: number;
  label: string;
  processS: number;
  processC: number;
  caffeine: number;
  score: number;
};

export type ScheduleBlock = {
  id?: string;
  task_id?: string | null;
  title: string;
  start_at: string;
  end_at: string;
  capacity_score?: number | null;
  google_event_id?: string | null;
  created_by?: "user" | "ai" | "google_calendar";
};

export type UserSettings = {
  chronotype: Chronotype;
  caffeine_sensitivity: number;
  circadian_peak_hour: number;
};
