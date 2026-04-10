import { DomainEvent } from '../events/domain.event';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainOutcome } from './domain.outcome';

export abstract class RootDomainOutcome<
  T = RootEntity<Partial<RootEntitySnapshot>>,
> extends DomainOutcome {
  public readonly entity: T;

  protected constructor(entity: T, events?: Array<DomainEvent>) {
    super(events);
    this.entity = entity;
  }
}
