'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Bar from '../../components/Bar';
import NicknameForm from '../../components/NicknameForm';
import {
  deleteRoom, ensureUser, getInvite, getMembers, getNickname, getRoom, joinRoom, leaveRoom,
  roomSummaries, saveNickname, setWatched, watchRoom,
  type Invite, type Member, type Room,
} from '../../lib/api';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const latestOf = (w: number[]) => (w.length ? Math.max(...w) : 0);
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

export default function RoomPage() {
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [mine, setMine] = useState<number[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(0);

  const reload = useCallback(async (id: string, uid: string) => {
    const [ms, summaries] = await Promise.all([getMembers(id), roomSummaries()]);
    setMembers(ms);
    setMemberCount(summaries.find((s) => s.id === id)?.member_count ?? 0);
    const me = ms.find((m) => m.user_id === uid);
    // Don't overwrite our own optimistic ticks while a save is in flight.
    if (pending.current === 0) setMine(me?.watched ?? []);
    if (me && !me.left_at) setInvite(await getInvite(id).catch(() => null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id') ?? '';
    setRoomId(id);
    setInviteToken(params.get('invite') ?? '');
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

  const me = members.find((m) => m.user_id === userId);
  const status: 'member' | 'left' | 'none' = !me ? 'none' : me.left_at ? 'left' : 'member';

  const join = useCallback(async (opts: { code?: string; token?: string }) => {
    await joinRoom(roomId, getNickname(), opts);
    if (opts.token) history.replaceState(null, '', `${base}/room/?id=${roomId}`);
    setInviteToken('');
    await reload(roomId, userId);
  }, [roomId, userId, reload]);

  if (error) return <Back><p className="mt-8 text-coral">出错了：{error}</p></Back>;
  if (room === undefined) return <Back><p className="mt-8 text-mist">加载中…</p></Back>;
  if (room === null) return <Back><p className="mt-8 text-mist">找不到这个房间，可能已经被删除了。</p></Back>;

  const header = (
    <header className="mt-4">
      <h1 className="text-3xl font-bold">{room.name}</h1>
      <p className="mt-1 text-sm text-mist">共 {room.episode_count} 集 · {memberCount} 人在追</p>
    </header>
  );

  if (status !== 'member') {
    return (
      <Back>
        {header}
        <JoinBox
          status={status}
          myLatest={latestOf(me?.watched ?? [])}
          inviteToken={inviteToken}
          onJoin={join}
        />
      </Back>
    );
  }

  const others = members
    .filter((m) => m.user_id !== userId && !m.left_at)
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
      {header}

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-widest text-popcorn">我看过的集</h2>
          <span className="text-xs text-mist">{saving ? '保存中…' : '点一下标记 / 取消'}</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {upTo(room.episode_count).map((ep) => {
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
        <BulkMark
          total={room.episode_count}
          latest={myLatest}
          allDone={mine.length === room.episode_count}
          onUpTo={(n) => save([...upTo(n), ...mine])}
          onAll={() => save(upTo(room.episode_count))}
          onClear={() => save([])}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-popcorn">大家追到哪了</h2>
        <ul className="space-y-3">
          <MemberRow m={{ ...me!, watched: mine }} total={room.episode_count} label="我" mine />
          {others.map((m) => {
            const diff = latestOf(m.watched) - myLatest;
            const note = diff > 0 ? `比你快 ${diff} 集` : diff < 0 ? `比你慢 ${-diff} 集` : '和你一样';
            return <MemberRow key={m.user_id} m={m} total={room.episode_count} note={note} />;
          })}
        </ul>
      </section>

      {invite && <InviteBox roomId={roomId} roomName={room.name} invite={invite} lonely={others.length === 0} />}

      <div className="mt-12 flex justify-center gap-8 text-xs">
        <button
          className="text-mist/60 underline"
          onClick={async () => {
            if (!confirm('退出这个房间？你的观看记录会保留（只有你自己看得到），以后可以随时回来。')) return;
            await leaveRoom(roomId, userId);
            location.href = `${base}/`;
          }}
        >
          退出房间
        </button>
        {room.created_by === userId && (
          <button
            className="text-coral/80 underline"
            onClick={async () => {
              if (!confirm(`删除房间「${room.name}」？所有人的观看记录都会一起删除，不能恢复。`)) return;
              try { await deleteRoom(roomId); location.href = `${base}/#mine`; }
              catch (e: any) { setError(e.message ?? String(e)); }
            }}
          >
            删除房间
          </button>
        )}
      </div>
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
        <span className="text-sm text-mist">
          {m.watched.length === total ? '全部看完 🎉' : latest ? `看到第 ${latest} 集` : '还没开始'}
        </span>
      </div>
      <Bar value={m.watched.length} max={total} color={mine ? 'bg-popcorn' : 'bg-coral'} />
      <p className="mt-1 text-xs text-mist">已看 {m.watched.length}/{total} 集{note ? ` · ${note}` : ''}</p>
    </li>
  );
}

function InviteBox({ roomId, roomName, invite, lonely }: { roomId: string; roomName: string; invite: Invite; lonely: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${base}/room/?id=${roomId}&invite=${invite.token}`;
  const text = `来「来追剧呀」一起追《${roomName}》吧！点链接加入：${link}（或在 App 里找到房间，输入邀请码 ${invite.code}）`;

  return (
    <section className="mt-10 rounded-2xl border border-dashed border-line p-5">
      <h2 className="text-sm font-semibold tracking-widest text-popcorn">邀请朋友</h2>
      {lonely && <p className="mt-2 text-sm text-mist">还没有朋友加入，把链接发给 TA 吧。</p>}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-mist">邀请码</span>
        <span className="font-mono text-3xl font-bold tracking-[0.3em] text-popcorn">{invite.code}</span>
      </div>
      <button
        className="mt-4 w-full rounded-xl bg-popcorn py-3 font-semibold text-night active:scale-[0.98]"
        onClick={async () => {
          if (navigator.share) {
            try { await navigator.share({ title: '来追剧呀', text }); return; } catch { /* fall back to copy */ }
          }
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
          catch { prompt('复制这段话发给朋友：', text); }
        }}
      >
        {copied ? '已复制，去微信粘贴吧 ✓' : '分享邀请链接'}
      </button>
      <p className="mt-3 text-xs text-mist/70">只有拿到链接或邀请码的人能加入。其他人只能看到剧名和人数，看不到谁在追、追到哪。</p>
    </section>
  );
}

function JoinBox({ status, myLatest, inviteToken, onJoin }: {
  status: 'left' | 'none'; myLatest: number; inviteToken: string;
  onJoin: (opts: { code?: string; token?: string }) => Promise<void>;
}) {
  const [nickname, setNick] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tried = useRef(false);

  async function run(opts: { code?: string; token?: string }) {
    setBusy(true); setErr('');
    try { await onJoin(opts); }
    catch (e: any) { setErr(e.message ?? String(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => { setNick(getNickname()); }, []);

  // Opened from an invite link: join straight away once we have a nickname.
  useEffect(() => {
    if (inviteToken && nickname && !tried.current) { tried.current = true; run({ token: inviteToken }); }
  }, [inviteToken, nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!nickname) {
    return (
      <NicknameForm
        initial=""
        hint={inviteToken ? '朋友邀请你一起追剧！先起个昵称吧' : '先起个昵称吧'}
        button={inviteToken ? '加入' : '好啦'}
        onSave={(n) => { saveNickname(n); setNick(n); }}
      />
    );
  }

  if (status === 'left') {
    return (
      <div className="mt-8 rounded-2xl bg-card p-5 text-center">
        <p className="text-mist">你之前退出了这个房间{myLatest ? `，记录还在：看到第 ${myLatest} 集` : ''}</p>
        <button
          className="mt-4 rounded-xl bg-popcorn px-6 py-3 font-semibold text-night disabled:opacity-40"
          disabled={busy}
          onClick={() => run({})}
        >
          回到房间
        </button>
        {err && <p className="mt-3 text-sm text-coral">{err}</p>}
      </div>
    );
  }

  if (inviteToken && busy) return <p className="mt-8 text-mist">正在加入…</p>;

  const ok = /^\d{4}$/.test(code);
  return (
    <div className="mt-8 rounded-2xl bg-card p-5">
      <p className="text-center text-mist">🔒 这是朋友们的私密房间</p>
      <p className="mt-1 text-center text-sm text-mist/70">输入 4 位邀请码加入，或者请朋友发邀请链接给你</p>
      <form className="mt-5 flex gap-3" onSubmit={(e) => { e.preventDefault(); if (ok) run({ code }); }}>
        <input
          className="w-full rounded-xl border border-line bg-plum px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-popcorn"
          value={code}
          inputMode="numeric"
          maxLength={4}
          placeholder="····"
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <button className="shrink-0 rounded-xl bg-popcorn px-5 py-3 font-semibold text-night disabled:opacity-40" disabled={!ok || busy}>
          加入
        </button>
      </form>
      {err && <p className="mt-3 text-center text-sm text-coral">{err}</p>}
    </div>
  );
}

function BulkMark({ total, latest, allDone, onUpTo, onAll, onClear }: {
  total: number; latest: number; allDone: boolean;
  onUpTo: (n: number) => void; onAll: () => void; onClear: () => void;
}) {
  const [upto, setUpto] = useState('');
  const n = parseInt(upto, 10);
  const ok = n >= 1 && n <= total;
  return (
    <div className="mt-4 space-y-3">
      {latest < total && (
        <button
          onClick={() => onUpTo(latest + 1)}
          className="w-full rounded-xl border border-popcorn/60 py-3 text-popcorn active:scale-[0.98]"
        >
          看完第 {latest + 1} 集了 ✓
        </button>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (ok) { onUpTo(n); setUpto(''); } }}
      >
        <span className="shrink-0 text-sm text-mist">第 1 集看到第</span>
        <input
          className="w-16 rounded-lg border border-line bg-plum px-2 py-2 text-center outline-none focus:border-popcorn"
          value={upto}
          inputMode="numeric"
          placeholder={String(Math.min(total, Math.max(latest, 1)))}
          onChange={(e) => setUpto(e.target.value.replace(/\D/g, ''))}
        />
        <span className="shrink-0 text-sm text-mist">集</span>
        <button className="ml-auto shrink-0 rounded-lg bg-card px-3 py-2 text-sm text-popcorn disabled:opacity-40" disabled={!ok}>
          一起标记
        </button>
      </form>
      <div className="flex gap-3">
        <button
          onClick={onAll}
          disabled={allDone}
          className="flex-1 rounded-xl bg-popcorn py-3 font-semibold text-night disabled:opacity-40 active:scale-[0.98]"
        >
          {allDone ? '已全部看完 🎉' : '全部看完了'}
        </button>
        <button
          onClick={() => { if (confirm('清空你的所有观看记录？')) onClear(); }}
          className="rounded-xl bg-card px-4 py-3 text-sm text-mist active:scale-[0.98]"
        >
          清空
        </button>
      </div>
    </div>
  );
}
