-- Haze Atlas backend: run in the Supabase SQL Editor before configuring the website.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable by owner" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles insertable by owner" on public.profiles for insert to authenticated with check (auth.uid() = id and role = 'user');
create policy "profiles editable by owner" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id and role = 'user');

create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_states enable row level security;
create policy "states readable by owner" on public.user_states for select to authenticated using (auth.uid() = user_id);
create policy "states insertable by owner" on public.user_states for insert to authenticated with check (auth.uid() = user_id);
create policy "states editable by owner" on public.user_states for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.value_snapshots (
  id bigint generated always as identity primary key,
  source text not null,
  payload jsonb not null,
  observed_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.value_snapshots enable row level security;
create policy "snapshots readable by everyone" on public.value_snapshots for select using (true);
create policy "snapshots insertable by admins" on public.value_snapshots for insert to authenticated with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

create table if not exists public.sync_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('started','success','error')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id)
);
alter table public.sync_runs enable row level security;
create policy "sync runs readable by everyone" on public.sync_runs for select using (true);
create policy "sync runs insertable by admins" on public.sync_runs for insert to authenticated with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));

-- The first administrator must be promoted manually after their first sign-in:
-- update public.profiles set role='admin' where id='<AUTH_USER_UUID>';
