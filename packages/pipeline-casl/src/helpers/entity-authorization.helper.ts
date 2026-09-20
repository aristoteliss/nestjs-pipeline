/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { subject as caslSubject } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY, CASL_USER_CONTEXT_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../exceptions/unauthorized-action.exception';
import type { IEntityAuthorizer } from '../interfaces/entity-authorizer.interface';
import { buildBypassAbility } from '../services/ability.factory';
import type {
  AppAbility,
  AuthorizerSelectOptions,
  CaslUserContext,
  Projected,
  SelectedProjection,
} from '../types/casl.types';
import { projectPermittedFields } from './field-projection.helper';

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

/**
 * Retrieve the {@link CaslUserContext} that built the current request's ability.
 *
 * This is the identity authorization actually used, which is not necessarily the
 * one an application stored elsewhere in `context.items`. Security-scoped keys —
 * cache partitions, audit actors — must derive their principal from this value so
 * they cannot disagree with the ability they are partitioning.
 *
 * Pass the pipeline {@link IPipelineContext} explicitly when you have it,
 * otherwise the context is read from the ambient pipeline async store.
 *
 * @returns The resolved user context, or `undefined` when CASL ran anonymously
 *          (`skipCheck`, a prebuilt ability, or no resolvable user).
 */
export function getCaslUserContext(
  context?: IPipelineContext,
): CaslUserContext | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_USER_CONTEXT_KEY) as CaslUserContext | undefined;
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

function isSelectOptions(value: unknown): value is AuthorizerSelectOptions {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as AuthorizerSelectOptions).select)
  );
}

function toSnapshot(value: unknown): unknown {
  return typeof (value as { toJSON?: unknown } | null)?.toJSON === 'function'
    ? (value as { toJSON: () => unknown }).toJSON()
    : value;
}

