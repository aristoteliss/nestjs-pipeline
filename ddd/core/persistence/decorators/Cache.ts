import { QueryOptions } from '../../application/query.retrieve';
import { QueryRepository } from '../query-repository.abstract';

export function Cache<TQuery extends QueryOptions, TResult = unknown>(
  keyFn: (query: TQuery) => string | null,
  hydrateFn?: (cached: unknown) => TResult,
): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as (query: TQuery) => Promise<TResult>;

    descriptor.value = async function (
      this: QueryRepository<TQuery, TResult>,
      query: TQuery,
    ): Promise<TResult> {
      if (!this.cache) {
        return original.call(this, query);
      }

      const key = keyFn(query);

      if (key) {
        const cached = await this.cache.get(key);
        if (cached) {
          return query.hydrate && hydrateFn ? hydrateFn(cached) : cached;
        }
      }

      const result = await original.call(this, query);

      if (key) {
        await this.cache.set(key, result);
      }

      return result;
    };
  };
}
