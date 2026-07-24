import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles connection error events instead of leaving them unhandled', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const redis = new RedisService(
      new ConfigService({
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_DB: 0,
      }),
    );

    expect(redis.listenerCount('error')).toBeGreaterThan(0);
    expect(() => redis.emit('error', new Error('connection refused'))).not.toThrow();
    expect(logger).toHaveBeenCalledWith(
      'Redis connection error at 127.0.0.1:6379: connection refused',
    );

    redis.disconnect();
  });

  it('fails startup with a clear error when Redis cannot be reached', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const redis = new RedisService(
      new ConfigService({
        REDIS_HOST: 'redis.internal',
        REDIS_PORT: 6379,
        REDIS_DB: 0,
      }),
    );
    jest.spyOn(redis, 'connect').mockRejectedValue(new Error('connection refused'));
    const disconnect = jest.spyOn(redis, 'disconnect');

    await expect(redis.onModuleInit()).rejects.toThrow(
      'Redis is unavailable at redis.internal:6379: connection refused',
    );
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
