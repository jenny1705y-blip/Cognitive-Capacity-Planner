create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chronotype text not null default 'neutral'
    check (chronotype in ('morning', 'neutral', 'evening')),
  caffeine_sensitivity numeric not null default 1.0,
  circadian_peak_hour numeric not null default 17,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,
  quality integer check (quality between 1 and 5),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.caffeine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consumed_at timestamptz not null,
  dose_mg numeric not null check (dose_mg >= 0),
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  difficulty text not null default 'medium'
    check (difficulty in ('low', 'medium', 'high')),
  estimated_minutes integer not null default 60 check (estimated_minutes > 0),
  due_at timestamptz,
  status text not null default 'unscheduled'
    check (status in ('unscheduled', 'scheduled', 'completed', 'archived')),
  source text not null default 'manual'
    check (source in ('manual', 'google_calendar', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity_score numeric check (capacity_score between 0 and 100),
  google_event_id text,
  created_by text not null default 'ai'
    check (created_by in ('user', 'ai', 'google_calendar')),
  created_at timestamptz not null default now()
);

create table if not exists public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;
alter table public.sleep_logs enable row level security;
alter table public.caffeine_logs enable row level security;
alter table public.tasks enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.google_oauth_tokens enable row level security;
alter table public.agent_runs enable row level security;

create policy "Users can manage own settings"
on public.user_settings for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage own sleep logs"
on public.sleep_logs for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage own caffeine logs"
on public.caffeine_logs for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage own tasks"
on public.tasks for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can manage own schedule blocks"
on public.schedule_blocks for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view own agent runs"
on public.agent_runs for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own agent runs"
on public.agent_runs for insert
to authenticated
with check ((select auth.uid()) = user_id);
