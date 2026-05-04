import { redis } from "./redis-connection.js";

export async function rateLimit(userId, socketId) {
  const key = `rateLimit:${userId ?? socketId}`;
  const now = Date.now();
  const windowMs = 5 * 1000;
  const max = 10;

  await redis.zremrangebyscore(key, 0, now - windowMs);
  const count = await redis.zcard(key);

  if (count >= max) return false;

  await redis.zadd(key, now, `${now}-${Math.random()}`);
  await redis.expire(key, Math.ceil(windowMs / 1000));
  return true;
}
