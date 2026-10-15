// Copies ffmpeg.wasm from node_modules into public/ffmpeg so the browser can load it.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, rmSync } from "node:fs";

rmSync("public/ffmpeg", { recursive: true, force: true });
cpSync("node_modules/@ffmpeg/ffmpeg/dist/esm", "public/ffmpeg/ffmpeg", { recursive: true });
cpSync("node_modules/@ffmpeg/core/dist/esm", "public/ffmpeg/core", { recursive: true });

console.log("Copied ffmpeg.wasm files to public/ffmpeg");