import { describe, it, expect } from 'vitest';
import { parseAvatarPayload } from './avatar.js';

const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

describe('avatar payload', () => {
  it('accepts a PNG data URL', () => {
    const parsed = parseAvatarPayload(`data:image/png;base64,${TINY_PNG}`, 'photo.png');
    expect(parsed.ext).toBe('png');
    expect(parsed.buffer.length).toBeGreaterThan(0);
  });

  it('rejects SVG and empty payloads', () => {
    expect(parseAvatarPayload(null)).toBeNull();
    expect(() => parseAvatarPayload('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toThrow(/JPG, PNG, or WebP/);
  });
});
