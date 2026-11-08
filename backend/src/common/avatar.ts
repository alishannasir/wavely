import { registerDecorator, ValidationOptions } from 'class-validator';

/** A profile photo is either a web address, or a small picture embedded in the value itself (what the app uploads). */
export const MAX_AVATAR_URL = 500;
export const MAX_AVATAR_DATA = 30_000; // about 22 KB of image: a 128 px JPEG is far below this
const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isAvatarValue(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  if (v.startsWith('data:')) return v.length <= MAX_AVATAR_DATA && DATA_IMAGE.test(v); // never svg: it can carry scripts
  if (v.length > MAX_AVATAR_URL) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function IsAvatar(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAvatar',
      target: object.constructor,
      propertyName,
      options: { message: 'Choose a JPEG, PNG or WebP picture (small), or an https link to one', ...options },
      validator: { validate: isAvatarValue },
    });
}
