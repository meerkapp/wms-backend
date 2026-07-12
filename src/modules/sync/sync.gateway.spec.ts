import { SyncGateway } from './sync.gateway';
import { SyncSocketPayload } from './sync.types';

const payload: SyncSocketPayload = {
  added: [],
  modified: [],
  removed: [],
  upserted: [],
  deletedIds: [],
  deleted: [],
  cursor: null,
};

describe('SyncGateway room routing', () => {
  function createGateway() {
    const gateway = new SyncGateway({} as never, {} as never, {} as never);
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    return { gateway, to, emit };
  }

  it('joins authenticated only after JWT and active employee checks succeed', async () => {
    const jwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'employee-id' }),
    };
    const configService = { get: jest.fn().mockReturnValue('secret') };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-id',
          isActive: true,
          warehouseId: 2,
          warehouse: { organizationId: 3 },
        }),
      },
    };
    const gateway = new SyncGateway(jwtService as never, configService as never, prisma as never);
    const socket = {
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenNthCalledWith(1, 'authenticated');
    expect(socket.join).toHaveBeenCalledWith('user:employee-id');
    expect(socket.join).toHaveBeenCalledWith('warehouse:2');
    expect(socket.join).toHaveBeenCalledWith('organization:3');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('does not join authenticated when the employee is inactive', async () => {
    const jwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'employee-id' }),
    };
    const configService = { get: jest.fn().mockReturnValue('secret') };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue({ id: 'employee-id', isActive: false }),
      },
    };
    const gateway = new SyncGateway(jwtService as never, configService as never, prisma as never);
    const socket = {
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('routes global sync events to authenticated sockets', () => {
    const { gateway, to, emit } = createGateway();

    gateway.emitTableChange('organization', payload);

    expect(to).toHaveBeenCalledWith('authenticated');
    expect(emit).toHaveBeenCalledWith('sync:organization', payload);
  });

  it('keeps explicitly scoped private events out of the authenticated room', () => {
    const { gateway, to, emit } = createGateway();

    gateway.emitTableChange('organization', payload, { userId: 'employee-id' });

    expect(to).toHaveBeenCalledWith(['user:employee-id']);
    expect(to).not.toHaveBeenCalledWith('authenticated');
    expect(emit).toHaveBeenCalledWith('sync:organization', payload);
  });
});
