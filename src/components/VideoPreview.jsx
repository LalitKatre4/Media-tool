import { forwardRef } from 'react';
import { formatBytes, formatTime, getExt } from '../lib/time';

const Chip = ({ label, value }) => (
  <div className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
    <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
    <div className="font-mono text-sm">{value}</div>
  </div>
);

/**
 * HTML5 player + metadata. The parent owns the media element via ref
 * so the trimmer can seek it and enforce the selected range.
 */
const VideoPreview = forwardRef(function VideoPreview(
  { src, file, kind, meta, previewError, onLoadedMetadata, onTimeUpdate, onError },
  ref,
) {
  const shared = {
    ref,
    src,
    controls: true,
    preload: 'metadata',
    onLoadedMetadata,
    onTimeUpdate,
    onSeeked: onTimeUpdate,
    onError,
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="bg-black">
        {previewError ? (
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-slate-300">
            This browser can't preview this codec, but it can still be processed.
            <br />Metadata was read with FFmpeg instead.
          </div>
        ) : kind === 'video' ? (
          <video {...shared} playsInline className="mx-auto max-h-[60vh] w-full" />
        ) : (
          <div className="flex flex-col items-center gap-4 p-8">
            <div className="text-5xl">🎵</div>
            <audio {...shared} className="w-full" />
          </div>
        )}
      </div>

      <div className="space-y-3 p-4">
        <p className="truncate font-medium" title={file.name}>{file.name}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Chip label="Size" value={formatBytes(file.size)} />
          <Chip label="Duration" value={meta.duration ? formatTime(meta.duration, false) : '—'} />
          <Chip label="Resolution" value={kind === 'video' && meta.width ? `${meta.width}×${meta.height}` : kind === 'audio' ? 'Audio' : '—'} />
          <Chip label="Format" value={getExt(file.name).toUpperCase()} />
        </div>
      </div>
    </section>
  );
});

export default VideoPreview;
