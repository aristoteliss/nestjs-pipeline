/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { subject as caslSubject } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import type { IEntityAuthorizer } from '../interfaces/entity-authorizer.interface';
import { buildBypassAbility } from '../services/ability.factory';
import type {
  AppAbility,
  AuthorizerSelectOptions,
  Projected,
  SelectedProjection,
} from '../types/casl.types';
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

/** Structural check for a built CASL ability. */
function isAppAbility(value: unknown): value is AppAbility {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppAbility).can === 'function'
  );
}

/** Structural check for the explicit bypass marker. */
function isBypassContext(value: unknown): value is CaslBypassContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as CaslBypassContext).bypass === true
  );
}

/** Structural check for field selection options. */
function isSelectOptions(value: unknown): value is AuthorizerSelectOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    'select' in value &&
    (Array.isArray((value as AuthorizerSelectOptions).select) ||
      Array.isArray((value as AuthorizerSelectOptions).select as unknown))
  );
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
 * Role/capability lookup is application-specific, so authorizer calls accept
 * either the ambient ability prepared by `CaslBehavior` or an explicit
 * {@link AppAbility}/{@link CaslBypassContext}. Actor objects are not converted
 * into abilities implicitly.
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
  constructor(ability?: AppAbility, options?: CaslAuthorizerOptions);
  /**
   * Convenience overload: pass only `{ bypass: true }` to disable authorization checks.
   */
  constructor(options?: CaslAuthorizerOptions);
  constructor(
    abilityOrOptions?: AppAbility | CaslAuthorizerOptions,
    options?: CaslAuthorizerOptions,
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
   * Evaluates read permissions with an explicit field selection allowlist.
   */
  authorize<TEntity extends object, K extends keyof TEntity & string>(
    action: 'read',
    subject: TEntity,
    options: AuthorizerSelectOptions<K>,
  ): SelectedProjection<TEntity, K>;
  /**
   * Evaluates permissions with an explicit pre-built ability or explicit bypass
   * context. Use this when no ambient pipeline ability is available.
   */
  authorize<T = unknown>(
    abilityOrBypass: AppAbility | CaslBypassContext,
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  /**
   * Evaluates read permissions with an explicit pre-built ability or explicit bypass
   * context and an explicit field selection allowlist.
   */
  authorize<TEntity extends object, K extends keyof TEntity & string>(
    abilityOrBypass: AppAbility | CaslBypassContext,
    action: 'read',
    subject: TEntity,
    options: AuthorizerSelectOptions<K>,
  ): SelectedProjection<TEntity, K>;
  authorize<T = unknown>(...args: unknown[]): T {
    const { ability, explicitBypass, action, subject, fields, options } =
      this.normalizeAuthorizeArguments(args);

    if (this.bypass || explicitBypass) {
      const raw =
        typeof (subject as { toJSON?: () => unknown })?.toJSON === 'function'
          ? (subject as { toJSON: () => unknown }).toJSON()
          : subject;
      if (options?.select) {
        const selected: Record<string, unknown> = {};
        for (const key of options.select) {
          if (raw && typeof raw === 'object' && key in raw) {
            selected[key] = (raw as Record<string, unknown>)[key];
          }
        }
        return selected as T;
      }
      return raw as T;
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

      const projected = entityRecord
        ? (projectReadableFields(ability, typedSubject, entityRecord) as Record<
            string,
            unknown
          >)
        : ((entityRecord ?? subject) as Record<string, unknown>);

      if (options?.select) {
        const selected: Record<string, unknown> = {};
        for (const key of options.select) {
          if (projected && typeof projected === 'object' && key in projected) {
            selected[key] = projected[key];
          }
        }
        return selected as T;
      }

      return projected as T;
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
   * Projects a candidate DTO or composite object against an authoritative loaded entity,
   * applying CASL readable-field and descendant-path masking rules.
   *
   * Evaluates permissions and conditions against `subject` while returning the projected
   * fields of `candidate`. Denied fields are omitted, and denied array elements (e.g. `roles.0`)
   * are replaced with `null` placeholders. Neither `subject` nor `candidate` is mutated.
   */
  project<TCandidate extends object>(
    action: string,
    subject: object | string,
    candidate: TCandidate,
  ): Projected<TCandidate>;
  project<TCandidate extends object>(
    abilityOrBypass: AppAbility | CaslBypassContext,
    action: string,
    subject: object | string,
    candidate: TCandidate,
  ): Projected<TCandidate>;
  project<TCandidate extends object>(
    ...args: unknown[]
  ): Projected<TCandidate> {
    const { ability, explicitBypass, action, subject, candidate } =
      this.normalizeProjectArguments(args);

    if (this.bypass || explicitBypass) {
      const raw =
        typeof (candidate as { toJSON?: () => unknown })?.toJSON === 'function'
          ? (candidate as { toJSON: () => unknown }).toJSON()
          : candidate;
      return (
        raw && typeof raw === 'object'
          ? Array.isArray(raw)
            ? [...raw]
            : { ...raw }
          : raw
      ) as Projected<TCandidate>;
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

    const { subjectType, entityId, typedSubject } =
      this.resolveSubjectInfo(subject);

    if (!ability.can(action, typedSubject)) {
      throw new UnauthorizedActionException({
        action,
        subject: subjectType,
        entityId,
        reason: `Access denied: insufficient permissions to ${action} ${subjectType}.`,
      });
    }

    const candidateRecord =
      typeof (candidate as { toJSON?: () => unknown })?.toJSON === 'function'
        ? ((candidate as { toJSON: () => unknown }).toJSON() as Record<
            string,
            unknown
          >)
        : (candidate as Record<string, unknown>);

    return projectReadableFields(
      ability,
      typedSubject,
      candidateRecord,
    ) as Projected<TCandidate>;
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
    abilityOrBypass: AppAbility | CaslBypassContext,
    action: string,
    subjects: Iterable<object | null | undefined>,
  ): T[];
  filter<T = unknown>(...args: unknown[]): T[] {
    // Explicit-ability calls are distinguished by a non-string first argument.
    const explicitFirst = typeof args[0] !== 'string';

    if (explicitFirst && !isAppAbility(args[0]) && !isBypassContext(args[0])) {
      throw new TypeError(
        'CaslAuthorizer.filter() expects either (action, subjects) or ' +
          '(ability | { bypass: true }, action, subjects). Actor-first calls are unsupported.',
      );
    }

    const abilityOrBypass = explicitFirst
      ? (args[0] as AppAbility | CaslBypassContext)
      : undefined;
    const action = (explicitFirst ? args[1] : args[0]) as string;
    const subjects = ((explicitFirst ? args[2] : args[1]) ?? []) as Iterable<
      object | null | undefined
    >;

    if (!subjects) return [];

    const results: T[] = [];
    for (const item of subjects) {
      if (!item) continue;
      try {
        if (abilityOrBypass === undefined && !this.can(action, item)) {
          continue;
        }
        const authorized =
          abilityOrBypass !== undefined
            ? this.authorize<T>(abilityOrBypass, action, item)
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
  can(action: string, subject: object | string, field?: string): boolean {
    if (this.bypass) return true;

    const ability = this.ability ?? getCaslAbility();
    if (!ability) return false;

    const { typedSubject } = this.resolveSubjectInfo(subject);
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }

  /**
   * Normalizes the ambient-ability and explicit-ability call shapes.
   *
   * Unsupported argument shapes are rejected rather than inferred because an
   * ambiguous authorization call must never be converted into a different
   * permission check.
   */
  private normalizeAuthorizeArguments(args: unknown[]): {
    ability?: AppAbility;
    explicitBypass: boolean;
    action: string;
    subject: object | string;
    fields?: string[];
    options?: AuthorizerSelectOptions;
  } {
    const [first] = args;

    if (typeof first === 'string') {
      const action = first;
      const subject = args[1] as object | string;
      const third = args[2];
      const isOpts = isSelectOptions(third);
      return {
        ability: this.ability ?? getCaslAbility(),
        explicitBypass: false,
        action,
        subject,
        fields: isOpts ? undefined : (third as string[] | undefined),
        options: isOpts ? third : undefined,
      };
    }

    const [, act, subj, third] = args;
    const action = act as string;
    const subject = subj as object | string;
    const isOpts = isSelectOptions(third);
    const fields = isOpts ? undefined : (third as string[] | undefined);
    const options = isOpts ? third : undefined;

    if (isAppAbility(first)) {
      return {
        ability: first,
        explicitBypass: false,
        action,
        subject,
        fields,
        options,
      };
    }

    if (isBypassContext(first)) {
      return {
        explicitBypass: true,
        action,
        subject,
        fields,
        options,
      };
    }

    throw new TypeError(
      'CaslAuthorizer.authorize() expects either (action, subject, fields?) or ' +
        '(ability | { bypass: true }, action, subject, fields?). The actor-first ' +
        'form was removed: an actor value cannot be converted into an ability, and ' +
        'its three-argument shape was indistinguishable from (action, subject, fields).',
    );
  }

  private normalizeProjectArguments(args: unknown[]): {
    ability?: AppAbility;
    explicitBypass: boolean;
    action: string;
    subject: object | string;
    candidate: object;
  } {
    const [first] = args;

    if (typeof first === 'string') {
      const [action, subject, candidate] = args as [
        string,
        object | string,
        object,
      ];
      if (!candidate || typeof candidate !== 'object') {
        throw new TypeError(
          'CaslAuthorizer.project() requires a candidate object to project.',
        );
      }
      return {
        ability: this.ability ?? getCaslAbility(),
        explicitBypass: false,
        action,
        subject,
        candidate,
      };
    }

    const [, act, subj, cand] = args;
    const action = act as string;
    const subject = subj as object | string;
    const candidate = cand as object;

    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError(
        'CaslAuthorizer.project() requires a candidate object to project.',
      );
    }

    if (isAppAbility(first)) {
      return {
        ability: first,
        explicitBypass: false,
        action,
        subject,
        candidate,
      };
    }

    if (isBypassContext(first)) {
      return {
        explicitBypass: true,
        action,
        subject,
        candidate,
      };
    }

    throw new TypeError(
      'CaslAuthorizer.project() expects either (action, subject, candidate) or ' +
        '(ability | { bypass: true }, action, subject, candidate).',
    );
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
 * Checks whether an ability contains conditional rules for any of the given subjects.
 *
 * Used by cache policies to determine whether entity-level attributes can alter
 * authorization decisions, requiring cache bypass.
 */
export function hasEntityConditions(
  ability: AppAbility,
  subjects: readonly string[],
): boolean {
  const subjectSet = new Set(subjects);
  for (const rule of ability.rules) {
    const ruleSubjects = Array.isArray(rule.subject)
      ? rule.subject
      : [rule.subject];
    const matchesSubject = ruleSubjects.some(
      (s) =>
        typeof s === 'string' &&
        (subjectSet.has(s) || subjectSet.has('all') || s === 'all'),
    );
    if (!matchesSubject) continue;

    if (rule.conditions) {
      if (typeof rule.conditions === 'function') {
        return true;
      }
      if (
        typeof rule.conditions === 'object' &&
        Object.keys(rule.conditions).length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}
