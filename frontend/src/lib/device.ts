const KEY = 'ovc-device-id';

/** Stable per-browser id sent with API calls and the socket handshake (used for device bans). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device-0000';
  }
}
