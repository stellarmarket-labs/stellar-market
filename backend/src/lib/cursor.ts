/**
 * Cursor pagination utilities for stable, snapshot-consistent paging.
 */

export interface CursorPayload {
  snapshot: string;
  lastScore: number;
  lastId: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  total?: number;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (
      typeof parsed.snapshot !== 'string' ||
      typeof parsed.lastScore !== 'number' ||
      typeof parsed.lastId !== 'string'
    ) {
      return null;
    }
    return {
      snapshot: parsed.snapshot,
      lastScore: parsed.lastScore,
      lastId: parsed.lastId,
    };
  } catch {
    return null;
  }
}
