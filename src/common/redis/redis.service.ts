import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly endpoint: string;

  constructor(configService: ConfigService) {
    const host = configService.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(configService.get<string>('REDIS_PORT') ?? 6379);
    const db = Number(configService.get<string>('REDIS_DB') ?? 0);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('REDIS_PORT must be an integer between 1 and 65535');
    }
    if (!Number.isInteger(db) || db < 0) {
      throw new Error('REDIS_DB must be a non-negative integer');
    }

    super({
      host,
      port,
      db,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    this.endpoint = `${host}:${port}`;
    this.on('error', (error: Error) => {
      this.logger.error(`Redis connection error at ${this.endpoint}: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
      this.logger.log(`Redis connected at ${this.endpoint}`);
    } catch (error) {
      this.disconnect();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Redis is unavailable at ${this.endpoint}: ${message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.status === 'ready') {
      await this.quit();
      return;
    }
    this.disconnect();
  }
}
