/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  CommandRepository,
  PersistedWrite,
} from '@cqrs-ddd/core/persistence';
import { Inject, Injectable } from '@nestjs/common';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Auth, AuthSnapshot } from '../domain/models/auth.entity';

@Injectable()
export class CreateAuthCommandRepository extends CommandRepository<
  Auth,
  AuthSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<AuthSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @PersistedWrite<Auth>()
  async save(auth: Auth): Promise<AuthSnapshot> {
    await this.store.em.insert(Auth, auth);

    return auth.toJSON();
  }
}
