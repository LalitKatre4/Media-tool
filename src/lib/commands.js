/**
 * Pure functions that turn UI choices into FFmpeg argument arrays.
 * Arguments are passed as an array (no shell), so filter commas are escaped with "\,".
 */

export const SUPPORTED = {
  mp4: { mime: 'video/mp4', kind: 'video' },
  webm: { mime: 'video/webm', kind: 'video' },
  mov: { mime: 'video/quicktime', kind: 'video' },
  mp3: { mime: 'audio/mpeg', kind: 'audio' },
  wav: { mime: 'audio/wav', kind: 'audio' },
};

export const MIME = { ...Object.fromEntries(Object.entries(SUPPORTED).map(([k, v]) => [k, v.mime])) };

export const OPERATIONS = [
  { id: 'trim', label: 'Trim', desc: 'Cut a clip, keeps the original format', kinds: ['video', 'audio'] },
  { id: 'compress', label: 'Compress', desc: 'Smaller file via CRF / bitrate', kinds: ['video', 'audio'] },
  { id: 'mp4', label: 'Convert to MP4', desc: 'H.264 video + AAC audio', kinds: ['video'] },
  { id: 'mp3', label: 'Extract MP3', desc: 'Audio only, LAME VBR', kinds: ['video', 'audio'] },
];

// "Low compression" = best quality. CRF: lower = better quality, bigger file.
export const PRESETS = {
  low: { label: 'Low', crf: 23, audioBitrate: '192k', hint: 'Near-original quality' },
  medium: { label: 'Medium', crf: 28, audioBitrate: '128k', hint: 'Balanced size & quality' },
  high: { label: 'High', crf: 33, audioBitrate: '64k', maxHeight: 720, hint: 'Smallest, capped at 720p' },
};

const EVEN_DIMENSIONS = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'; // yuv420p needs even width/height
const capHeight = (h) => `scale=-2:trunc(min(${h}\\,ih)/2)*2`;

const H264 = (crf) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
const AAC = (br) => ['-c:a', 'aac', '-b:a', br];
const FASTSTART = ['-movflags', '+faststart'];

/**
 * @returns {{ buildArgs:(inName:string,outName:string)=>string[], outputExt:string, mimeType:string, expectedDuration:number, suffix:string }}
 */
export function buildJob({ op, kind, inputExt, duration, trim, preset = 'medium', accurateTrim = false }) {
  const isTrimmed = trim && (trim.start > 0.01 || trim.end < duration - 0.01);
  const start = isTrimmed ? trim.start : 0;
  const end = isTrimmed ? trim.end : duration;
  const expectedDuration = Math.max(0, end - start);

  // Input seeking (-ss before -i) is fast; -t limits output length.
  const seekIn = isTrimmed ? ['-ss', start.toFixed(3)] : [];
  const limitOut = isTrimmed ? ['-t', expectedDuration.toFixed(3)] : [];
  const wrap = (body) => (inName, outName) => ['-hide_banner', ...seekIn, '-i', inName, ...limitOut, ...body, '-y', outName];

  switch (op) {
    case 'trim': {
      if (kind === 'video' && accurateTrim) {
        // Re-encode for frame-exact cuts (stream copy snaps to keyframes).
        return {
          buildArgs: wrap([...H264(20), '-vf', EVEN_DIMENSIONS, ...AAC('192k'), ...FASTSTART]),
          outputExt: 'mp4', mimeType: MIME.mp4, expectedDuration, suffix: 'trim',
        };
      }
      return {
        buildArgs: wrap(['-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero']),
        outputExt: inputExt, mimeType: MIME[inputExt], expectedDuration, suffix: 'trim',
      };
    }

    case 'compress': {
      const p = PRESETS[preset];
      if (kind === 'audio') {
        return {
          buildArgs: wrap(['-vn', '-c:a', 'libmp3lame', '-b:a', p.audioBitrate]),
          outputExt: 'mp3', mimeType: MIME.mp3, expectedDuration, suffix: `compressed-${preset}`,
        };
      }
      return {
        buildArgs: wrap([
          ...H264(p.crf), '-vf', p.maxHeight ? capHeight(p.maxHeight) : EVEN_DIMENSIONS,
          ...AAC(p.audioBitrate), ...FASTSTART,
        ]),
        outputExt: 'mp4', mimeType: MIME.mp4, expectedDuration, suffix: `compressed-${preset}`,
      };
    }

    case 'mp4':
      return {
        buildArgs: wrap([...H264(23), '-vf', EVEN_DIMENSIONS, ...AAC('160k'), ...FASTSTART]),
        outputExt: 'mp4', mimeType: MIME.mp4, expectedDuration, suffix: 'h264',
      };

    case 'mp3':
      return {
        buildArgs: wrap(['-vn', '-map', '0:a:0', '-c:a', 'libmp3lame', '-q:a', '2']),
        outputExt: 'mp3', mimeType: MIME.mp3, expectedDuration, suffix: 'audio',
      };

    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}
