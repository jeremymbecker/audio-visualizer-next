/** An error with a message that's safe to show to the user. */
export class BackgroundImageError extends Error {}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"]; // no SVG: it can contain scripts
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DIMENSION = 2560; // plenty for a full-screen background

/**
 * Checks that a file is a real image, shrinks it to screen size, and saves a fresh
 * JPEG copy. Re-saving drops anything hidden in the original file, including
 * photo metadata like GPS location, and keeps stored backgrounds small.
 */
export async function prepareBackgroundImage(file: File): Promise<Blob> {
  // First filter: the type the browser reports, based on the file name.
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new BackgroundImageError("Please choose a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new BackgroundImageError("That image is over 25 MB. Please choose a smaller one.");
  }

  // The real check: the file has to actually decode as an image.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new BackgroundImageError("That file isn't a readable image.");
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new BackgroundImageError("Your browser couldn't process that image.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new BackgroundImageError("Your browser couldn't process that image.");
    return blob;
  } finally {
    bitmap.close();
  }
}