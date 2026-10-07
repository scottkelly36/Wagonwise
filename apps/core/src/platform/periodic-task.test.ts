import { describe, expect, it, vi } from 'vitest';
import { PeriodicTasks, type PeriodicTask } from './periodic-task.js';

function logger() {
  return { error: vi.fn() };
}

describe('PeriodicTasks', () => {
  it('runs the task and reports nothing when it succeeds', async () => {
    const log = logger();
    const run = vi.fn(() => Promise.resolve());
    await new PeriodicTasks(log).runOnce({ name: 't', intervalMs: 1000, run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs a failure instead of throwing, and runs again next time', async () => {
    const log = logger();
    const run = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const tasks = new PeriodicTasks(log);
    const task: PeriodicTask = { name: 'flaky', intervalMs: 1000, run };
    await tasks.runOnce(task);
    await tasks.runOnce(task);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0]?.[0]).toMatchObject({ task: 'flaky' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('skips a pass while the previous one is still running', async () => {
    let release: () => void = () => undefined;
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const tasks = new PeriodicTasks(logger());
    const task: PeriodicTask = { name: 'slow', intervalMs: 1000, run };
    const first = tasks.runOnce(task);
    await tasks.runOnce(task);
    expect(run).toHaveBeenCalledTimes(1);
    release();
    await first;
    await tasks.runOnce(task);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs on its interval and stop() waits for a pass in flight', async () => {
    vi.useFakeTimers();
    try {
      let finished = false;
      let release: () => void = () => undefined;
      const run = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = () => {
              finished = true;
              resolve();
            };
          }),
      );
      const tasks = new PeriodicTasks(logger());
      tasks.start({ name: 'timed', intervalMs: 1000, run });
      await vi.advanceTimersByTimeAsync(1000);
      expect(run).toHaveBeenCalledTimes(1);

      const stopped = tasks.stop();
      release();
      await stopped;
      expect(finished).toBe(true);

      await vi.advanceTimersByTimeAsync(5000);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
