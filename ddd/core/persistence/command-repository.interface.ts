import { DomainOutcome } from '../domain/outcomes/domain.outcome';

export interface ICommandRepository<
  TDomainOutcome = DomainOutcome,
  TResult = unknown,
> {
  save(domainOutcome: TDomainOutcome): Promise<TResult | null>;
}
