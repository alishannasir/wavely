/** Largest side of the stored picture, in pixels. Small on purpose: it travels with the profile. */
export const AVATAR_SIZE = 128;

/** Crops the picture to a centred square and shrinks it to a small JPEG (as a data URL). Throws if it is not an image. */
export async function resizeToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a picture.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That picture is too large. Choose one under 15 MB.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That picture could not be read. Try a JPEG or PNG.');
  });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot resize pictures.');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap.close();
  }
}
