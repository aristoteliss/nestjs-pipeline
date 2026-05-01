/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { ICacheKey } from '../interfaces/cache-key.interface';
import { RootEntitySnapshot } from '../interfaces/root-entity-snapshot.interface';
import { RootEntity } from './root.entity';

export abstract class CacheableEntity<
  TSnapshot extends Partial<RootEntitySnapshot>,
  TEntity,
>
  extends RootEntity<TSnapshot>
  implements ICacheKey {
  readonly prefixKey: string;

  protected constructor(
    ctor: {
      readonly prefixKey: string;
      fromJSON(snapshot: TSnapshot): TEntity;
    },
    snapshot?: Partial<RootEntitySnapshot>,
  ) {
    super(snapshot);
    this.prefixKey = ctor.prefixKey;
  }

  get cacheKey(): string {
    return `${this.prefixKey}${this.id}`;
  }

  static fromStringify<S, E>(data: string, fromJSON: (snapshot: S) => E): E {
    return fromJSON(JSON.parse(data) as S);
  }
}
