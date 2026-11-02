-- The room's creator can always get back into their own room without a code
-- (e.g. rooms whose creator left before leaving kept records).
-- See 20261102150000_invites_and_privacy.sql for the rest of join_room.
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

  -- The room's creator never needs a code to get back in.
  if exists (select 1 from public.rooms where id = p_room_id and created_by = uid) then
    insert into public.members (room_id, user_id, nickname) values (p_room_id, uid, btrim(p_nickname));
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

