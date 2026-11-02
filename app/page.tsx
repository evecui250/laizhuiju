'use client';

import { useEffect, useState } from 'react';
import {
  createRoom, ensureUser, getNickname, joinRoom, myRooms, renameEverywhere,
  saveNickname, searchRooms, type MyRoom, type Room,
} from '../lib/api';
import Bar from '../components/Bar';

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const roomHref = (id: string) => `${base}/room/?id=${id}`;

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [editingNick, setEditingNick] = useState(false);
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setNickname(getNickname());
    ensureUser()
      .then(async (id) => { setUserId(id); setRooms(await myRooms(id)); })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  if (error) return <Shell><p className="mt-10 text-coral">连接失败：{error}</p></Shell>;
  if (!userId || rooms === null) return <Shell><p className="mt-10 text-mist">加载中…</p></Shell>;

  if (!nickname || editingNick) {
    return (
      <Shell>
        <NicknameForm
          initial={nickname}
          onSave={async (n) => {
            saveNickname(n);
            setNickname(n);
            setEditingNick(false);
            if (rooms.length) await renameEverywhere(userId, n).catch(() => {});
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mt-1 text-sm text-mist">
        嗨，{nickname}
        <button className="ml-2 underline decoration-dotted opacity-70" onClick={() => setEditingNick(true)}>改昵称</button>
      </p>

      <Section title="我的房间">
        {rooms.length === 0 ? (
          <p className="text-sm text-mist">还没有房间。创建一个，或者搜朋友的房间加入吧。</p>
        ) : (
          <ul className="space-y-3">
            {rooms.map((r) => {
              const latest = r.watched.length ? Math.max(...r.watched) : 0;
              return (
                <li key={r.id}>
                  <a href={roomHref(r.id)} className="block rounded-2xl bg-card p-4 active:scale-[0.99]">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-semibold">{r.name}</span>
                      <span className="text-sm text-mist">共 {r.episode_count} 集</span>
                    </div>
                    <Bar value={r.watched.length} max={r.episode_count} />
                    <p className="mt-1 text-xs text-mist">
                      {latest ? `看到第 ${latest} 集 · 已看 ${r.watched.length} 集` : '还没开始看'}
                    </p>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <CreateRoom nickname={nickname} />
      <FindRoom nickname={nickname} myRoomIds={new Set(rooms.map((r) => r.id))} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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

function NicknameForm({ initial, onSave }: { initial: string; onSave: (n: string) => void }) {
  const [value, setValue] = useState(initial);
  const ok = value.trim().length > 0 && value.trim().length <= 20;
  return (
    <form
      className="mt-10 space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (ok) onSave(value.trim()); }}
    >
      <label className="block text-mist">朋友们会看到你的昵称</label>
      <input className={inputCls} value={value} maxLength={20} placeholder="比如：小崔" onChange={(e) => setValue(e.target.value)} autoFocus />
      <button className={btnCls + ' w-full'} disabled={!ok}>好啦</button>
    </form>
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
            const room = await createRoom(name, n, nickname);
            location.href = roomHref(room.id);
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
        {err && <p className="text-sm text-coral">{err}</p>}
      </form>
    </Section>
  );
}

function FindRoom({ nickname, myRoomIds }: { nickname: string; myRoomIds: Set<string> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Room[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [err, setErr] = useState('');

  return (
    <Section title="找朋友的房间">
      <form
        className="flex gap-3"
        onSubmit={async (e) => {
          e.preventDefault(); setErr('');
          try { setResults(await searchRooms(query)); } catch (e: any) { setErr(e.message ?? String(e)); }
        }}
      >
        <input className={inputCls} value={query} placeholder="输入房间名" onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
        <button className={btnCls + ' shrink-0'} disabled={!query.trim()}>搜索</button>
      </form>
      {err && <p className="mt-2 text-sm text-coral">{err}</p>}
      {results && (
        <ul className="mt-3 space-y-2">
          {results.length === 0 && <li className="text-sm text-mist">没找到，确认一下房间名？</li>}
          {results.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
              <span>
                <span className="font-semibold">{r.name}</span>
                <span className="ml-2 text-sm text-mist">共 {r.episode_count} 集</span>
              </span>
              {myRoomIds.has(r.id) ? (
                <a href={roomHref(r.id)} className="text-sm text-popcorn">进入 →</a>
              ) : (
                <button
                  className="rounded-lg bg-popcorn px-3 py-1.5 text-sm font-semibold text-night disabled:opacity-40"
                  disabled={busyId === r.id}
                  onClick={async () => {
                    setBusyId(r.id);
                    try { await joinRoom(r.id, nickname); location.href = roomHref(r.id); }
                    catch (e: any) { setErr(e.message ?? String(e)); setBusyId(''); }
                  }}
                >
                  加入
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
