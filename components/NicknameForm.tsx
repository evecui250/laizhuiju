'use client';

import { useState } from 'react';

export default function NicknameForm({ initial, onSave, hint = '朋友们会看到你的昵称', button = '好啦' }: {
  initial: string; onSave: (n: string) => void; hint?: string; button?: string;
}) {
  const [value, setValue] = useState(initial);
  const ok = value.trim().length > 0 && value.trim().length <= 20;
  return (
    <form
      className="mt-10 space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (ok) onSave(value.trim()); }}
    >
      <label className="block text-mist">{hint}</label>
      <input
        className="w-full rounded-xl border border-line bg-plum px-4 py-3 outline-none placeholder:text-mist/50 focus:border-popcorn"
        value={value} maxLength={20} placeholder="比如：小崔" onChange={(e) => setValue(e.target.value)} autoFocus
      />
      <button className="w-full rounded-xl bg-popcorn px-5 py-3 font-semibold text-night disabled:opacity-40" disabled={!ok}>{button}</button>
    </form>
  );
}
