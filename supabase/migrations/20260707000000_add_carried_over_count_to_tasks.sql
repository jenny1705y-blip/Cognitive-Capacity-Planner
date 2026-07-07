alter table public.tasks
add column if not exists carried_over_count integer not null default 0
check (carried_over_count >= 0);
