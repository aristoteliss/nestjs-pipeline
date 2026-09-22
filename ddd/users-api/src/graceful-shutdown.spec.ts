/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { INestApplicationContext } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeOnShutdownSignals } from './graceful-shutdown';

function captureSignalHandlers() {
  const handlers = new Map<string, () => void>();
  vi.spyOn(process, 'on').mockImplementation(((
    event: string,
    handler: () => void,
  ) => {
    handlers.set(event, handler);
    return process;
  }) as typeof process.on);
  const removed = vi
    .spyOn(process, 'removeListener')
    .mockImplementation((() => process) as typeof process.removeListener);
  const kill = vi
    .spyOn(process, 'kill')
    .mockImplementation((() => true) as typeof process.kill);
  return { handlers, removed, kill };
}

describe('closeOnShutdownSignals', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['SIGTERM', 'SIGINT'])(
    'closes the application, then flushes telemetry, then re-raises %s',
    async (signal) => {
      const { handlers, removed, kill } = captureSignalHandlers();
      const order: string[] = [];
      const app = {
        close: vi.fn(async () => {
          order.push('close');
        }),
      } as unknown as INestApplicationContext;
      const afterClose = vi.fn(async () => {
        order.push('flush');
      });
      kill.mockImplementation((() => {
        order.push('kill');
        return true;
      }) as typeof process.kill);

      closeOnShutdownSignals(app, afterClose);
      handlers.get(signal)?.();
      await vi.waitFor(() => expect(kill).toHaveBeenCalled());

      expect(order).toEqual(['close', 'flush', 'kill']);
      expect(kill).toHaveBeenCalledWith(process.pid, signal);
      expect(removed).toHaveBeenCalledWith('SIGTERM', handlers.get('SIGTERM'));
      expect(removed).toHaveBeenCalledWith('SIGINT', handlers.get('SIGINT'));
    },
  );

  it('still flushes telemetry and terminates when closing the application fails', async () => {
    const { handlers, kill } = captureSignalHandlers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = {
      close: vi.fn().mockRejectedValue(new Error('close failed')),
    } as unknown as INestApplicationContext;
    const afterClose = vi.fn().mockResolvedValue(undefined);

    closeOnShutdownSignals(app, afterClose);
    handlers.get('SIGTERM')?.();
    await vi.waitFor(() => expect(kill).toHaveBeenCalled());

    expect(afterClose).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });
});
