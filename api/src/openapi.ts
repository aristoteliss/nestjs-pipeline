/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HEADERS } from './common/constants/headers.constants.js';

// Preview mode builds the module graph without instantiating providers, so no
// database, Redis or other external system is contacted.
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
const app = await NestFactory.create(AppModule, {
  preview: true,
  logger: false,
});
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder()
    .setTitle('users-api')
    .setDescription(
      [
        'The example application of nestjs-pipeline: users, roles and sessions behind the pipeline behaviors.',
        '',
        `Every request names its tenant in \`${HEADERS.TENANT_SCHEMA}\`. The users and roles routes accept the access token of \`POST /auths/login\` as a Bearer token, an API client's \`${HEADERS.API_ID}\` and \`${HEADERS.API_KEY}\` headers, or, with the Fastify adapter, the \`session\` cookie.`,
      ].join('\n'),
    )
    .setVersion(version)
    .addGlobalParameters({
      in: 'header',
      name: HEADERS.TENANT_SCHEMA,
      required: true,
      description: 'The tenant of the request.',
      schema: { type: 'string' },
    })
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: HEADERS.API_ID }, 'api-id')
    .addApiKey(
      { type: 'apiKey', in: 'header', name: HEADERS.API_KEY },
      'api-key',
    )
    .addCookieAuth('session')
    .build(),
);
await app.close();

const [path = 'dist/openapi.json'] = process.argv.slice(2);
writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI document written to ${path}`);
