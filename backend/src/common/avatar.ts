import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * A profile photo is a small picture embedded in the value itself (what the app uploads). Web addresses are refused:
 * a link to someone's own server would tell them the IP address of everyone who looks at the profile.
 */
export const MAX_AVATAR_DATA = 30_000; // about 22 KB of image: a 128 px JPEG is far below this
const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isAvatarValue(v: unknown): boolean {
  // never svg: it can carry scripts
  return typeof v === 'string' && v.length <= MAX_AVATAR_DATA && DATA_IMAGE.test(v);
}

export function IsAvatar(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAvatar',
      target: object.constructor,
      propertyName,
      options: { message: 'Choose a small JPEG, PNG or WebP picture', ...options },
      validator: { validate: isAvatarValue },
    });
}
