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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */
import './tracing'; // ← MUST be first: starts the OTel SDK before NestJS loads
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ZodValidationFilter } from '@nestjs-pipeline/zod';

async function bootstrap() {
  const useFastify = process.env['ADAPTER'] === 'fastify';

  const app = useFastify
    ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
    : await NestFactory.create(AppModule);

  app.useGlobalFilters(new ZodValidationFilter());

  await app.listen(3000, '0.0.0.0');
  console.log(
    `Users API running on http://localhost:3000 (adapter: ${useFastify ? 'fastify' : 'express'})`,
  );
}

bootstrap();
