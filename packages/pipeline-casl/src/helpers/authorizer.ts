/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { subject as caslSubject } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { CASL_ABILITY_KEY, CASL_PRINCIPAL_KEY } from '../constants/tokens';
import { UnauthorizedActionException } from '../errors/unauthorized-action.exception';
import type { CaslPrincipal } from '../interfaces/permission-source.interface';
import type { AppAbility, Projected } from '../types/casl.types';
import { projectPermittedFields } from './projection';

/** The ability `CaslBehavior` built for the current pipeline execution. */
export function getCaslAbility(
  context?: IPipelineContext,
): AppAbility | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_ABILITY_KEY) as AppAbility | undefined;
}

/** The principal that ability was built for; derive security-scoped keys from it. */
export function getCaslPrincipal(
  context?: IPipelineContext,
): CaslPrincipal | undefined {
  const ctx = context ?? pipelineStore.getStore();
  return ctx?.items.get(CASL_PRINCIPAL_KEY) as CaslPrincipal | undefined;
}

/**
 * Entity- and field-level authorization against the request ability.
 *
 * Uses the constructor ability, else the ambient ability stored by
 * `CaslBehavior`. A missing ability denies.
 *
 * @example
 * ```ts
 * const user = await this.users.findById(command.id);
 * this.authorizer.authorize('update', user, ['username']);
 * user.update(command.changes);
 *
 * return this.authorizer.project('read', user, { id: user.id, email: user.email });
 * ```
 */
@Injectable()
export class CaslAuthorizer {
  constructor(private readonly ability?: AppAbility) {}

  /**
   * True when `action` is permitted on `subject` (and `field`, when given).
   * Field checks use CASL field matching, unlike {@link project}: a grant of
   * `fields: ['profile']` does not permit `'profile.secret'`; grant
   * `'profile.*'` or `'profile.**'` to cover nested fields.
   */
  can(action: string, subject: object | string, field?: string): boolean {
    const ability = this.ability ?? getCaslAbility();
    if (!ability) return false;
    const { typedSubject } = resolveSubject(subject);
    return field
      ? ability.can(action, typedSubject, field)
      : ability.can(action, typedSubject);
  }

  /**
   * Throws `UnauthorizedActionException` unless `action` is permitted on
   * `subject` and every listed field. Fields use CASL field matching, as in
   * {@link can}.
   */
  authorize(
    action: string,
    subject: object | string,
    fields?: readonly string[],
  ): void {
    const { ability, subjectType, entityId, typedSubject } = this.permitted(
      action,
      subject,
    );
    for (const field of fields ?? []) {
      if (!ability.can(action, typedSubject, field)) {
        throw denied(action, subjectType, entityId, ` field "${field}"`, [
          field,
        ]);
      }
    }
  }

  /**
   * Asserts `action` on `subject`, then returns the `candidate` fields the
   * ability permits. Conditions use `subject`, never `candidate`.
   */
  project<TCandidate extends object>(
    action: string,
    subject: object | string,
    candidate: TCandidate,
  ): Projected<TCandidate> {
    if (!candidate || typeof candidate !== 'object') {
      throw new TypeError(
        'CaslAuthorizer.project() requires a candidate object.',
      );
    }
    const { ability, typedSubject } = this.permitted(action, subject);
    return projectPermittedFields(
      ability,
      action,
      typedSubject,
      toSnapshot(candidate) as Record<string, unknown> | unknown[],
    ) as Projected<TCandidate>;
  }

  private permitted(action: string, subject: object | string) {
    const ability = this.ability ?? getCaslAbility();
    const resolved = resolveSubject(subject);
    if (!ability) {
      throw denied(
        action,
        resolved.subjectType,
        resolved.entityId,
        ' (no authorization ability present in context)',
      );
    }
    if (!ability.can(action, resolved.typedSubject)) {
      throw denied(action, resolved.subjectType, resolved.entityId, '');
    }
    return { ability, ...resolved };
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

function toSnapshot(value: unknown): unknown {
  return typeof (value as { toJSON?: unknown } | null)?.toJSON === 'function'
    ? (value as { toJSON: () => unknown }).toJSON()
    : value;
}

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

function resolveSubject(subject: object | string): {
  subjectType: string;
  entityId?: string | number;
  typedSubject: string;
} {
  if (typeof subject === 'string') {
    return { subjectType: subject, typedSubject: subject };
  }

  // A value tagged by CASL's `subject()` is a plain object whose constructor
  // is `Object`; its tag is the only reliable subject type.
  const tagged = (subject as { __caslSubjectType__?: unknown })
    .__caslSubjectType__;
  const subjectType =
    typeof tagged === 'string' && tagged.length > 0
      ? tagged
      : subject.constructor?.name && subject.constructor.name !== 'Object'
        ? subject.constructor.name
        : 'Object';

  const record = toSnapshot(subject) as Record<string, unknown>;
  const entityId =
    (subject as { id?: string | number }).id ??
    (record?.id as string | number | undefined);
  const typedSubject = caslSubject(subjectType, {
    ...record,
  }) as unknown as string;

  return { subjectType, entityId, typedSubject };
}
