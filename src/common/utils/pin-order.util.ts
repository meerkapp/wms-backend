import { Folder, ProductCollection } from '@prisma/client';

export type PinnedEntry = {
  kind: 'folder' | 'collection';
  id: number;
  pinOrder: number | null;
  pinnedAt: Date;
};

export function buildPinnedEntries(folders: Folder[], collections: ProductCollection[]): PinnedEntry[] {
  return [
    ...folders.map(f => ({ kind: 'folder' as const, id: f.id, pinOrder: f.pinOrder, pinnedAt: f.pinnedAt! })),
    ...collections.map(c => ({ kind: 'collection' as const, id: c.id, pinOrder: c.pinOrder, pinnedAt: c.pinnedAt! })),
  ].sort((a, b) => {
    const oa = a.pinOrder ?? Infinity;
    const ob = b.pinOrder ?? Infinity;
    if (oa !== ob) return oa - ob;
    return a.pinnedAt.getTime() - b.pinnedAt.getTime();
  });
}
