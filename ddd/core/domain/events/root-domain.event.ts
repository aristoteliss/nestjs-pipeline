import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from '../models/root.entity';
import { DomainEvent } from './domain.event';

export class RootDomainEvent<
  T = RootEntity<Partial<RootEntitySnapshot>>,
> extends DomainEvent {
  public readonly entity: T;

  protected constructor(entity: T) {
    super();
    this.entity = entity;
  }
}
