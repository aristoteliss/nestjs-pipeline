import { QueryOptions } from '../application/query.retrieve';

export interface IQueryRepository<TQuery = QueryOptions, TResult = unknown> {
  find(query: TQuery): Promise<TResult>;
}
