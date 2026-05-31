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

import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { RoleCreatedEvent } from '../../domain/events/role-created.event';

@EventsHandler(RoleCreatedEvent)
export class RoleCreatedHandler implements IEventHandler<RoleCreatedEvent> {
  private readonly logger = new Logger(RoleCreatedHandler.name);

  async handle(event: RoleCreatedEvent): Promise<void> {
    const {
      entity: { id: roleId, name },
    } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] RoleCreated — id: ${roleId}, name: ${name}`,
    );
  }
}
