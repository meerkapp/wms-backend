import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../../common/redis/redis.service';

export const DEVICE_SESSION_COOKIE = 'device_session';
export const DEVICE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const DEVICE_SESSION_TTL_MS = DEVICE_SESSION_TTL_SECONDS * 1000;

const DEVICE_SESSION_KEY_PREFIX = 'device-session:';
const MAX_DEVICE_ACCOUNTS = 10;

const ROTATE_SESSION_SCRIPT = `
local sourceKey = KEYS[1]
local targetKey = KEYS[2]
local accountId = ARGV[1]
local now = tonumber(ARGV[2])
local membershipTtlMs = tonumber(ARGV[3])
local sessionTtlSeconds = tonumber(ARGV[4])
local maxAccounts = tonumber(ARGV[5])
local memberships = redis.call('HGETALL', sourceKey)
local count = 0
local accountIncluded = false

for index = 1, #memberships, 2 do
  local memberId = memberships[index]
  local authenticatedAt = tonumber(memberships[index + 1])
  if authenticatedAt and now - authenticatedAt <= membershipTtlMs then
    if memberId == accountId then
      redis.call('HSET', targetKey, memberId, tostring(now))
      accountIncluded = true
    else
      redis.call('HSET', targetKey, memberId, tostring(authenticatedAt))
    end
    count = count + 1
  end
end

if not accountIncluded then
  if count >= maxAccounts then
    redis.call('DEL', targetKey)
    return -1
  end
  redis.call('HSET', targetKey, accountId, tostring(now))
  count = count + 1
end

redis.call('EXPIRE', targetKey, sessionTtlSeconds)
if sourceKey ~= targetKey then
  redis.call('DEL', sourceKey)
end
return count
`;

const TOUCH_ACCOUNT_SCRIPT = `
local key = KEYS[1]
local accountId = ARGV[1]
local now = tonumber(ARGV[2])
local membershipTtlMs = tonumber(ARGV[3])
local sessionTtlSeconds = tonumber(ARGV[4])
local authenticatedAt = tonumber(redis.call('HGET', key, accountId))

if not authenticatedAt or now - authenticatedAt > membershipTtlMs then
  redis.call('HDEL', key, accountId)
  if redis.call('HLEN', key) == 0 then
    redis.call('DEL', key)
  end
  return 0
end

redis.call('HSET', key, accountId, tostring(now))
redis.call('EXPIRE', key, sessionTtlSeconds)
return 1
`;

const REMOVE_ACCOUNT_SCRIPT = `
local key = KEYS[1]
redis.call('HDEL', key, ARGV[1])
local remaining = redis.call('HLEN', key)
if remaining == 0 then
  redis.call('DEL', key)
end
return remaining
`;

function createSessionId(): string {
  return randomBytes(32).toString('base64url');
}

function sessionKey(sessionId: string): string {
  const digest = createHash('sha256').update(sessionId).digest('hex');
  return `${DEVICE_SESSION_KEY_PREFIX}${digest}`;
}

function isCurrentMembership(authenticatedAt: string | undefined, now: number): boolean {
  if (!authenticatedAt) return false;
  const timestamp = Number(authenticatedAt);
  return Number.isFinite(timestamp) && now - timestamp <= DEVICE_SESSION_TTL_MS;
}

@Injectable()
export class DeviceSessionService {
  constructor(private readonly redisService: RedisService) {}

  async rotateAndAddAccount(
    currentSessionId: string | undefined,
    accountId: string,
  ): Promise<string> {
    const nextSessionId = createSessionId();
    const result = await this.redisService.eval(
      ROTATE_SESSION_SCRIPT,
      2,
      currentSessionId ? sessionKey(currentSessionId) : `${DEVICE_SESSION_KEY_PREFIX}empty`,
      sessionKey(nextSessionId),
      accountId,
      String(Date.now()),
      String(DEVICE_SESSION_TTL_MS),
      String(DEVICE_SESSION_TTL_SECONDS),
      String(MAX_DEVICE_ACCOUNTS),
    );

    if (Number(result) === -1) {
      throw new BadRequestException(`A device can store up to ${MAX_DEVICE_ACCOUNTS} accounts`);
    }
    return nextSessionId;
  }

  async hasAccount(sessionId: string, accountId: string): Promise<boolean> {
    const key = sessionKey(sessionId);
    const authenticatedAt = await this.redisService.hget(key, accountId);
    if (isCurrentMembership(authenticatedAt ?? undefined, Date.now())) return true;

    if (authenticatedAt !== null) await this.redisService.hdel(key, accountId);
    return false;
  }

  async touchAccount(sessionId: string, accountId: string): Promise<boolean> {
    const result = await this.redisService.eval(
      TOUCH_ACCOUNT_SCRIPT,
      1,
      sessionKey(sessionId),
      accountId,
      String(Date.now()),
      String(DEVICE_SESSION_TTL_MS),
      String(DEVICE_SESSION_TTL_SECONDS),
    );
    return Number(result) === 1;
  }

  async listAccountIds(sessionId: string): Promise<string[]> {
    const key = sessionKey(sessionId);
    const memberships = await this.redisService.hgetall(key);
    const now = Date.now();
    const expiredIds = Object.entries(memberships)
      .filter(([, authenticatedAt]) => !isCurrentMembership(authenticatedAt, now))
      .map(([accountId]) => accountId);

    if (expiredIds.length > 0) await this.redisService.hdel(key, ...expiredIds);
    return Object.keys(memberships).filter((accountId) => !expiredIds.includes(accountId));
  }

  async removeAccount(sessionId: string, accountId: string): Promise<number> {
    const result = await this.redisService.eval(
      REMOVE_ACCOUNT_SCRIPT,
      1,
      sessionKey(sessionId),
      accountId,
    );
    return Number(result);
  }
}
