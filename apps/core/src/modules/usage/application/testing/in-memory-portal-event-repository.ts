import type { PortalEvent } from '../../domain/portal-event.js';
import type { PortalEventRepository } from '../portal-events.js';

export class InMemoryPortalEventRepository implements PortalEventRepository {
  readonly events: PortalEvent[] = [];

  insert(events: readonly PortalEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }

  deleteBefore(cutoff: Date): Promise<number> {
    const before = this.events.length;
    const keep = this.events.filter((e) => e.at >= cutoff);
    this.events.length = 0;
    this.events.push(...keep);
    return Promise.resolve(before - keep.length);
  }
}
