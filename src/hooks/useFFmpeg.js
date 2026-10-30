import { useCallback, useEffect, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { formatTime, getExt, parseFFmpegTimestamp } from '../lib/time';

/**
 * FFmpeg.wasm 0.12 runs every command inside its own Web Worker,
 * so exec() never blocks the main thread. This hook owns that single instance.
 *
 * ROOT CAUSE OF THE "STUCK ON PROCESSING" BUG
 * The multi-threaded core (@ffmpeg/core-mt) pre-spawns a fixed pool of 32 pthread
 * workers. Any command that DECODES or ENCODES (libx264, aac, libmp3lame, filters)
 * makes FFmpeg size its thread count from navigator.hardwareConcurrency
 * (x264 threads + lookahead, decoder frame threads, filter threads...). Once that
 * exceeds the pool, Emscripten must start a new Worker, which can only happen when the
 * calling thread yields. exec() never yields, so it deadlocks: no error, no exit
 * code, no more log lines. Trim worked because `-c copy` never decodes, so it
 * starts no threads.
 *
 * FIX: the single-threaded core is the default (verified: compress, MP4 and MP3 all
 * complete). The MT core is opt-in via VITE_FFMPEG_MT=true. When it is enabled, every
 * command is capped with `-threads` so it stays inside the pool. A stall watchdog
 * also guarantees the UI can never hang in "Processing" again.
 */
const USE_MULTI_THREAD = import.meta.env.VITE_FFMPEG_MT === 'true'; // temporary: forced off by default
const MT_THREAD_CAP = '4';
const STALL_TIMEOUT_MS = 60_000; // no FFmpeg output for this long = treat as hung
const REQUIRED_ENCODERS = ['libx264', 'aac', 'libmp3lame'];

const CORE_VERSION = '0.12.10';
const CDN = 'https://unpkg.com/@ffmpeg';
const MT_BASE = `${CDN}/core-mt@${CORE_VERSION}/dist/esm`;
const ST_BASE = `${CDN}/core@${CORE_VERSION}/dist/esm`;

// Diagnostics: stages, commands, exit codes and errors are always logged.
// The raw FFmpeg output is logged in dev, or when localStorage['ffmpeg-debug'] = '1'.
const VERBOSE = import.meta.env.DEV || (typeof localStorage !== 'undefined' && localStorage.getItem('ffmpeg-debug') === '1');
const diag = (...a) => console.info('%c[ffmpeg]', 'color:#6366f1;font-weight:bold', ...a);
const diagErr = (...a) => console.error('[ffmpeg]', ...a);

class StallError extends Error {}

export function useFFmpeg() {
  const ffmpegRef = useRef(null);
  const loadPromiseRef = useRef(null);
  const expectedDurationRef = useRef(0);
  const cancelledRef = useRef(false);
  const logTapRef = useRef(null); // temporary log listener used by probe() and the encoder check
  const logsRef = useRef([]); // latest log lines, readable inside async callbacks
  const lastActivityRef = useRef(0); // last time FFmpeg printed anything (watchdog)
  const stageRef = useRef('');
  const mtRef = useRef(false); // which core is loaded

  // idle | loading | ready | running | done | error
  const [status, setStatus] = useState('idle');
  const [stage, setStageState] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [isMultiThread, setIsMultiThread] = useState(false);
  const [logs, setLogs] = useState([]);

  const setStage = (s) => {
    if (s && s !== stageRef.current) diag('stage:', s);
    stageRef.current = s;
    setStageState(s);
  };

  const attachListeners = (ffmpeg) => {
    ffmpeg.on('log', ({ type, message }) => {
      lastActivityRef.current = Date.now();
      logTapRef.current?.(message);
      logsRef.current.push(message);
      if (logsRef.current.length > 400) logsRef.current.splice(0, logsRef.current.length - 400);
      if (VERBOSE) console.debug(`[ffmpeg:${type}]`, message);

      // Real encoding progress: FFmpeg's stats line "frame=.. time=00:00:05.12 .. speed=1.3x"
      // reports the OUTPUT timestamp, which we compare with the expected (trimmed) length.
      const t = /time=\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(message);
      const total = expectedDurationRef.current;
      if (t && total > 0) {
        const done = parseFFmpegTimestamp(t[1]);
        const pct = Math.min(99, Math.round((done / total) * 100));
        setProgress((prev) => Math.max(prev, pct));
        const speed = /speed=\s*([\d.]+x)/.exec(message)?.[1];
        setStageState(`Encoding ${formatTime(Math.min(done, total), false)} / ${formatTime(total, false)}${speed ? ` · ${speed}` : ''}`);
      }
    });

    // Fallback only when we don't know the output length. The built-in ratio is
    // measured against the full input, so it is wrong for trimmed jobs.
    ffmpeg.on('progress', ({ progress: ratio }) => {
      lastActivityRef.current = Date.now();
      if (expectedDurationRef.current > 0) return;
      if (ratio >= 0 && ratio <= 1) setProgress((prev) => Math.max(prev, Math.round(ratio * 99)));
    });
  };

  /** Runs `ffmpeg -encoders` once and fails loudly if a required encoder is missing. */
  const checkEncoders = async (ffmpeg) => {
    const lines = [];
    logTapRef.current = (m) => lines.push(m);
    try { await ffmpeg.exec(['-hide_banner', '-encoders']); } finally { logTapRef.current = null; }
    const text = lines.join('\n');
    const missing = REQUIRED_ENCODERS.filter((e) => !new RegExp(`\\s${e}\\s`).test(text));
    diag('encoders:', REQUIRED_ENCODERS.map((e) => `${e}=${missing.includes(e) ? 'MISSING' : 'ok'}`).join(' '));
    if (missing.length) throw new Error(`FFmpeg core is missing encoders: ${missing.join(', ')}`);
  };

  /** Loads the FFmpeg core once; concurrent callers share the same promise. */
  const load = useCallback(async () => {
    if (ffmpegRef.current?.loaded) return ffmpegRef.current;
    if (loadPromiseRef.current) return loadPromiseRef.current;

    loadPromiseRef.current = (async () => {
      const t0 = performance.now();
      setStatus('loading');
      setStage('Downloading FFmpeg core (~31 MB, cached after first visit)');
      setError(null);

      const isolated = typeof SharedArrayBuffer !== 'undefined' && window.crossOriginIsolated;
      const mt = USE_MULTI_THREAD && isolated;
      const base = mt ? MT_BASE : ST_BASE;
      diag('loading core', {
        variant: mt ? 'core-mt' : 'core (single-thread)',
        forcedSingleThread: !USE_MULTI_THREAD,
        crossOriginIsolated: window.crossOriginIsolated,
        hardwareConcurrency: navigator.hardwareConcurrency,
        base,
      });

      const ffmpeg = new FFmpeg();
      attachListeners(ffmpeg);

      // toBlobURL fetches cross-origin files and serves them same-origin as blob:,
      // which keeps COEP happy and avoids worker-origin errors.
      const config = {
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      };
      if (mt) config.workerURL = await toBlobURL(`${base}/ffmpeg-core.worker.js`, 'text/javascript');
      diag(`core files fetched in ${Math.round(performance.now() - t0)} ms`);

      setStage('Initialising WebAssembly');
      await ffmpeg.load(config);
      diag(`worker + wasm initialised in ${Math.round(performance.now() - t0)} ms`);

      await checkEncoders(ffmpeg);

      ffmpegRef.current = ffmpeg;
      mtRef.current = mt;
      setIsMultiThread(mt);
      setStatus('ready');
      setStage('');
      return ffmpeg;
    })().catch((err) => {
      diagErr('load failed:', err);
      loadPromiseRef.current = null; // allow a retry
      setError(`Could not load FFmpeg: ${err?.message ?? err}`);
      setStatus('error');
      throw err;
    });

    return loadPromiseRef.current;
  }, []);

  const safeDelete = async (ffmpeg, name) => {
    try { await ffmpeg.deleteFile(name); } catch { /* not created or instance gone */ }
  };

  /** Throws away the worker; the next load() starts a fresh one. */
  const killInstance = () => {
    try { ffmpegRef.current?.terminate(); } catch { /* already gone */ }
    ffmpegRef.current = null;
    loadPromiseRef.current = null;
  };

  /**
   * exec() with a watchdog. If FFmpeg prints nothing for STALL_TIMEOUT_MS (deadlock,
   * crashed worker, OOM that never reports back) the worker is terminated, which
   * rejects the pending exec() so the caller's catch/finally always runs.
   */
  const execGuarded = async (ffmpeg, args) => {
    // MT core only: cap decoder (before -i) and encoder (before output) threads to stay inside the pool.
    const finalArgs = mtRef.current
      ? ['-threads', MT_THREAD_CAP, '-filter_threads', '1', ...args.slice(0, -1), '-threads', MT_THREAD_CAP, args[args.length - 1]]
      : args;
    diag('exec:', `ffmpeg ${finalArgs.join(' ')}`);
    const t0 = performance.now();
    lastActivityRef.current = Date.now();
    let stalled = false;
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > STALL_TIMEOUT_MS) {
        stalled = true;
        diagErr(`no output for ${STALL_TIMEOUT_MS / 1000}s, terminating worker`);
        killInstance();
      }
    }, 2000);
    try {
      const code = await ffmpeg.exec(finalArgs);
      diag(`exit code ${code} after ${Math.round(performance.now() - t0)} ms`);
      return code;
    } catch (err) {
      if (stalled) throw new StallError(`FFmpeg stopped responding (no output for ${STALL_TIMEOUT_MS / 1000}s) and was restarted.`);
      throw err;
    } finally {
      clearInterval(timer);
    }
  };

  /**
   * Runs one job. Returns a Blob, or null if it failed/was cancelled.
   * Status ALWAYS leaves 'running' (done | error | idle), whatever happens.
   * @param {{ file: File, buildArgs: Function, outputExt: string, mimeType: string, expectedDuration: number }} job
   */
  const run = useCallback(async ({ file, buildArgs, outputExt, mimeType, expectedDuration }) => {
    let ffmpeg;
    try { ffmpeg = await load(); } catch { return null; }

    const id = Date.now().toString(36);
    const inputName = `in-${id}.${getExt(file.name)}`;
    const outputName = `out-${id}.${outputExt}`;
    let finalStatus = 'error';

    cancelledRef.current = false;
    expectedDurationRef.current = expectedDuration || 0;
    logsRef.current = [];
    setLogs([]);
    setError(null);
    setProgress(0);
    setStatus('running');
    diag('job start', { input: file.name, size: file.size, outputExt, expectedDuration });

    try {
      setStage('Copying file into Wasm memory');
      await ffmpeg.writeFile(inputName, await fetchFile(file));

      setStage('Processing');
      const exitCode = await execGuarded(ffmpeg, buildArgs(inputName, outputName));
      if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}`);

      setStage('Reading output');
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: mimeType });
      if (!blob.size) throw new Error('FFmpeg produced an empty file');
      diag('job done', { outputBytes: blob.size });

      setProgress(100);
      setStage('Done');
      finalStatus = 'done';
      return blob;
    } catch (err) {
      if (cancelledRef.current) {
        diag('job cancelled');
        setStage('Cancelled');
        setProgress(0);
        finalStatus = 'idle';
      } else {
        diagErr('job failed:', err, '\nlast FFmpeg lines:\n' + logsRef.current.slice(-15).join('\n'));
        setError(friendlyError(err, logsRef.current));
      }
      return null;
    } finally {
      // Free Wasm heap right away; large files otherwise linger in MEMFS.
      if (ffmpegRef.current === ffmpeg) {
        await safeDelete(ffmpeg, inputName);
        await safeDelete(ffmpeg, outputName);
      }
      expectedDurationRef.current = 0;
      setLogs([...logsRef.current]); // publish logs once, not per line (avoids re-render storms)
      setStatus(finalStatus);
    }
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fallback metadata reader for files the <video> element can't decode
   * (e.g. HEVC .mov in Chrome). Runs `ffmpeg -i` and parses its banner.
   */
  const probe = useCallback(async (file) => {
    const ffmpeg = await load();
    const name = `probe-${Date.now().toString(36)}.${getExt(file.name)}`;
    const lines = [];
    logTapRef.current = (m) => lines.push(m);
    try {
      await ffmpeg.writeFile(name, await fetchFile(file));
      await execGuarded(ffmpeg, ['-hide_banner', '-i', name]); // exits non-zero by design (no output)
    } finally {
      logTapRef.current = null;
      if (ffmpegRef.current === ffmpeg) await safeDelete(ffmpeg, name);
      setStatus('ready');
    }
    const text = lines.join('\n');
    const dur = /Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(text);
    const res = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(text);
    const meta = {
      duration: dur ? parseFFmpegTimestamp(dur[1]) : 0,
      width: res ? Number(res[1]) : 0,
      height: res ? Number(res[2]) : 0,
      hasAudio: /Audio:/.test(text),
    };
    diag('probe', meta);
    return meta;
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Kills the worker mid-job. The pending exec() rejects, run() lands in 'idle'. */
  const cancel = useCallback(() => {
    if (!ffmpegRef.current) return;
    diag('cancel requested');
    cancelledRef.current = true;
    killInstance();
  }, []);

  const reset = useCallback(() => {
    setProgress(0);
    setStage('');
    setError(null);
    setStatus(ffmpegRef.current?.loaded ? 'ready' : 'idle');
  }, []);

  useEffect(() => () => ffmpegRef.current?.terminate(), []);

  return { load, run, probe, cancel, reset, status, stage, progress, error, logs, isMultiThread };
}

function friendlyError(err, logs) {
  if (err instanceof StallError) return err.message;
  const msg = err?.message ?? String(err);
  const tail = logs.slice(-8).join(' ');
  if (/does not contain any stream|matches no streams/i.test(tail)) return 'This file has no audio track to extract.';
  if (/Unknown encoder|Encoder not found/i.test(tail)) return 'This FFmpeg build is missing a required encoder.';
  if (/memory|OOM|Aborted/i.test(msg + tail)) return 'Ran out of browser memory. Try a shorter clip or a smaller file (under ~1 GB).';
  return msg;
}
