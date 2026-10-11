import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rate limiter', () => {
  let withRateLimit;
  let getRemainingQuota;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    ({ withRateLimit, getRemainingQuota } = await import('../services/rateLimiter'));
  });
  afterEach(() => vi.useRealTimers());

  const exhaust = async () => {
    for (let i = 0; i < 46; i++) await withRateLimit(() => 'ok');
    expect(getRemainingQuota()).toBe(0);
  };

  it('reserves quota and blocks request 47 until the sliding window expires', async () => {
    await exhaust();
    const fn = vi.fn(() => 'next');
    const request = withRateLimit(fn);
    await vi.advanceTimersByTimeAsync(300000);
    expect(fn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    await expect(request).resolves.toBe('next');
    expect(getRemainingQuota()).toBe(45);
  });

  it('rejects when the maximum wait expires without running the request', async () => {
    await exhaust();
    const fn = vi.fn();
    const request = withRateLimit(fn, { maxWaitMs: 1000 });
    const assertion = expect(request).rejects.toMatchObject({ code: 'RATE_LIMIT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels quota waiting promptly and cleans its timer', async () => {
    await exhaust();
    const controller = new AbortController();
    const fn = vi.fn();
    const request = withRateLimit(fn, { signal: controller.signal });
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not consume quota for an already canceled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withRateLimit(vi.fn(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(getRemainingQuota()).toBe(46);
  });
});
