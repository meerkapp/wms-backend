import { BadRequestException } from '@nestjs/common';
import { cursorFromItems, encodeSyncCursor, parseSyncCursor } from './sync-cursor';

describe('sync cursor', () => {
  it('round-trips a composite cursor', () => {
    const position = { updatedAt: new Date('2026-07-12T10:00:00.000Z'), id: 42 };
    const token = encodeSyncCursor(position);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('2026-07-12');
    expect(parseSyncCursor(token)).toEqual(position);
  });

  it('uses the largest id when timestamps are equal', () => {
    const cursor = cursorFromItems([
      { id: 4, updatedAt: '2026-07-12T10:00:00.000Z' },
      { id: 9, updatedAt: '2026-07-12T10:00:00.000Z' },
    ]);

    expect(parseSyncCursor(cursor)).toEqual({
      updatedAt: new Date('2026-07-12T10:00:00.000Z'),
      id: 9,
    });
  });

  it('accepts legacy timestamps without skipping their boundary', () => {
    expect(parseSyncCursor('2026-07-12T10:00:00.000Z')).toEqual({
      updatedAt: new Date('2026-07-12T10:00:00.000Z'),
      id: 0,
    });
  });

  it('accepts the previous composite cursor during migration', () => {
    expect(parseSyncCursor('v1|2026-07-12T10:00:00.000Z|9')).toEqual({
      updatedAt: new Date('2026-07-12T10:00:00.000Z'),
      id: 9,
    });
  });

  it('rejects malformed cursors', () => {
    expect(() => parseSyncCursor('invalid')).toThrow(BadRequestException);
    expect(() => parseSyncCursor('v1|invalid|2')).toThrow(BadRequestException);
    expect(() =>
      parseSyncCursor(
        Buffer.from(
          JSON.stringify({ v: 2, updatedAt: '2026-07-12T10:00:00.000Z', id: 2 }),
        ).toString('base64url'),
      ),
    ).toThrow(BadRequestException);
    expect(() => parseSyncCursor('a'.repeat(513))).toThrow(BadRequestException);
  });
});
