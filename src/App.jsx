import { useCallback, useEffect, useRef, useState } from 'react';
import { useFFmpeg } from './hooks/useFFmpeg';
import { buildJob, SUPPORTED } from './lib/commands';
import { getBaseName, getExt } from './lib/time';
import Uploader from './components/Uploader';
import VideoPreview from './components/VideoPreview';
import TrimmerControls from './components/TrimmerControls';
import OperationSelector from './components/OperationSelector';
import ProgressBar from './components/ProgressBar';
import DownloadCard from './components/DownloadCard';
import ThemeToggle from './components/ThemeToggle';

const LARGE_FILE = 1024 ** 3; // ~1 GB: Wasm memory gets tight beyond this

export default function App() {
  const ff = useFFmpeg();
  const mediaRef = useRef(null);

  const [file, setFile] = useState(null);
  const [srcUrl, setSrcUrl] = useState('');
  const [meta, setMeta] = useState({ duration: 0, width: 0, height: 0 });
  const [previewError, setPreviewError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [op, setOp] = useState('trim');
  const [preset, setPreset] = useState('medium');
  const [accurateTrim, setAccurateTrim] = useState(false);
  const [result, setResult] = useState(null);

  const kind = file ? SUPPORTED[getExt(file.name)].kind : null;
  const busy = ff.status === 'running';

  // One object URL per selected file; revoked on replace/unmount.
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setSrcUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const handleFile = (f) => {
    setFile(f);
    setResult(null);
    setPreviewError(false);
    setMeta({ duration: 0, width: 0, height: 0 });
    setTrim({ start: 0, end: 0 });
    setCurrentTime(0);
    const k = SUPPORTED[getExt(f.name)].kind;
    setOp((prev) => (prev === 'mp4' && k === 'audio' ? 'trim' : prev));
    ff.reset();
    ff.load().catch(() => {}); // warm up the ~31 MB core while the user picks options
  };

  const onLoadedMetadata = (e) => {
    const el = e.currentTarget;
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    setMeta({ duration, width: el.videoWidth || 0, height: el.videoHeight || 0 });
    setTrim({ start: 0, end: duration });
  };

  // Browser can't decode it (e.g. HEVC .mov in Chrome): read metadata with FFmpeg.
  const onPreviewError = async () => {
    if (!file) return;
    setPreviewError(true);
    try {
      const m = await ff.probe(file);
      setMeta(m);
      setTrim({ start: 0, end: m.duration });
    } catch { /* load error already surfaced by the hook */ }
  };

  const seek = useCallback((t) => {
    const el = mediaRef.current;
    if (el && Number.isFinite(t)) { el.currentTime = t; setCurrentTime(t); }
  }, []);

  // Live preview sync: keep playback inside [start, end], looping back to start.
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !meta.duration) return;
    let raf;
    const tick = () => {
      if (el.currentTime >= trim.end) { el.pause(); el.currentTime = trim.start; }
      setCurrentTime(el.currentTime);
      if (!el.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (el.currentTime < trim.start || el.currentTime >= trim.end - 0.05) el.currentTime = trim.start;
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener('play', onPlay);
    if (!el.paused) raf = requestAnimationFrame(tick);
    return () => { el.removeEventListener('play', onPlay); cancelAnimationFrame(raf); };
  }, [trim.start, trim.end, meta.duration, srcUrl]);

  const process = async () => {
    if (!file || !meta.duration) return;
    mediaRef.current?.pause();
    setResult(null);
    const job = buildJob({ op, kind, inputExt: getExt(file.name), duration: meta.duration, trim, preset, accurateTrim });
    const blob = await ff.run({ file, ...job });
    if (blob) setResult({ blob, name: `${getBaseName(file.name)}-${job.suffix}.${job.outputExt}` });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wasm Media Tool</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Trim, compress and convert in your browser. Nothing is uploaded.</p>
        </div>
        <ThemeToggle />
      </header>

      {!file ? (
        <Uploader onFile={handleFile} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <VideoPreview
              ref={mediaRef}
              src={srcUrl}
              file={file}
              kind={kind}
              meta={meta}
              previewError={previewError}
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onError={onPreviewError}
            />
            <TrimmerControls
              duration={meta.duration}
              start={trim.start}
              end={trim.end}
              currentTime={currentTime}
              onChange={setTrim}
              onSeek={seek}
              disabled={busy}
            />
          </div>

          <div className="space-y-6">
            <OperationSelector
              kind={kind} op={op} onOp={setOp}
              preset={preset} onPreset={setPreset}
              accurateTrim={accurateTrim} onAccurateTrim={setAccurateTrim}
              disabled={busy}
            />

            {file.size > LARGE_FILE && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                Large file: browsers cap WebAssembly memory near 2 GB, so very big files may fail. Trim first if you can.
              </p>
            )}

            <button
              type="button"
              onClick={process}
              disabled={busy || ff.status === 'loading' || !meta.duration}
              className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white shadow transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ff.status === 'loading' ? 'Loading FFmpeg…' : busy ? 'Processing…' : 'Process file'}
            </button>

            <ProgressBar status={ff.status} stage={ff.stage} progress={ff.progress} onCancel={ff.cancel} isMultiThread={ff.isMultiThread} />

            {ff.status === 'error' && (
              <div className="space-y-2 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
                <p className="font-medium">{ff.error}</p>
                {ff.logs.length > 0 && (
                  <details>
                    <summary className="cursor-pointer">FFmpeg log</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{ff.logs.slice(-40).join('\n')}</pre>
                  </details>
                )}
              </div>
            )}

            {result && (
              <DownloadCard blob={result.blob} fileName={result.name} originalSize={file.size} onReset={() => { setResult(null); ff.reset(); }} />
            )}

            <Uploader onFile={handleFile} compact />
          </div>
        </div>
      )}
    </div>
  );
}
