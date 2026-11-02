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

/** What anyone can see about a room, plus my own relation to it. */
export type RoomSummary = Room & {
  member_count: number;
  my_status: 'member' | 'left' | null;
  my_watched: number[] | null;
};

export type Member = {
  room_id: string;
  user_id: string;
  nickname: string;
  watched: number[];
  left_at: string | null;
  updated_at: string;
};

export type Invite = { code: string; token: string };

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

export async function roomSummaries(): Promise<RoomSummary[]> {
  const { data, error } = await supabase.rpc('room_summaries');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, member_count: Number(r.member_count) }));
}

export async function createRoom(name: string, episodeCount: number, nickname: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_room', {
    p_name: name.trim(), p_episode_count: episodeCount, p_nickname: nickname.trim(),
  });
  if (error) {
    if (error.code === '23505') throw new Error('这个房间名已经有人用了，换一个吧');
    throw new Error(error.message);
  }
  return data as string;
}

const JOIN_ERRORS: Record<string, string> = {
  wrong_code: '邀请码不对，再问问朋友？',
  too_many_tries: '试错太多次了，15 分钟后再试',
  no_room: '这个房间已经不在了',
};

/** Join with the 4-digit code or the invite link's token. Former members need neither. */
export async function joinRoom(roomId: string, nickname: string, opts: { code?: string; token?: string } = {}) {
  const { data, error } = await supabase.rpc('join_room', {
    p_room_id: roomId, p_nickname: nickname.trim(),
    p_code: opts.code ?? null, p_token: opts.token ?? null,
  });
  if (error) throw new Error(error.message);
  if (data !== 'ok') throw new Error(JOIN_ERRORS[data as string] ?? '加入失败');
}

export async function getInvite(roomId: string): Promise<Invite | null> {
  const { data, error } = await supabase.from('room_secrets').select('code, token').eq('room_id', roomId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Active members (only visible to active members), plus my own row even if I left. */
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

/** Leaving keeps my ticks (only I can see them); rejoining brings them back. */
export async function leaveRoom(roomId: string, userId: string) {
  const { error } = await supabase
    .from('members')
    .update({ left_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** Only the room's creator can do this (enforced by RLS). */
export async function deleteRoom(roomId: string) {
  const { data, error } = await supabase.from('rooms').delete().eq('id', roomId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('只有创建房间的人可以删除它');
}

/** Calls onChange whenever anyone in the room updates their progress. */
export function watchRoom(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
