export default function Bar({ value, max, color = 'bg-popcorn' }: { value: number; max: number; color?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
