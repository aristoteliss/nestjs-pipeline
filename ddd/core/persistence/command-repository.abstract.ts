import { RootDomainOutcome } from '../domain/outcomes/root-domain.outcome';
import { ICache } from './cache.interface';
import { ICommandRepository } from './command-repository.interface';

export abstract class CommandRepository<
  TDomainOutcome = RootDomainOutcome,
  TResult = unknown | null,
> implements ICommandRepository<TDomainOutcome, TResult>
{
  constructor(protected readonly cache: ICache<TResult>) {}

  abstract save(domainOutcome: TDomainOutcome): Promise<TResult | null>;
}
