import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { expect, it } from 'vitest';
import { CacheManagerAdapter } from './cache-manager.adapter';

it('does not assign a failed read error to a concurrent cache miss', async () => {
  let firstCalls = 0,
    secondCalls = 0;
  let rejectFailed!: (error: Error) => void;
  let releaseMiss!: (value: undefined) => void;
  let releaseFailedFallback!: (value: undefined) => void;
  const failed = new Promise<undefined>((_, reject) => (rejectFailed = reject));
  const miss = new Promise<undefined>((resolve) => (releaseMiss = resolve));
  const fallback = new Promise<undefined>(
    (resolve) => (releaseFailedFallback = resolve),
  );
  const cache = createCache({
    stores: [
      Object.assign(new Keyv(), {
        get: () => (++firstCalls === 1 ? failed : Promise.resolve(undefined)),
      }),
      Object.assign(new Keyv(), {
        get: () => (++secondCalls === 1 ? miss : fallback),
      }),
    ],
  });
  const adapter = new CacheManagerAdapter(cache);
  const first = adapter.get('same').then(
    (value) => ({ value }),
    (error) => ({ error: error.message }),
  );
  const second = adapter.get('same').then(
    (value) => ({ value }),
    (error) => ({ error: error.message }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  rejectFailed(new Error('failed read'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  releaseMiss(undefined);
  const missResult = await second;
  releaseFailedFallback(undefined);
  const failedResult = await first;

  expect(missResult).toEqual({ value: undefined });
  expect(failedResult).toEqual({ error: 'failed read' });
});
