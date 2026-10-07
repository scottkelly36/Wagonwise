/** Where a failed run is reported. The Fastify logger fits this directly. */
export interface TaskLogger {
  error(details: { readonly err: unknown; readonly task: string }, message: string): void;
}

export interface PeriodicTask {
  readonly name: string;
  readonly intervalMs: number;
  /** One pass of the work. May throw: the failure is logged and the next interval tries again. */
  run(): Promise<void>;
}

/**
 * Runs small housekeeping jobs on a timer inside core (hazard expiry, deleting old driver
 * positions). In-process, like the outbox poller, and for the same reason: one core instance, no
 * extra infrastructure to run or pay for. If core is ever scaled to several instances every task
 * here must stay safe to run twice at once; both of today's are (expiring or deleting the same
 * rows twice does nothing the second time).
 *
 * A task never overlaps itself: if a pass is still running when the next is due, that tick is
 * skipped. Timers are `unref`'d, so they never keep the process alive on their own, and `stop()`
 * waits for any pass in flight so the database pool is not closed under it.
 */
export class PeriodicTasks {
  readonly #timers: ReturnType<typeof setInterval>[] = [];
  readonly #running = new Set<Promise<void>>();
  readonly #activeNames = new Set<string>();

  constructor(private readonly logger: TaskLogger) {}

  start(task: PeriodicTask): void {
    const timer = setInterval(() => void this.runOnce(task), task.intervalMs);
    timer.unref();
    this.#timers.push(timer);
  }

  /** One pass of `task` now, unless the previous one is still going. Tests call this directly. */
  async runOnce(task: PeriodicTask): Promise<void> {
    if (this.#activeNames.has(task.name)) return;
    this.#activeNames.add(task.name);
    const pass = (async () => {
      try {
        await task.run();
      } catch (err) {
        this.logger.error({ err, task: task.name }, 'periodic task failed');
      } finally {
        this.#activeNames.delete(task.name);
      }
    })();
    this.#running.add(pass);
    try {
      await pass;
    } finally {
      this.#running.delete(pass);
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.#timers) clearInterval(timer);
    this.#timers.length = 0;
    await Promise.allSettled([...this.#running]);
  }
}
