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
import { subject as caslSubject } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import type { IEntityAuthorizer } from '../interfaces/entity-authorizer.interface';
import { buildBypassAbility } from '../services/ability.factory';
import type { AppAbility, CaslUserContext } from '../types/casl.types';
import { projectReadableFields } from './read-projection.helper';

/**
 * Retrieve the {@link AppAbility} that {@link CaslBehavior} stored for the
 * current request.
 *
 * `CaslBehavior` runs **before** the handler and only sees the command/query
 * payload — it cannot evaluate conditions that depend on the *persisted* state
 * of the target entity (e.g. "the user being edited belongs to my department").
 * Handlers therefore need to perform a second, instance-level check against the
 * entity they just loaded. This helper exposes the already-built ability so the
 * handler does not have to rebuild it.
 *
 * Pass the pipeline {@link IPipelineContext} explicitly when you have it,
 * otherwise the ability is read from the ambient pipeline async store, which is
 * populated automatically for every pipelined handler.
 *
 * @returns The request's ability, or `undefined` when CASL did not run for this
 *          handler (e.g. no `rules`, `prebuiltAbility`, or `skipCheck`).
 */
export function getCaslAbility(
  context?: IPipelineContext,
): AppAbility | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
}

export interface CaslAuthorizerOptions {
  /**
   * If true, this authorizer operates in explicit bypass mode, allowing all
   * actions and returning entity snapshots without evaluation.
   *
   * Must only be enabled for trusted/internal system flows where authorization
   * is handled externally or deliberately bypassed.
   *
   * @default false
   */
  bypass?: boolean;
}

export interface CaslBypassContext {
  bypass: true;
}

/**
 * Pluggable authorizer service backed by CASL.
 *
 * Exposes generic `authorize()` and `can()` methods usable both inside pipeline
 * behaviors (with string subjects) and inside application command/query handlers
 * (with loaded entity instances).
 *
 * For normal pipelined handlers, prefer the short form: `CaslBehavior` builds
 * the request ability once, stores it in the pipeline context, and
 * `CaslAuthorizer` reads that same ability from the ambient pipeline store when
 * the handler performs its persisted-entity check.
 *
 * @example Persisted-entity authorization after loading from a repository
 * ```ts
 * const user = await this.users.findById(query.id);
 * const visibleUser = this.authorizer.authorize<UserDto>('read', user);
 * return visibleUser;
 * ```
 *
 * @example Explicit ability outside the ambient pipeline context
 * ```ts
 * const ability = buildAbility(roles, currentUser);
 * this.authorizer.authorize(ability, 'update', loadedUser, ['displayName']);
 * ```
 *
 * @example Trusted internal bypass (make bypass explicit at the call site)
 * ```ts
 * this.authorizer.authorize({ bypass: true }, 'read', internalSnapshot);
 * ```
 *
 * Passing only a {@link CaslUserContext} in the historical four-argument
 * overload does **not** build an ability from that actor. Role/capability lookup
 * is application-specific and cannot be inferred by this package. That legacy
 * overload is retained for compatibility but is deprecated; use the ambient
 * request ability or pass an explicit {@link AppAbility} instead.
 */
@Injectable()
export class CaslAuthorizer implements IEntityAuthorizer {
  private readonly ability?: AppAbility;
  private readonly bypass: boolean;

  /**
   * Inject pre-built permissions (e.g. from the active execution context).
   * If omitted, {@link authorize} falls back to the current ambient ability
   * stored by `CaslBehavior`.
   */
  constructor(ability?: AppAbility, options?: { bypass?: boolean });
  /**
   * Convenience overload: pass only `{ bypass: true }` to disable authorization checks.
   */
  constructor(options?: { bypass?: boolean });
  constructor(
    abilityOrOptions?: AppAbility | { bypass?: boolean },
    options?: { bypass?: boolean },
  ) {
    if (
      abilityOrOptions &&
      typeof abilityOrOptions === 'object' &&
      !('can' in abilityOrOptions)
    ) {
      this.ability = undefined;
      this.bypass = !!abilityOrOptions.bypass;
    } else {
      this.ability = abilityOrOptions as AppAbility | undefined;
      this.bypass = !!options?.bypass;
    }
  }

  /**
   * Create an authorizer instance that explicitly bypasses all authorization checks.
   * Use only for trusted or internal flows.
   */
  static bypass(): CaslAuthorizer {
    return new CaslAuthorizer(buildBypassAbility(), { bypass: true });
  }

