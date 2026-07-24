import { withAllowedSocketOrigin } from './configured-socket-io.adapter';

describe('withAllowedSocketOrigin', () => {
  it('adds the validated frontend origin without dropping other server options', () => {
    expect(
      withAllowedSocketOrigin('https://wms.example.com', {
        path: '/socket',
        cors: { credentials: true, origin: 'https://stale.example.com' },
      }),
    ).toMatchObject({
      path: '/socket',
      cors: {
        credentials: true,
        origin: 'https://wms.example.com',
      },
    });
  });
});
