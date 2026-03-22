import { DomainOutcome } from '../domain/outcomes/domain.outcome';

export interface ICommandRepository<
  TCommand = DomainOutcome,
  TResult = unknown,
> {
  save(command: TCommand): Promise<TResult | undefined>;
}
