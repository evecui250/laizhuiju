-- Invite-only rooms, leaving keeps your record, and privacy for members.
--
-- * Anyone can see that a room exists (name, episode count, member count),
--   but only active members can see who is in it and how far they are.
-- * Joining needs the room's invite link (long token) or 4-digit code.
--   Wrong codes are rate limited (5 tries per 15 minutes per room).
-- * Leaving sets members.left_at instead of deleting the row: the person's
--   ticks are kept (visible only to themselves) and come back if they rejoin.

-- ---------- leaving keeps the record ----------
alter table public.members add column left_at timestamptz;

-- ---------- invite secrets (members only) ----------
create table public.room_secrets (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  code    text not null default lpad(floor(random() * 10000)::int::text, 4, '0'),
  token   text not null unique default encode(extensions.gen_random_bytes(12), 'hex')
);
insert into public.room_secrets (room_id) select id from public.rooms;

create table public.join_attempts (
  user_id uuid not null,
  room_id uuid not null references public.rooms (id) on delete cascade,
  at      timestamptz not null default now()
);
create index join_attempts_lookup on public.join_attempts (user_id, room_id, at);

alter table public.room_secrets  enable row level security;
alter table public.join_attempts enable row level security;  -- no policies: functions only

-- ---------- helpers ----------
create or replace function public.is_active_member(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where room_id = rid and user_id = (select auth.uid()) and left_at is null
  );
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- policies ----------
drop policy members_read  on public.members;
drop policy members_join  on public.members;
drop policy members_leave on public.members;
drop policy rooms_create  on public.rooms;

create policy members_read on public.members
  for select to authenticated
  using (user_id = (select auth.uid()) or (left_at is null and public.is_active_member(room_id)));

-- People may only change their own ticks, nickname and left_at, never move
-- their row to another room.
revoke insert, update on public.members from authenticated, anon;
grant update (watched, nickname, left_at) on public.members to authenticated;
revoke insert on public.rooms from authenticated, anon;

create policy secrets_read on public.room_secrets
  for select to authenticated using (public.is_active_member(room_id));

-- ---------- functions the app calls ----------
create or replace function public.create_room(p_name text, p_episode_count int, p_nickname text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare rid uuid;
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  insert into public.rooms (name, episode_count, created_by)
    values (btrim(p_name), p_episode_count, (select auth.uid()))
    returning id into rid;
  insert into public.room_secrets (room_id) values (rid);
  insert into public.members (room_id, user_id, nickname)
    values (rid, (select auth.uid()), btrim(p_nickname));
  return rid;
end $$;

-- Returns 'ok', 'wrong_code', 'too_many_tries' or 'no_room'.
create or replace function public.join_room(p_room_id uuid, p_nickname text, p_code text default null, p_token text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.rooms where id = p_room_id) then return 'no_room'; end if;

  -- Former members come back without a code, with their old ticks.
  if exists (select 1 from public.members where room_id = p_room_id and user_id = uid) then
    update public.members set left_at = null, nickname = btrim(p_nickname)
      where room_id = p_room_id and user_id = uid;
    return 'ok';
  end if;

  if (select count(*) from public.join_attempts
      where user_id = uid and room_id = p_room_id and at > now() - interval '15 minutes') >= 5 then
    return 'too_many_tries';
  end if;

  if exists (
    select 1 from public.room_secrets s
    where s.room_id = p_room_id
      and ((p_token is not null and s.token = p_token) or (p_code is not null and s.code = btrim(p_code)))
  ) then
    insert into public.members (room_id, user_id, nickname) values (p_room_id, uid, btrim(p_nickname));
    return 'ok';
  end if;

  insert into public.join_attempts (user_id, room_id) values (uid, p_room_id);
  return 'wrong_code';
end $$;

-- What everyone may see about rooms, plus my own relation to each.
create or replace function public.room_summaries()
returns table (
  id uuid, name text, episode_count int, created_by uuid, created_at timestamptz,
  member_count bigint, my_status text, my_watched int[]
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.name, r.episode_count, r.created_by, r.created_at,
         (select count(*) from public.members m where m.room_id = r.id and m.left_at is null),
         case when me.user_id is null then null when me.left_at is null then 'member' else 'left' end,
         me.watched
  from public.rooms r
  left join public.members me on me.room_id = r.id and me.user_id = (select auth.uid())
  order by r.created_at desc
  limit 300;
$$;

revoke execute on function public.create_room(text, int, text) from anon, public;
revoke execute on function public.join_room(uuid, text, text, text) from anon, public;
revoke execute on function public.room_summaries() from anon, public;
revoke execute on function public.is_active_member(uuid) from anon, public;
grant execute on function public.create_room(text, int, text) to authenticated;
grant execute on function public.join_room(uuid, text, text, text) to authenticated;
grant execute on function public.room_summaries() to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;
