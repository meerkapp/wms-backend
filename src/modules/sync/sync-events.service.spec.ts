import { SyncEventsService } from './sync-events.service';

describe('SyncEventsService', () => {
  it('emits archived product items as active read-model deletions', async () => {
    const active = { id: 1, archivedAt: null, updatedAt: new Date('2026-07-23T00:00:00Z') };
    const archived = {
      id: 2,
      archivedAt: new Date('2026-07-23T00:00:01Z'),
      updatedAt: new Date('2026-07-23T00:00:01Z'),
    };
    const prisma = {
      productItem: {
        findMany: jest.fn().mockResolvedValue([active, archived]),
      },
    };
    const syncGateway = { emitTableChange: jest.fn() };
    const service = new SyncEventsService(prisma as never, syncGateway as never);

    await service.emitTableIds('product_item', { modifiedIds: [1, 2] });

    expect(syncGateway.emitTableChange).toHaveBeenCalledWith(
      'product_item',
      expect.objectContaining({
        added: [],
        modified: [expect.objectContaining({ id: 1, archivedAt: null })],
        upserted: [expect.objectContaining({ id: 1, archivedAt: null })],
        removed: [2],
        deletedIds: [2],
      }),
      undefined,
    );
  });
});