/** Copies the requested own properties; prototype members are never selected. */
function pickSelected(
  record: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  if (record === null || typeof record !== 'object') return selected;
  for (const key of keys) {
    if (Object.hasOwn(record, key)) {
      Object.defineProperty(selected, key, {
        value: (record as Record<string, unknown>)[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return selected;
}

const NO_ABILITY = ' (no authorization ability present in context)';

function denied(
  action: string,
  subjectType: string,
  entityId: string | number | undefined,
  detail: string,
  fields?: string[],
): UnauthorizedActionException {
  return new UnauthorizedActionException({
    action,
    subject: subjectType,
    entityId,
    ...(fields ? { fields } : {}),
    reason: `Access denied: insufficient permissions to ${action} ${subjectType}${detail}.`,
  });
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
   *
   * The array-valued `fields` argument is a write-side check list. It does not
   * select or restrict the fields returned by a `read`.
   */
  authorize<T = unknown>(
    action: string,
    subject: object | string,
    fields?: string[],
  ): T;
  /**
   * Authorizes a read of the loaded entity, then returns only the requested
   * properties the ability permits. Selection never grants access; denied
   * properties are omitted and authorized `null` values are preserved.
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
   * Explicit-ability form of the selecting read.
   */
  authorize<TEntity extends object, K extends keyof TEntity & string>(
    abilityOrBypass: AppAbility | CaslBypassContext,
    action: 'read',
    subject: TEntity,
    options: AuthorizerSelectOptions<K>,
  ): SelectedProjection<TEntity, K>;
  authorize<T = unknown>(...args: unknown[]): T {
    const {
      ability,
      explicitBypass,
      args: [action, subject, extra],
    } = this.splitAbilityArgument(
      args,
      'CaslAuthorizer.authorize() expects either (action, subject, fields?) or ' +
        '(ability | { bypass: true }, action, subject, fields?). The actor-first ' +
        'form was removed: an actor value cannot be converted into an ability, and ' +
        'its three-argument shape was indistinguishable from (action, subject, fields).',
    ) as {
      ability?: AppAbility;
      explicitBypass: boolean;
      args: [string, object | string, unknown];
    };

    let fields: string[] | undefined;
    let select: readonly string[] | undefined;
    if (Array.isArray(extra)) {
      fields = extra;
    } else if (isSelectOptions(extra)) {
      if (action !== 'read') {
        throw new TypeError(
          'CaslAuthorizer.authorize() supports { select } only for the "read" action.',
        );
      }
      select = extra.select;
    } else if (extra !== undefined && extra !== null) {
      throw new TypeError(
        'CaslAuthorizer.authorize() expects fields as a string array or { select: string[] }.',
      );
    }

    if (this.bypass || explicitBypass) {
      const raw = toSnapshot(subject);
      return (select ? pickSelected(raw, select) : raw) as T;
    }

    const { subjectType, entityRecord, entityId, typedSubject } =
      this.resolveSubjectInfo(subject);

    if (!ability) {
      throw denied(action, subjectType, entityId, NO_ABILITY);
    }

    if (action === 'read') {
      if (!ability.can('read', typedSubject)) {
        throw denied('read', subjectType, entityId, '');
      }

      const projected = entityRecord
        ? projectPermittedFields(ability, 'read', typedSubject, entityRecord)
        : subject;

      return (select ? pickSelected(projected, select) : projected) as T;
    }

    if (fields && fields.length > 0) {
      for (const field of fields) {
        const fieldStr = String(field);
        if (!ability.can(action, typedSubject, fieldStr)) {
          throw denied(action, subjectType, entityId, ` field "${fieldStr}"`, [
            fieldStr,
          ]);
        }
      }
    } else if (!ability.can(action, typedSubject)) {
      throw denied(action, subjectType, entityId, '');
    }

    return (entityRecord ?? subject) as T;
  }

  /**
   * Projects a candidate DTO or composite object against an authoritative loaded entity.
   *
   * Permission and conditions are evaluated against `subject`; the returned
   * value contains only the `candidate` fields the ability permits for `action`.
   * Denied fields are omitted and denied array elements (e.g. `roles.0`) become
   * `null` placeholders. Neither `subject` nor `candidate` is mutated.
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
    const {
      ability,
      explicitBypass,
      args: [action, subject, candidate],
    } = this.splitAbilityArgument(
      args,
      'CaslAuthorizer.project() expects either (action, subject, candidate) or ' +
        '(ability | { bypass: true }, action, subject, candidate).',
    ) as {
      ability?: AppAbility;
      explicitBypass: boolean;
      args: [string, object | string, unknown];
    };

    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError(
        'CaslAuthorizer.project() requires a candidate object to project.',
      );
    }

    const candidateRecord = toSnapshot(candidate);

    if (this.bypass || explicitBypass) {
      return (
        Array.isArray(candidateRecord)
          ? [...candidateRecord]
          : { ...(candidateRecord as object) }
      ) as Projected<TCandidate>;
    }

    const { subjectType, entityId, typedSubject } =
      this.resolveSubjectInfo(subject);

    if (!ability) {
      throw denied(action, subjectType, entityId, NO_ABILITY);
    }
    if (!ability.can(action, typedSubject)) {
      throw denied(action, subjectType, entityId, '');
    }

    return projectPermittedFields(
      ability,
      action,
      typedSubject,
      candidateRecord as Record<string, unknown>,
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

    const results: T[] = [];
    for (const item of subjects) {
      if (!item) continue;
      try {
        results.push(
          abilityOrBypass !== undefined
            ? this.authorize<T>(abilityOrBypass, action, item)
            : this.authorize<T>(action, item),
        );
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
   * Separates the leading ability/bypass argument from the call arguments.
   *
   * Unsupported shapes are rejected rather than inferred because an ambiguous
   * authorization call must never be converted into a different permission check.
   */
  private splitAbilityArgument(
    args: unknown[],
    unsupportedMessage: string,
  ): { ability?: AppAbility; explicitBypass: boolean; args: unknown[] } {
    const [first, ...rest] = args;

    if (typeof first === 'string') {
      return {
        ability: this.ability ?? getCaslAbility(),
        explicitBypass: false,
        args,
      };
    }
    if (isAppAbility(first)) {
      return { ability: first, explicitBypass: false, args: rest };
    }
    if (isBypassContext(first)) {
      return { explicitBypass: true, args: rest };
    }
    throw new TypeError(unsupportedMessage);
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

    // A value already tagged by CASL's `subject()` carries its own type; the
    // constructor of such a plain object is `Object`, which would otherwise
    // check an unrelated subject type and silently allow or deny.
    const tagged = (subject as { __caslSubjectType__?: unknown })
      .__caslSubjectType__;
    const subjectType =
      typeof tagged === 'string' && tagged.length > 0
        ? tagged
        : subject.constructor?.name && subject.constructor.name !== 'Object'
          ? subject.constructor.name
          : 'Object';

    const entityRecord = toSnapshot(subject) as Record<string, unknown>;

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
 * Cache policies use this to detect that entity attributes can alter an
 * authorization decision, which requires bypassing a response cache. Pass
 * `action` to ignore rules that cannot affect that action; rules for `manage`
 * always count. A subject list containing `'all'` matches every rule.
 */
export function hasEntityConditions(
  ability: AppAbility,
  subjects: readonly string[],
  action?: string,
): boolean {
  const wanted = new Set(subjects);
  const asList = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [value];

  return ability.rules.some((rule) => {
    const conditions: unknown = rule.conditions;
    const conditional =
      typeof conditions === 'function' ||
      (typeof conditions === 'object' &&
        conditions !== null &&
        Object.keys(conditions).length > 0);
    if (!conditional) return false;

    if (
      action !== undefined &&
      !asList(rule.action).some((a) => a === action || a === 'manage')
    ) {
      return false;
    }

    return asList(rule.subject).some(
      (s) =>
        typeof s === 'string' &&
        (s === 'all' || wanted.has('all') || wanted.has(s)),
    );
  });
}