  /**
   * Evaluates permissions using the injected/ambient request ability and returns
   * the authorized subject or masked snapshot, or throws an
   * {@link UnauthorizedActionException} if access is forbidden.
   */
  authorize<T = unknown>(
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  /**
   * Evaluates permissions with an explicit pre-built ability or explicit bypass
   * context. This is the preferred four-argument form when no ambient pipeline
   * ability is available.
   */
  authorize<T = unknown>(
    abilityOrBypass: AppAbility | CaslBypassContext | undefined,
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  /**
   * Historical actor-first signature.
   *
   * The actor value is **not** converted into an ability; the authorizer still
   * uses its injected ability or the ability already stored by `CaslBehavior`.
   *
   * @deprecated Pass a pre-built `AppAbility`, or use
   * `authorize(action, subject, fields?)` inside a pipelined handler so the
   * ambient ability created by `CaslBehavior` is reused.
   */
  authorize<T = unknown>(
    actor: CaslUserContext,
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  authorize<T = unknown>(...args: unknown[]): T {
    let ability: AppAbility | undefined;
    let action: string;
    let subject: object | string;
    let fields: string[] | undefined;
    let explicitBypass = false;

    const isActorOrAbilitySignature =
      args.length >= 4 ||
      (args.length === 3 &&
        typeof args[0] !== 'string' &&
        typeof args[1] === 'string');

    if (isActorOrAbilitySignature) {
      // (actorOrAbility, action, subject, fields?)
      const [actorOrAbility, act, subj, flds] = args;
      action = act as string;
      subject = subj as object | string;
      fields = flds as string[] | undefined;

      if (
        actorOrAbility &&
        typeof (actorOrAbility as AppAbility).can === 'function'
      ) {
        ability = actorOrAbility as AppAbility;
      } else if (
        actorOrAbility &&
        typeof actorOrAbility === 'object' &&
        (actorOrAbility as CaslBypassContext).bypass === true
      ) {
        explicitBypass = true;
      } else {
        // Compatibility path for the historical CaslUserContext-first overload:
        // an actor alone cannot define application role/capability rules, so use
        // the ability already injected/stored by CaslBehavior.
        ability = this.ability ?? getCaslAbility();
      }
    } else {
      // (action, subject, fields?)
      const [act, subj, flds] = args;
      action = act as string;
      subject = subj as object | string;
      fields = flds as string[] | undefined;
      ability = this.ability ?? getCaslAbility();
    }

    if (this.bypass || explicitBypass) {
      return (
        typeof (subject as { toJSON?: () => unknown })?.toJSON === 'function'
          ? (subject as { toJSON: () => unknown }).toJSON()
          : subject
      ) as T;
    }

    if (!ability) {
      const { subjectType, entityId } = this.resolveSubjectInfo(subject);
      throw new UnauthorizedActionException({
        action,
        subject: subjectType,
        entityId,
        reason: `Access denied: insufficient permissions to ${action} ${subjectType} (no authorization ability present in context).`,
      });
    }

    const { subjectType, entityRecord, entityId, typedSubject } =
      this.resolveSubjectInfo(subject);

    if (action === 'read') {
      if (!ability.can('read', typedSubject)) {
        throw new UnauthorizedActionException({
          action: 'read',
          subject: subjectType,
          entityId,
          reason: `Access denied: insufficient permissions to read ${subjectType}.`,
        });
      }

      if (entityRecord) {
        return projectReadableFields(ability, typedSubject, entityRecord) as T;
      }

      return (entityRecord ?? subject) as T;
    }

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const fieldStr = String(field);
        if (!ability.can(action, typedSubject, fieldStr)) {
          throw new UnauthorizedActionException({
            action,
            subject: subjectType,
            entityId,
            fields: [fieldStr],
            reason: `Access denied: insufficient permissions to ${action} ${subjectType} field "${fieldStr}".`,
          });
        }
      }
    } else if (!ability.can(action, typedSubject)) {
      throw new UnauthorizedActionException({
        action,
        subject: subjectType,
        entityId,
        reason: `Access denied: insufficient permissions to ${action} ${subjectType}.`,
      });
    }

    return (entityRecord ?? subject) as T;
  }

  /**
   * Filters a collection of subjects, evaluating permissions for each item.
   * Authorized subjects are projected with readable fields and returned.
   * Unauthorized items, null, or undefined values are silently omitted.
   *
   * @param action - The action to authorize (e.g. 'read').
   * @param subjects - The iterable collection of entities/subjects to filter.
   * @returns An array of authorized subjects or projected snapshots.
   */
  filter<T = unknown>(
    action: string,
    subjects: Iterable<object | null | undefined>,
  ): T[];
  filter<T = unknown>(
    actorOrAbility:
      | CaslUserContext
      | AppAbility
      | CaslBypassContext
      | undefined,
    action: string,
    subjects: Iterable<object | null | undefined>,
  ): T[];
  filter<T = unknown>(...args: unknown[]): T[] {
    let actorOrAbility:
      | CaslUserContext
      | AppAbility
      | CaslBypassContext
      | undefined;
    let action: string;
    let subjects: Iterable<object | null | undefined>;

    const isActorOrAbilitySignature =
      args.length >= 3 ||
      (args.length === 2 &&
        typeof args[0] !== 'string' &&
        typeof args[1] === 'string');

    if (isActorOrAbilitySignature) {
      actorOrAbility = args[0] as
        | CaslUserContext
        | AppAbility
        | CaslBypassContext
        | undefined;
      action = args[1] as string;
      subjects = (args[2] as Iterable<object | null | undefined>) ?? [];
    } else {
      action = args[0] as string;
      subjects = (args[1] as Iterable<object | null | undefined>) ?? [];
    }

    if (!subjects) return [];

    const results: T[] = [];
    for (const item of subjects) {
      if (!item) continue;
      try {
        if (actorOrAbility === undefined && !this.can(action, item)) {
          continue;
        }
        const authorized =
          actorOrAbility !== undefined
            ? this.authorize<T>(actorOrAbility as never, action, item)
            : this.authorize<T>(action, item);
        results.push(authorized);
      } catch (err) {
        if (!(err instanceof UnauthorizedActionException)) {
          throw err;
        }
      }
    }
    return results;
  }

  /**
   * Check whether the action is permitted on the given subject/field.
   */
  can(action: string, subject: object | string, field?: string): boolean;
  can(
    action: string,
    subject: string,
    entity: Record<string, unknown>,
    field?: string,
  ): boolean;
  can(...args: unknown[]): boolean {
    if (this.bypass) return true;

    const ability = this.ability ?? getCaslAbility();
    if (!ability) return false;

    if (
      args.length >= 3 &&
      typeof args[1] === 'string' &&
      typeof args[2] === 'object' &&
      args[2] !== null
    ) {
      // Legacy 4-arg signature from IEntityAuthorizer: can(action, subjectStr, entityRecord, field?)
      const [action, subjectStr, entityRecord, field] = args as [
        string,
        string,
        Record<string, unknown>,
        string?,
      ];
      const typed = caslSubject(subjectStr, {
        ...entityRecord,
      }) as unknown as string;
      return field
        ? ability.can(action, typed, field)
        : ability.can(action, typed);
    }

    const [action, subject, field] = args as [string, object | string, string?];
    const { typedSubject } = this.resolveSubjectInfo(subject);
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }

  private resolveSubjectInfo(subject: object | string): {
    subjectType: string;
    entityRecord?: Record<string, unknown>;
    entityId?: string | number;
    typedSubject: string;
  } {
    if (typeof subject === 'string') {
      return {
        subjectType: subject,
        typedSubject: subject,
      };
    }

    const subjectType =
      subject.constructor?.name && subject.constructor.name !== 'Object'
        ? subject.constructor.name
        : 'Object';

    const entityRecord: Record<string, unknown> =
      typeof (subject as { toJSON?: () => unknown }).toJSON === 'function'
        ? ((subject as { toJSON: () => unknown }).toJSON() as Record<
            string,
            unknown
          >)
        : (subject as Record<string, unknown>);

    const entityId =
      (subject as { id?: string | number }).id ??
      (entityRecord?.id as string | number | undefined);

    const typedSubject = caslSubject(subjectType, {
      ...entityRecord,
    }) as unknown as string;

    return {
      subjectType,
      entityRecord,
      entityId,
      typedSubject,
    };
  }
}

/**
 * Backward compatibility alias for {@link CaslAuthorizer}.
 */
export const CaslEntityAuthorizer = CaslAuthorizer;
export type CaslEntityAuthorizer = CaslAuthorizer;
