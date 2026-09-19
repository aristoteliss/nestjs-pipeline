/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { CaslBehavior } from './casl.behavior';
import { CaslModule } from './casl.module';
import {
  CASL_FIELDS_FROM_REQUEST,
  CASL_ROLE_PROVIDER,
  CASL_SUBJECT_CONTEXT_PATHS,
  CASL_USER_CAPABILITY_PROVIDER,
  CASL_USER_CONTEXT_RESOLVER,
} from './constants/tokens';
import { CaslAuthorizer } from './helpers/entity-authorization.helper';
import { ENTITY_AUTHORIZER } from './interfaces/entity-authorizer.interface';
import { StaticRoleProvider } from './providers/static-role.provider';

describe('CaslModule.forRoot', () => {
  it('registers globally with class providers and subject context paths', () => {
    class MockUserContextResolver {
      resolveUserContext() {
        return { id: 'u1' };
      }
    }

    const dynamicModule = CaslModule.forRoot({
      roleProvider: { useFactory: () => new StaticRoleProvider([]) },
      userContextResolver: MockUserContextResolver as any,
      subjectContextPaths: ['sessionUser', 'auth'],
      defaultFieldsFromRequest: ['id', 'name'],
    });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.module).toBe(CaslModule);
    expect(dynamicModule.exports).toContain(CaslBehavior);
    expect(dynamicModule.exports).toContain(CaslAuthorizer);
    expect(dynamicModule.exports).toContain(ENTITY_AUTHORIZER);
    expect(dynamicModule.exports).toContain(CASL_ROLE_PROVIDER);
    expect(dynamicModule.exports).toContain(CASL_SUBJECT_CONTEXT_PATHS);
    expect(dynamicModule.exports).toContain(CASL_FIELDS_FROM_REQUEST);
    expect(dynamicModule.exports).toContain(CASL_USER_CONTEXT_RESOLVER);

    const authProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === ENTITY_AUTHORIZER,
    ) as any;
    expect(authProvider?.useExisting).toBe(CaslAuthorizer);

    const pathsProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === CASL_SUBJECT_CONTEXT_PATHS,
    ) as any;
    expect(pathsProvider?.useValue).toEqual(['sessionUser', 'auth']);
  });

  it('supports useClass, useExisting, and useFactory for providers', () => {
    class MockCapabilityProvider {
      async getUserCapabilities() {
        return { roles: ['admin'] };
      }
    }

    const dynamicModule = CaslModule.forRoot({
      roleProvider: { useExisting: 'CustomRoleToken' as any },
      userCapabilityProvider: { useClass: MockCapabilityProvider as any },
      subjectContextPaths: [],
    });

    expect(dynamicModule.exports).toContain(CASL_USER_CAPABILITY_PROVIDER);
    const capProvider = dynamicModule.providers?.find(
      (p: any) => p.provide === CASL_USER_CAPABILITY_PROVIDER,
    ) as any;
    expect(capProvider?.useClass).toBe(MockCapabilityProvider);
  });
});
