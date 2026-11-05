export const MIN_JWT_SECRET_LENGTH = 32;

/** Returns the JWT secret or throws, so the app never boots with a weak/default secret. */
export function requireJwtSecret(value: string | undefined): string {
  if (!value || value.length < MIN_JWT_SECRET_LENGTH || value === 'dev-secret-change-me') {
    throw new Error(
      `JWT_SECRET must be set to a random string of at least ${MIN_JWT_SECRET_LENGTH} characters ` +
        `(generate one with: openssl rand -hex 32)`,
    );
  }
  return value;
}
