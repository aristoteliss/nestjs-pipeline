import { RootDomainOutcome } from '../../domain/outcomes/root-domain.outcome';
import type { CommandRepository } from '../command-repository.abstract';

export function Cacheable<
  TDomainOutcome extends RootDomainOutcome,
  TResult = unknown | null,
>(
  setKeyFn: ((domainOutcome: TDomainOutcome) => string) | null = (outcome) =>
    outcome.entity.cacheKey,
  deleteKeysFn: ((domainOutcome: TDomainOutcome) => string[]) | null = (
    outcome,
  ) => [outcome.entity.cacheKey],
): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    const original = descriptor.value as (
      domainOutcome: TDomainOutcome,
    ) => Promise<TResult | null>;

    descriptor.value = async function (
      this: CommandRepository<TDomainOutcome, unknown | null>,
      domainOutcome: TDomainOutcome,
    ): Promise<TResult | null> {
      const result = await original.call(this, domainOutcome);

      if (!this.cache) {
        return result;
      }

      if (!result && deleteKeysFn) {
        for (const key of deleteKeysFn(domainOutcome)) {
          await this.cache.delete(key);
        }
        return null;
      }

      if (setKeyFn) {
        await this.cache.set(setKeyFn(domainOutcome), result);
      }

      return result;
    };
  };
}
