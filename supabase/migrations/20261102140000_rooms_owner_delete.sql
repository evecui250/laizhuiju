-- Whoever created a room can delete it (members' progress goes with it,
-- via the on delete cascade on members.room_id).
create policy rooms_owner_delete on public.rooms
  for delete to authenticated using (created_by = auth.uid());
