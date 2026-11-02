'use client';

import { useEffect, useState } from 'react';
import {
  createRoom, ensureUser, getNickname, renameEverywhere, roomSummaries, saveNickname,
  type RoomSummary,
} from '../lib/api';
import Bar from '../components/Bar';
import NicknameForm from '../components/NicknameForm';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const roomHref = (id: string) => `${base}/room/?id=${id}`;

type Tab = 'discover' | 'mine' | 'joined';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'discover', label: '发现', icon: '🍿' },
  { id: 'mine', label: '我创建的', icon: '🎬' },
  { id: 'joined', label: '我加入的', icon: '👯' },
];
const tabFromHash = (): Tab => {
  const h = typeof location === 'undefined' ? '' : location.hash.slice(1);
  return h === 'mine' || h === 'joined' ? h : 'discover';
};

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [editingNick, setEditingNick] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>('discover');
  const [error, setError] = useState('');

  useEffect(() => {
    setNickname(getNickname());
    setTab(tabFromHash());
    const onHash = () => setTab(tabFromHash());
    addEventListener('hashchange', onHash);
    ensureUser()
      .then(async (id) => { setUserId(id); setRooms(await roomSummaries()); })
      .catch((e) => setError(String(e.message ?? e)));
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (error) return <Title><p className="mt-10 text-coral">连接失败：{error}</p></Title>;
  if (!userId || rooms === null) return <Title><p className="mt-10 text-mist">加载中…</p></Title>;

  if (!nickname || editingNick) {
    return (
      <Title>
        <NicknameForm
          initial={nickname}
          onSave={async (n) => {
            saveNickname(n);
            setNickname(n);
            setEditingNick(false);
            if (rooms.some((r) => r.my_status)) await renameEverywhere(userId, n).catch(() => {});
          }}
        />
      </Title>
    );
  }

  const mine = rooms.filter((r) => r.created_by === userId && r.my_status === 'member');
  const joined = rooms.filter((r) => r.created_by !== userId && r.my_status === 'member');

  return (
    <>
      <Title>
        <p className="mt-1 text-sm text-mist">
          嗨，{nickname}
          <button className="ml-2 underline decoration-dotted opacity-70" onClick={() => setEditingNick(true)}>改昵称</button>
        </p>
      </Title>

      {tab === 'discover' && <Discover rooms={rooms} me={userId} />}
      {tab === 'mine' && (
        <>
          <CreateRoom nickname={nickname} />
          <Section title="我创建的房间">
            <MyList rooms={mine} empty="还没有创建房间。" />
          </Section>
        </>
      )}
      {tab === 'joined' && (
        <Section title="我加入的房间">
          <MyList rooms={joined} empty="还没有加入别人的房间。让朋友把邀请链接发给你，或者在「发现」里找到房间，用邀请码加入。" />
        </Section>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 border-t border-line bg-night/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => {
            const count = t.id === 'mine' ? mine.length : t.id === 'joined' ? joined.length : 0;
            return (
              <a
                key={t.id}
                href={t.id === 'discover' ? '#' : `#${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center py-2.5 text-xs ${tab === t.id ? 'text-popcorn' : 'text-mist/70'}`}
              >
                <span className="text-xl leading-none" aria-hidden>{t.icon}</span>
                <span className="mt-1">{t.label}{count ? ` ${count}` : ''}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function Title({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-wide">
        来追剧呀 <span aria-hidden>🍿</span>
      </h1>
      {children}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold tracking-widest text-popcorn">{title}</h2>
      {children}
    </section>
  );
}

const inputCls = 'w-full rounded-xl border border-line bg-plum px-4 py-3 outline-none placeholder:text-mist/50 focus:border-popcorn';
const btnCls = 'rounded-xl bg-popcorn px-5 py-3 font-semibold text-night disabled:opacity-40 active:scale-[0.98]';

function MyList({ rooms, empty }: { rooms: RoomSummary[]; empty: string }) {
  if (rooms.length === 0) return <p className="text-sm text-mist">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rooms.map((r) => {
        const w = r.my_watched ?? [];
        const latest = w.length ? Math.max(...w) : 0;
        return (
          <li key={r.id}>
            <a href={roomHref(r.id)} className="block rounded-2xl bg-card p-4 active:scale-[0.99]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-lg font-semibold">{r.name}</span>
                <span className="shrink-0 text-sm text-mist">{r.member_count} 人 · 共 {r.episode_count} 集</span>
              </div>
              <Bar value={w.length} max={r.episode_count} />
              <p className="mt-1 text-xs text-mist">
                {w.length === r.episode_count ? '已全部看完 🎉' : latest ? `看到第 ${latest} 集 · 已看 ${w.length} 集` : '还没开始看'}
              </p>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function CreateRoom({ nickname }: { nickname: string }) {
  const [name, setName] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const n = parseInt(count, 10);
  const ok = name.trim().length > 0 && n >= 1 && n <= 500;

  return (
    <Section title="创建房间">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true); setErr('');
          try {
            const id = await createRoom(name, n, nickname);
            location.href = roomHref(id);
          } catch (e: any) {
            setErr(e.message ?? String(e)); setBusy(false);
          }
        }}
      >
        <input className={inputCls} value={name} maxLength={40} placeholder="房间名 / 剧名，比如：繁花" onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-3">
          <input className={inputCls} value={count} inputMode="numeric" placeholder="一共几集" onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
          <button className={btnCls + ' shrink-0'} disabled={!ok || busy}>{busy ? '创建中…' : '创建'}</button>
        </div>
        <p className="text-xs text-mist/70">创建后会生成邀请链接和 4 位邀请码，只有拿到的朋友才能加入。</p>
        {err && <p className="text-sm text-coral">{err}</p>}
      </form>
    </Section>
  );
}

function Discover({ rooms, me }: { rooms: RoomSummary[]; me: string }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = rooms.filter((r) => !q || r.name.toLowerCase().includes(q));

  return (
    <Section title="大家在追什么">
      <input className={inputCls} value={query} placeholder="搜索房间名" onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
      <ul className="mt-3 space-y-2">
        {shown.length === 0 && <li className="text-sm text-mist">{q ? '没找到这个房间' : '还没有人创建房间'}</li>}
        {shown.map((r) => (
          <li key={r.id}>
            <a href={roomHref(r.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 active:scale-[0.99]">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="text-xs text-mist">共 {r.episode_count} 集 · {r.member_count} 人在追</span>
              </span>
              <span className="shrink-0 text-sm text-popcorn">
                {r.my_status === 'member' ? '进入 →' : r.my_status === 'left' || r.created_by === me ? '回到房间 →' : '🔒 查看'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
