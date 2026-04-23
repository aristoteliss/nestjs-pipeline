import { DomainEvent } from '../events/domain.event';

export abstract class DomainOutcome {
  public readonly events: Array<DomainEvent>;

  protected constructor(events?: Array<DomainEvent>) {
    this.events = events ?? [];
  }
}
