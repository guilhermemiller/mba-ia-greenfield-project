import { randomBytes } from 'node:crypto';

const VID_ID_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
// 128 bits of entropy keeps collision probability negligible for a
// single-user upload flow while staying short and URL-safe.
export const VIDEO_ID_LENGTH = 21;

function randomInt(maxExclusive: number): number {
  return randomBytes(4).readUInt32BE(0) % maxExclusive;
}

export function generateVideoId(): string {
  let result = '';
  for (let i = 0; i < VIDEO_ID_LENGTH; i++) {
    result += VID_ID_ALPHABET[randomInt(VID_ID_ALPHABET.length)];
  }
  return result;
}
