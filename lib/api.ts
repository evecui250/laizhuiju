'use client';

// Every database call lives in this file, so moving off Supabase later
// (e.g. to our own server) only means rewriting this one layer.

import { supabase } from './supabase';

export type Room = {
  id: string;
  name: string;
  episode_count: number;
  created_by: string;
  created_at: string;
};

export type Member = {
  room_id: string;
  user_id: string;
  nickname: string;
  watched: number[];
  updated_at: string;
};

export type MyRoom = Room & { watched: number[] };

const NICK_KEY = 'lzj_nickname';

export function getNickname(): string {
  try { return localStorage.getItem(NICK_KEY) ?? ''; } catch { return ''; }
}

export function saveNickname(nick: string) {
  try { localStorage.setItem(NICK_KEY, nick); } catch { /* ignore */ }
}

/** No account needed: each device gets an anonymous Supabase user. */
export async function ensureUser(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw new Error(error?.message ?? '登录失败');
  return signed.user.id;
}

export async function myRooms(userId: string): Promise<MyRoom[]> {
  const { data, error } = await supabase
    .from('members')
    .select('watched, updated_at, rooms(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? [])
    .filter((r: any) => r.rooms)
    .map((r: any) => ({ ...(r.rooms as Room), watched: r.watched as number[] }));
}

export async function searchRooms(query: string): Promise<Room[]> {
  const q = query.trim().replace(/[%_\\]/g, (c) => '\\' + c);
  if (!q) return [];
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .ilike('name', `%${q}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function createRoom(name: string, episodeCount: number, nickname: string): Promise<Room> {
  const { data, error } = await supabase
    .from('rooms')
    .insert({ name: name.trim(), episode_count: episodeCount })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('这个房间名已经有人用了，换一个吧');
    throw new Error(error.message);
  }
  await joinRoom(data.id, nickname);
  return data;
}

export async function joinRoom(roomId: string, nickname: string) {
  const { error } = await supabase
    .from('members')
    .upsert({ room_id: roomId, nickname: nickname.trim() }, { onConflict: 'room_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMembers(roomId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function setWatched(roomId: string, userId: string, watched: number[]) {
  const { error } = await supabase
    .from('members')
    .update({ watched })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function renameEverywhere(userId: string, nickname: string) {
  const { error } = await supabase.from('members').update({ nickname: nickname.trim() }).eq('user_id', userId);
  if (error) throw error;
}

export async function leaveRoom(roomId: string, userId: string) {
  const { error } = await supabase.from('members').delete().eq('room_id', roomId).eq('user_id', userId);
  if (error) throw error;
}

/** Calls onChange whenever anyone in the room updates their progress. */
export function watchRoom(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
