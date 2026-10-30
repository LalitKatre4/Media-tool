import { useRef, useState } from 'react';
import { SUPPORTED } from '../lib/commands';
import { getExt } from '../lib/time';

const ACCEPT = Object.keys(SUPPORTED).map((e) => `.${e}`).join(',');

export default function Uploader({ onFile, compact = false }) {
  const inputRef = useRef(null);
  const dragDepth = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  const accept = (file) => {
    if (!file) return;
    if (!SUPPORTED[getExt(file.name)]) {
      setError(`Unsupported file "${file.name}". Use MP4, WebM, MOV, MP3 or WAV.`);
      return;
    }
    setError('');
    onFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
        onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) setIsDragging(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed text-center transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          compact ? 'px-4 py-5' : 'px-6 py-16',
          isDragging
            ? 'scale-[1.01] border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
            : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-400 dark:hover:bg-slate-800/60',
        ].join(' ')}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
        </div>
        <div>
          <p className="font-medium">{compact ? 'Drop another file or click to replace' : 'Drop a video or audio file here'}</p>
          {!compact && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">or click to browse · MP4, WebM, MOV, MP3, WAV</p>}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Files never leave your device.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
