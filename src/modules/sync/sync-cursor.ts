import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { SyncCursor } from './sync.types';

const LEGACY_CURSOR_PREFIX = 'v1';
const MAX_CURSOR_LENGTH = 512;

const CursorPayloadSchema = z
  .object({
    v: z.literal(1),
    updatedAt: z.string().datetime({ offset: true }),
    id: z.number().int().nonnegative().refine(Number.isSafeInteger),
  })
  .strict();

export interface SyncCursorPosition {
  updatedAt: Date;
  id: number;
}

export function encodeSyncCursor(position: SyncCursorPosition): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      updatedAt: position.updatedAt.toISOString(),
      id: position.id,
    }),
  ).toString('base64url');
}

export function parseSyncCursor(
  raw?: string | number | null,
  field = 'cursor',
): SyncCursorPosition | undefined {
  if (raw === undefined || raw === null || raw === '' || raw === 0 || raw === '0') {
    return undefined;
  }

  if (typeof raw === 'number') return legacyTimestampPosition(raw, field);

  if (raw.startsWith(`${LEGACY_CURSOR_PREFIX}|`)) {
    const match = /^v1\|([^|]+)\|(\d+)$/.exec(raw);
    if (!match) throw invalidCursor(field);

    const [, rawUpdatedAt, rawId] = match;
    if (!rawUpdatedAt || !rawId) throw invalidCursor(field);
    const updatedAt = new Date(rawUpdatedAt);
    const id = Number(rawId);
    if (Number.isNaN(updatedAt.getTime()) || !Number.isSafeInteger(id) || id < 0) {
      throw invalidCursor(field);
    }
    return { updatedAt, id };
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return legacyTimestampPosition(raw, field);

  if (raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw invalidCursor(field);
  }

  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const payload = CursorPayloadSchema.parse(JSON.parse(decoded));
    return { updatedAt: new Date(payload.updatedAt), id: payload.id };
  } catch {
    throw invalidCursor(field);
  }
}

export function cursorFromItems(items: unknown[]): SyncCursor {
  let latest: SyncCursorPosition | null = null;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { id?: unknown; updatedAt?: unknown };
    if (typeof record.id !== 'number' || !Number.isSafeInteger(record.id)) continue;

    const updatedAt = cursorDate(record.updatedAt);
    if (!updatedAt) continue;

    if (
      latest === null ||
      updatedAt > latest.updatedAt ||
      (updatedAt.getTime() === latest.updatedAt.getTime() && record.id > latest.id)
    ) {
      latest = { updatedAt, id: record.id };
    }
  }

  return latest ? encodeSyncCursor(latest) : null;
}

function cursorDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function legacyTimestampPosition(value: string | number, field = 'cursor'): SyncCursorPosition {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) throw invalidCursor(field);

  // Legacy timestamp cursors did not contain an id. Starting at id=0 may
  // replay rows at the boundary once, but cannot skip them.
  return { updatedAt, id: 0 };
}

function invalidCursor(field: string): BadRequestException {
  return new BadRequestException(`${field} must be a valid sync cursor`);
}
