import logger from '../utils/logger.js';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS = 50;
const SAFETY_RESERVE = 4;

const timestamps: number[] = [];

interface RateLimitOptions {
  signal?: AbortSignal;
  maxWaitMs?: number;
}

const abortError = (): DOMException => new DOMException('Request canceled', 'AbortError');

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });

const pruneExpired = (now: number): void => {
  while (timestamps.length && now - timestamps[0] > WINDOW_MS) timestamps.shift();
};

async function acquire({ signal, maxWaitMs = WINDOW_MS + 10000 }: RateLimitOptions): Promise<void> {
  const deadline = Date.now() + Math.max(0, maxWaitMs);
  for (;;) {
    if (signal?.aborted) throw abortError();
    const now = Date.now();
    pruneExpired(now);
    if (timestamps.length < MAX_REQUESTS - SAFETY_RESERVE) {
      timestamps.push(now);
      return;
    }

    if (now >= deadline) {
      throw Object.assign(new Error('请求限流等待超时，请稍后重试'), {
        code: 'RATE_LIMIT_TIMEOUT',
      });
    }
    const waitMs = Math.min(timestamps[0] + WINDOW_MS - now + 50, deadline - now);
    logger.warn(`[RateLimiter] 已达窗口上限，延迟 ${Math.ceil(waitMs)}ms 后再发请求`);
    await sleep(Math.max(0, waitMs), signal);
  }
}

export async function withRateLimit<T>(
  fn: () => T | Promise<T>,
  options: RateLimitOptions = {}
): Promise<T> {
  await acquire(options);
  if (options.signal?.aborted) throw abortError();
  return fn();
}

export function getRemainingQuota(): number {
  pruneExpired(Date.now());
  return Math.max(0, MAX_REQUESTS - SAFETY_RESERVE - timestamps.length);
}
