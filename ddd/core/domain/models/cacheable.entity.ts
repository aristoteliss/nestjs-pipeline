import { ICacheKey } from '../interfaces/cache-key.interface';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from './root.entity';

export abstract class CacheableEntity<
    TSnapshot extends Partial<RootEntitySnapshot>,
  >
  extends RootEntity<TSnapshot>
  implements ICacheKey
{
  readonly prefixKey: string;

  protected constructor(
    ctor: { readonly prefixKey: string },
    snapshot?: Partial<RootEntitySnapshot>,
  ) {
    super(snapshot);
    this.prefixKey = ctor.prefixKey;
  }

  get cacheKey(): string {
    return `${this.prefixKey}${this.id}`;
  }
}
