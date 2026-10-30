import { OPERATIONS, PRESETS } from '../lib/commands';

export default function OperationSelector({ kind, op, onOp, preset, onPreset, accurateTrim, onAccurateTrim, disabled }) {
  const ops = OPERATIONS.filter((o) => o.kinds.includes(kind));

  return (
    <section className={`space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <h2 className="font-semibold">Operation</h2>

      <div className="grid gap-2 sm:grid-cols-2">
        {ops.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onOp(o.id)}
            className={`rounded-xl border p-3 text-left transition ${
              op === o.id
                ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:bg-indigo-500/10'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
            }`}
          >
            <div className="font-medium">{o.label}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{o.desc}</div>
          </button>
        ))}
      </div>

      {op === 'compress' && (
        <div className="space-y-2">
          <div className="text-sm text-slate-500 dark:text-slate-400">Compression level</div>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {Object.entries(PRESETS).map(([id, p]) => (
              <button key={id} type="button" onClick={() => onPreset(id)}
                className={`rounded-lg px-4 py-1.5 text-sm transition ${preset === id ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-500 dark:text-slate-400'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {PRESETS[preset].hint} · {kind === 'video' ? `CRF ${PRESETS[preset].crf}, ` : ''}audio {PRESETS[preset].audioBitrate}
          </p>
        </div>
      )}

      {op === 'trim' && kind === 'video' && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={accurateTrim} onChange={(e) => onAccurateTrim(e.target.checked)} className="mt-0.5 accent-indigo-600" />
          <span>
            Frame-accurate cut <span className="text-slate-500 dark:text-slate-400">(re-encodes to MP4, slower. Off = instant stream copy that snaps to the nearest keyframe.)</span>
          </span>
        </label>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">The trim range above applies to every operation.</p>
    </section>
  );
}
