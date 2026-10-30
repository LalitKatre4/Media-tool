import { useEffect, useState } from 'react';
import { formatTime, parseTime } from '../lib/time';

const MIN_GAP = 0.1; // seconds

// Two stacked native range inputs. The track ignores pointer events so only
// the thumbs are draggable; each thumb gets pointer events back.
const thumb = [
  'pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent',
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5',
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-indigo-500 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md',
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-grab',
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-indigo-500 [&::-moz-range-thumb]:bg-white',
  '[&::-moz-range-track]:bg-transparent',
].join(' ');

function TimeInput({ label, value, min, max, onCommit }) {
  const [draft, setDraft] = useState(formatTime(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => { setDraft(formatTime(value)); setInvalid(false); }, [value]);

  const commit = () => {
    const t = parseTime(draft);
    if (t === null || t < min || t > max) { setInvalid(true); return; }
    onCommit(t);
  };

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder="hh:mm:ss"
        className={`w-36 rounded-lg border bg-white px-3 py-2 font-mono dark:bg-slate-950 ${
          invalid ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'
        } focus:outline-none focus:ring-2 focus:ring-indigo-500`}
      />
    </label>
  );
}

export default function TrimmerControls({ duration, start, end, currentTime, onChange, onSeek, disabled }) {
  if (!duration) return null;
  const pct = (t) => `${(t / duration) * 100}%`;
  const step = duration > 600 ? 0.5 : 0.01;

  const setStart = (v) => { const s = Math.min(Math.max(0, v), end - MIN_GAP); onChange({ start: s, end }); onSeek(s); };
  const setEnd = (v) => { const e = Math.max(Math.min(duration, v), start + MIN_GAP); onChange({ start, end: e }); onSeek(e); };

  // Click anywhere on the track to move the playhead.
  const onTrackClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * duration);
  };

  return (
    <section className={`space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Trim range</h2>
        <span className="rounded-full bg-indigo-100 px-3 py-1 font-mono text-xs text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          Clip length {formatTime(end - start)}
        </span>
      </div>

      <div className="relative h-8 select-none">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700" onClick={onTrackClick} />
        <div className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-indigo-500" style={{ left: pct(start), width: pct(end - start) }} />
        <div className="pointer-events-none absolute top-0 h-8 w-0.5 -translate-x-1/2 bg-amber-400" style={{ left: pct(Math.min(currentTime, duration)) }} />
        <input type="range" aria-label="Start time" min={0} max={duration} step={step} value={start}
          onChange={(e) => setStart(Number(e.target.value))} className={`${thumb} z-20`} />
        <input type="range" aria-label="End time" min={0} max={duration} step={step} value={end}
          onChange={(e) => setEnd(Number(e.target.value))} className={`${thumb} ${start > duration - 1 ? 'z-10' : 'z-30'}`} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <TimeInput label="Start" value={start} min={0} max={end - MIN_GAP} onCommit={setStart} />
        <TimeInput label="End" value={end} min={start + MIN_GAP} max={duration} onCommit={setEnd} />
        <div className="flex gap-2">
          <button type="button" onClick={() => setStart(currentTime)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            Start at playhead
          </button>
          <button type="button" onClick={() => setEnd(currentTime)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
            End at playhead
          </button>
          <button type="button" onClick={() => onChange({ start: 0, end: duration })} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white">
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
