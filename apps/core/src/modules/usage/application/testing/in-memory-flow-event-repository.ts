import type { FlowEvent } from '../../domain/flow-event.js';
import type { FlowEventRepository } from '../flow-events.js';

export class InMemoryFlowEventRepository implements FlowEventRepository {
  readonly events: FlowEvent[] = [];

  insert(events: readonly FlowEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }

  deleteBefore(cutoff: Date): Promise<number> {
    const before = this.events.length;
    const kept = this.events.filter((e) => e.at >= cutoff);
    this.events.splice(0, this.events.length, ...kept);
    return Promise.resolve(before - kept.length);
  }
}
