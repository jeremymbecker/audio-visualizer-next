/**
 * Picks a few vivid colors from an image, ordered dark to light,
 * for use as the visualizer's bar gradient.
 */
export async function extractPalette(url: string, count = 5): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  // The extra query keeps the browser from reusing the copy it loaded for the
  // CSS background, which was fetched without permission to read its pixels.
  img.src = `${url}${url.includes("?") ? "&" : "?"}palette=1`;
  await img.decode();

  // A small copy is plenty for finding the main colors, and much faster.
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas isn't supported");
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size); // fails if the image host doesn't allow CORS

  // Group similar colors together and score each group, favoring colorful pixels.
  type Bucket = { r: number; g: number; b: number; count: number; score: number };
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [, s, l] = rgbToHsl(r, g, b);
    if (l < 0.08 || l > 0.95) continue; // skip near-black and near-white
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, score: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.score += 0.3 + s;
    buckets.set(key, bucket);
  }

  // Take the highest-scoring colors, skipping ones too close to a color already chosen.
  const picked: [number, number, number][] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.score - a.score)) {
    const color: [number, number, number] = [
      bucket.r / bucket.count,
      bucket.g / bucket.count,
      bucket.b / bucket.count,
    ];
    if (picked.every((p) => Math.hypot(p[0] - color[0], p[1] - color[1], p[2] - color[2]) > 60)) {
      picked.push(color);
    }
    if (picked.length === count) break;
  }
  if (picked.length < 2) throw new Error("Not enough distinct colors in the image");

  return picked
    .map(([r, g, b]) => rgbToHsl(r, g, b))
    .sort((a, b) => a[2] - b[2]) // darkest at the bottom of the bars, lightest at the top
    .map(([h, s, l]) => {
      // Boost color and keep brightness in a visible range so the bars stand out.
      const saturation = Math.min(1, s * 1.3 + 0.1);
      const lightness = Math.min(0.7, Math.max(0.45, l));
      return `hsl(${Math.round(h * 360)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`;
    });
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}