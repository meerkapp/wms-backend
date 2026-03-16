import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

const ONLINE_TTL_SECONDS = 5 * 60;

@Injectable()
export class PresenceService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async setOnline(userId: string): Promise<void> {
    await this.redis.set(`online:${userId}`, '1', 'EX', ONLINE_TTL_SECONDS);
  }

  async extendOnline(userId: string): Promise<void> {
    await this.redis.expire(`online:${userId}`, ONLINE_TTL_SECONDS);
  }

  async setOffline(userId: string): Promise<Date | null> {
    const deleted = await this.redis.del(`online:${userId}`);
    if (!deleted) return null;

    const now = new Date();
    await this.prisma.employee.update({
      where: { id: userId },
      data: { lastSeen: now },
    });
    return now;
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.redis.exists(`online:${userId}`)) === 1;
  }
}
