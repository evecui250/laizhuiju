'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Bar from '../../components/Bar';
import {
  ensureUser, getMembers, getNickname, getRoom, joinRoom, leaveRoom, setWatched, watchRoom,
  type Member, type Room,
} from '../../lib/api';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const latestOf = (w: number[]) => (w.length ? Math.max(...w) : 0);

export default function RoomPage() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [mine, setMine] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(0);

  const reload = useCallback(async (id: string, uid: string) => {
    const ms = await getMembers(id);
    setMembers(ms);
    // Don't overwrite our own optimistic ticks while a save is in flight.
    if (pending.current === 0) setMine(ms.find((m) => m.user_id === uid)?.watched ?? []);
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id') ?? '';
    setRoomId(id);
    if (!id) { setRoom(null); return; }
    let stop = () => {};
    ensureUser()
      .then(async (uid) => {
        setUserId(uid);
        setRoom(await getRoom(id));
        await reload(id, uid);
        stop = watchRoom(id, () => reload(id, uid).catch(() => {}));
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => stop();
  }, [reload]);

  if (error) return <Back><p className="mt-8 text-coral">出错了：{error}</p></Back>;
  if (room === undefined) return <Back><p className="mt-8 text-mist">加载中…</p></Back>;
  if (room === null) return <Back><p className="mt-8 text-mist">找不到这个房间。</p></Back>;

  const me = members.find((m) => m.user_id === userId);
  const others = members
    .filter((m) => m.user_id !== userId)
    .sort((a, b) => latestOf(b.watched) - latestOf(a.watched));

  async function save(next: number[]) {
    const sorted = [...new Set(next)].sort((a, b) => a - b);
    setMine(sorted);
    pending.current++; setSaving(true);
    try { await setWatched(roomId, userId, sorted); }
    catch (e: any) { setError(e.message ?? String(e)); }
    finally {
      pending.current--;
      if (pending.current === 0) { setSaving(false); reload(roomId, userId).catch(() => {}); }
    }
  }

  const toggle = (ep: number) => save(mine.includes(ep) ? mine.filter((e) => e !== ep) : [...mine, ep]);
  const myLatest = latestOf(mine);

  return (
    <Back>
      <header className="mt-4">
        <h1 className="text-3xl font-bold">{room.name}</h1>
        <p className="mt-1 text-sm text-mist">
          共 {room.episode_count} 集 · {members.length} 人在追
        </p>
      </header>

      {!me ? (
        <JoinBox onJoin={async () => { await joinRoom(roomId, getNickname() || '新朋友'); await reload(roomId, userId); }} />
      ) : (
        <>
          <section className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-widest text-popcorn">我看过的集</h2>
              <span className="text-xs text-mist">{saving ? '保存中…' : '点一下标记 / 取消'}</span>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: room.episode_count }, (_, i) => i + 1).map((ep) => {
                const on = mine.includes(ep);
                return (
                  <button
                    key={ep}
                    onClick={() => toggle(ep)}
                    aria-pressed={on}
                    className={`aspect-square rounded-xl text-sm font-semibold transition active:scale-95 ${
                      on ? 'bg-popcorn text-night' : 'bg-card text-mist'
                    }`}
                  >
                    {ep}
                  </button>
                );
              })}
            </div>
            {myLatest < room.episode_count && (
              <button
                onClick={() => save([...Array.from({ length: myLatest + 1 }, (_, i) => i + 1), ...mine])}
                className="mt-4 w-full rounded-xl border border-popcorn/60 py-3 text-popcorn active:scale-[0.98]"
              >
                看完第 {myLatest + 1} 集了 ✓
              </button>
            )}
          </section>

          <section className="mt-10">
            <h2 className="mb-3 text-sm font-semibold tracking-widest text-popcorn">大家追到哪了</h2>
            <ul className="space-y-3">
              <MemberRow m={{ ...me, watched: mine }} total={room.episode_count} label="我" mine />
              {others.map((m) => {
                const diff = latestOf(m.watched) - myLatest;
                const note = diff > 0 ? `比你快 ${diff} 集` : diff < 0 ? `比你慢 ${-diff} 集` : '和你一样';
                return <MemberRow key={m.user_id} m={m} total={room.episode_count} note={note} />;
              })}
            </ul>
            {others.length === 0 && (
              <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-mist">
                还没有朋友加入。让 TA 打开来追剧呀，搜索「{room.name}」就能进来。
              </p>
            )}
          </section>

          <button
            className="mt-12 w-full text-center text-xs text-mist/60 underline"
            onClick={async () => {
              if (!confirm('退出这个房间？你的观看记录会被删除。')) return;
              await leaveRoom(roomId, userId);
              location.href = `${base}/`;
            }}
          >
            退出房间
          </button>
        </>
      )}
    </Back>
  );
}

function Back({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href={`${base}/`} className="text-sm text-mist">← 来追剧呀</a>
      {children}
    </>
  );
}

function MemberRow({ m, total, label, note, mine }: { m: Member; total: number; label?: string; note?: string; mine?: boolean }) {
  const latest = latestOf(m.watched);
  return (
    <li className={`rounded-2xl p-4 ${mine ? 'bg-card ring-1 ring-popcorn/40' : 'bg-card'}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">
          {m.nickname}
          {label && <span className="ml-2 text-xs text-popcorn">{label}</span>}
        </span>
        <span className="text-sm text-mist">{latest ? `看到第 ${latest} 集` : '还没开始'}</span>
      </div>
      <Bar value={m.watched.length} max={total} color={mine ? 'bg-popcorn' : 'bg-coral'} />
      <p className="mt-1 text-xs text-mist">已看 {m.watched.length}/{total} 集{note ? ` · ${note}` : ''}</p>
    </li>
  );
}

function JoinBox({ onJoin }: { onJoin: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-8 rounded-2xl bg-card p-5 text-center">
      <p className="text-mist">你还不在这个房间里</p>
      <button
        className="mt-4 rounded-xl bg-popcorn px-6 py-3 font-semibold text-night disabled:opacity-40"
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onJoin(); } finally { setBusy(false); } }}
      >
        加入一起追
      </button>
    </div>
  );
}
