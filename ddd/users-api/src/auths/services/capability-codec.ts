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

import {
  type Capability,
  type CapabilityString,
  normalizeCapability,
  serializeCapability,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';

/**
 * Shared codec for encoding, decoding, and normalizing UserCapabilities
 * across JWT authenticator, API client authenticator, and login token generation.
 */
export class CapabilityCodec {
  /**
   * Encodes an array of capabilities (objects or compact strings) into compact serialized capability strings.
   * Throws a TypeError if any item is malformed.
   */
  static serializeArray(input: unknown): CapabilityString[] | undefined {
    if (!Array.isArray(input)) return undefined;

    const compact = input
      .map((cap) => {
        if (typeof cap === 'string' || (cap && typeof cap === 'object')) {
          return serializeCapability(
            normalizeCapability(cap as Capability | CapabilityString),
          );
        }
        throw new TypeError(
          'Capabilities must be compact strings or capability objects.',
        );
      })
      .filter((cap): cap is CapabilityString => typeof cap === 'string');

    return compact.length > 0 ? compact : undefined;
  }

  /**
   * Serializes an optional list of capabilities into compact string representation for tokens.
   */
  static toCompact(
    caps: Array<Capability | CapabilityString> | undefined,
  ): CapabilityString[] {
    return (caps ?? []).map((cap) =>
      serializeCapability(normalizeCapability(cap)),
    );
  }

  /**
   * Extracts and compacts user capabilities from raw claims, headers, or request payloads.
   */
  static compactUserCapabilities(input: unknown): UserCapabilities | undefined {
    if (!input || typeof input !== 'object') return undefined;

    const raw = input as {
      roles?: string[] | unknown;
      additionalCapabilities?: Array<Capability | CapabilityString | unknown>;
      deniedCapabilities?: Array<Capability | CapabilityString | unknown>;
    };

    const roles = Array.isArray(raw.roles)
      ? raw.roles.filter((r): r is string => typeof r === 'string')
      : [];

    const additionalCapabilities = CapabilityCodec.serializeArray(
      raw.additionalCapabilities,
    );
    const deniedCapabilities = CapabilityCodec.serializeArray(
      raw.deniedCapabilities,
    );

    if (roles.length === 0 && !additionalCapabilities && !deniedCapabilities) {
      return undefined;
    }

    return {
      roles,
      additionalCapabilities,
      deniedCapabilities,
    };
  }
}
