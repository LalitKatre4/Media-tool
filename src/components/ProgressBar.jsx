export default function ProgressBar({ status, stage, progress, onCancel, isMultiThread }) {
  if (status !== 'loading' && status !== 'running') return null;
  const indeterminate = status === 'loading' || progress === 0;

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{stage || 'Working…'}</span>
        <span className="font-mono tabular-nums">{indeterminate ? '' : `${progress}%`}</span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : progress}>
        {indeterminate ? (
          <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-indigo-500/70" style={{ left: '33%' }} />
        ) : (
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{status === 'running' ? (isMultiThread ? 'Multi-threaded core' : 'Single-threaded core') : 'First load only'}</span>
        {status === 'running' && (
          <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
