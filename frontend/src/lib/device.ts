const KEY = 'ovc-device-id';

/** crypto.randomUUID only exists in secure contexts; fall back to getRandomValues. */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let memoryId: string | null = null; // used for this page load when localStorage is unavailable

/**
 * Stable per-browser id sent with API calls and the socket handshake (used for device bans and the
 * guest quota). If storage is blocked (private mode), each page load gets its own random id: it
 * must never be a shared constant, or one ban would hit everyone with blocked storage.
 */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return (memoryId ??= newId());
  }
}

/** Test helper. */
export function _resetDeviceIdForTests(): void {
  memoryId = null;
}
