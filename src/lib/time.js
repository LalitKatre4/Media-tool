/** 83.5 -> "00:01:23.500" */
export function formatTime(seconds = 0, withMs = true) {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000) % 1000;
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const base = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return withMs ? `${base}.${pad(ms, 3)}` : base;
}

/** Accepts "ss", "mm:ss", "hh:mm:ss" with optional ".ms". Returns seconds or null. */
export function parseTime(input) {
  const str = String(input).trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(str)) return null;
  const parts = str.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** "Duration: 00:01:23.45" / "time=00:00:05.12" -> seconds */
export function parseFFmpegTimestamp(str) {
  const m = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(str);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

export const getExt = (name = '') => name.split('.').pop().toLowerCase();
export const getBaseName = (name = '') => name.replace(/\.[^.]+$/, '');
