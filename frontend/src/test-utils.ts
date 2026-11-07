/** A JWT-shaped token that expires `seconds` from now (not signed: the client never verifies it). */
export function fakeJwt(seconds = 3600): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + seconds })}.sig`;
}
