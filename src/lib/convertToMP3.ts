import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Converts audio to MP3 in the browser using ffmpeg.wasm.
 * The song never leaves the user's computer. The ~32 MB converter only
 * downloads the first time someone converts a song, then the browser caches it.
 * Its files are served from public/ffmpeg (see scripts/copy-ffmpeg.mjs).
 */

let ffmpegPromise: Promise<FFmpeg> | null = null;
let jobCount = 0;

function loadFFmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const base = window.location.origin;
    // Loaded at runtime instead of bundled, because bundlers don't handle
    // ffmpeg.wasm's background worker well.
    const libraryUrl = `${base}/ffmpeg/ffmpeg/index.js`;
    const { FFmpeg } = (await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ libraryUrl
    )) as typeof import("@ffmpeg/ffmpeg");

    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: `${base}/ffmpeg/core/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg/core/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  })().catch((error) => {
    ffmpegPromise = null; // allow a retry if loading failed
    throw error;
  });
  return ffmpegPromise;
}

/**
 * @param onProgress called with null while the converter loads, then 0 to 1 while converting
 */
export async function convertToMp3(
  input: Blob,
  onProgress?: (progress: number | null) => void,
): Promise<Blob> {
  onProgress?.(null);
  const ffmpeg = await loadFFmpeg();

  const id = ++jobCount;
  const inputName = `input-${id}`;
  const outputName = `output-${id}.mp3`;
  const handleProgress = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(Math.max(progress, 0), 1));

  ffmpeg.on("progress", handleProgress);
  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await input.arrayBuffer()));
    // -vn skips embedded album art; -q:a 2 is high-quality variable bitrate (~190 kbps)
    const exitCode = await ffmpeg.exec([
      "-i", inputName, "-vn", "-c:a", "libmp3lame", "-q:a", "2", outputName,
    ]);
    if (exitCode !== 0) throw new Error(`ffmpeg exited with code ${exitCode}`);

    const data = await ffmpeg.readFile(outputName);
    if (typeof data === "string") throw new Error("Unexpected text output from ffmpeg");
    return new Blob([new Uint8Array(data)], { type: "audio/mpeg" });
  } finally {
    ffmpeg.off("progress", handleProgress);
    await Promise.allSettled([ffmpeg.deleteFile(inputName), ffmpeg.deleteFile(outputName)]);
  }
}