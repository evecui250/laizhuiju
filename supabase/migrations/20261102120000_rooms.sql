-- 来追剧呀 v1: rooms (one per series) and members (who is in a room and
-- which episodes they have watched).
--
-- Nobody logs in with an account: the app signs every device in with
-- Supabase anonymous auth, so each person still gets a stable auth.uid()
-- and the policies below can make sure people only change their own rows.

create table public.rooms (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 40),
  episode_count int  not null check (episode_count between 1 and 500),
  created_by    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

-- Room names are how people find each other, so they must be unique
-- (ignoring case and surrounding spaces).
create unique index rooms_name_unique on public.rooms (lower(btrim(name)));

create table public.members (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(btrim(nickname)) between 1 and 20),
  watched    int[] not null default '{}',
  joined_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index members_user_idx on public.members (user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

alter table public.rooms   enable row level security;
alter table public.members enable row level security;

-- Anyone using the app can find rooms and see who is in them.
create policy rooms_read on public.rooms
  for select to authenticated using (true);
create policy rooms_create on public.rooms
  for insert to authenticated with check (created_by = auth.uid());
create policy rooms_owner_update on public.rooms
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy members_read on public.members
  for select to authenticated using (true);
create policy members_join on public.members
  for insert to authenticated with check (user_id = auth.uid());
create policy members_update_self on public.members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_leave on public.members
  for delete to authenticated using (user_id = auth.uid());

-- Live updates when a friend ticks an episode.
alter publication supabase_realtime add table public.members;
