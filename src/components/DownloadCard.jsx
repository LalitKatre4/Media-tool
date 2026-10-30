import { useEffect, useState } from 'react';
import { formatBytes } from '../lib/time';

export default function DownloadCard({ blob, fileName, originalSize, onReset }) {
  const [url, setUrl] = useState('');

  // One object URL per result, revoked as soon as the card goes away.
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const delta = originalSize ? Math.round((1 - blob.size / originalSize) * 100) : 0;
  const isVideo = blob.type.startsWith('video/');

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">✓</div>
        <div className="min-w-0">
          <p className="truncate font-semibold" title={fileName}>{fileName}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {formatBytes(blob.size)}
            {originalSize > 0 && (
              <span className={delta >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>
                {' '}· {delta >= 0 ? `${delta}% smaller` : `${Math.abs(delta)}% larger`}
              </span>
            )}
          </p>
        </div>
      </div>

      {url && (isVideo
        ? <video src={url} controls className="max-h-64 w-full rounded-lg bg-black" />
        : <audio src={url} controls className="w-full" />)}

      <div className="flex flex-wrap gap-2">
        <a href={url} download={fileName}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white shadow hover:bg-emerald-700">
          Download Processed File
        </a>
        <button type="button" onClick={onReset}
          className="rounded-xl border border-slate-300 px-4 py-2.5 hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800">
          Process again
        </button>
      </div>
    </section>
  );
}
