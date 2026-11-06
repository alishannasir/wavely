/** Grabs the current frame of a video element as a small JPEG data URL (for abuse reports). */
export function captureFrame(video: HTMLVideoElement | null, maxWidth = 480): string | undefined {
  if (!video || !video.videoWidth || !video.videoHeight) return undefined;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return undefined;
  }
}
