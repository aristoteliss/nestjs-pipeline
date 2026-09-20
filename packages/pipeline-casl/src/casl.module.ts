/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type ModuleMetadata,
  type Provider,
  type Type,
} from '@nestjs/common';
import { CaslBehavior } from './casl.behavior';
import { CASL_PERMISSION_SOURCE } from './constants/tokens';
import { CaslAuthorizer } from './helpers/authorizer';
import type { ICaslPermissionSource } from './interfaces/permission-source.interface';

export interface CaslModuleOptions {
  /** Modules whose exports the permission source provider needs (standard dynamic-module `imports`). */
  imports?: ModuleMetadata['imports'];
  /** The application's permission source, bound to `CASL_PERMISSION_SOURCE`. */
  permissionSource:
    | Type<ICaslPermissionSource>
    | { useClass: Type<ICaslPermissionSource> }
    | { useExisting: Type<ICaslPermissionSource> | InjectionToken }
    | {
        useFactory: (
          ...args: never[]
        ) => ICaslPermissionSource | Promise<ICaslPermissionSource>;
        inject?: InjectionToken[];
      };
}

function permissionSourceProvider(
  source: CaslModuleOptions['permissionSource'],
): Provider {
  if (typeof source === 'function') {
    return { provide: CASL_PERMISSION_SOURCE, useClass: source };
  }
  if ('useClass' in source) {
    return { provide: CASL_PERMISSION_SOURCE, useClass: source.useClass };
  }
  if ('useExisting' in source) {
    return { provide: CASL_PERMISSION_SOURCE, useExisting: source.useExisting };
  }
  return {
    provide: CASL_PERMISSION_SOURCE,
    useFactory: source.useFactory,
    inject: source.inject ?? [],
  };
}

/**
 * Registers `CaslBehavior`, `CaslAuthorizer` and the permission source
 * globally.
 *
 * `global: true` only makes these exports visible to other modules; the
 * permission source still resolves its own dependencies from `imports`.
 * Recommended form: an application module that provides and exports the
 * source, passed through `imports`, referenced with `useExisting`.
 *
 * @example
 * ```ts
 * CaslModule.forRoot({
 *   imports: [AuthorizationModule],
 *   permissionSource: { useExisting: AppPermissionSource },
 * });
 * ```
 */
@Module({})
export class CaslModule {
  static forRoot(options: CaslModuleOptions): DynamicModule {
    return {
      module: CaslModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        CaslBehavior,
        { provide: CaslAuthorizer, useFactory: () => new CaslAuthorizer() },
        permissionSourceProvider(options.permissionSource),
      ],
      exports: [CaslBehavior, CaslAuthorizer, CASL_PERMISSION_SOURCE],
    };
  }
}
