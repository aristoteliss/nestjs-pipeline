import { QueryOptions } from '../application/query.retrieve';
import { ICache } from './cache.interface';
import { IQueryRepository } from './query-repository.interface';

export abstract class QueryRepository<TQuery = QueryOptions, TResult = unknown>
  implements IQueryRepository<TQuery, TResult>
{
  constructor(protected readonly cache: ICache<TResult>) {}

  abstract find(query: TQuery): Promise<TResult>;
}
