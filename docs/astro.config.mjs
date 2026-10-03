import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

export default defineConfig({
  site: 'https://aristoteliss.github.io',
  base: '/nestjs-pipeline',
  // The recipes import the example application's source files.
  vite: { server: { fs: { allow: ['..'] } } },
  integrations: [
    starlight({
      title: 'nestjs-pipeline',
      description:
        'Pipeline behaviors for NestJS CQRS, and framework-neutral DDD building blocks.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/aristoteliss/nestjs-pipeline',
        },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../packages/*'],
          tsconfig: '../tsconfig.base.json',
          output: 'api',
          sidebar: { label: 'API reference', collapsed: true },
          typeDoc: {
            entryPointStrategy: 'packages',
            entryFileName: 'index.md',
            packageOptions: { tsconfig: 'tsconfig.build.json', readme: 'none' },
            plugin: ['typedoc-plugin-mdn-links'],
            externalSymbolLinkMappings: {
              '@nestjs/common': {
                DynamicModule:
                  'https://docs.nestjs.com/fundamentals/dynamic-modules',
                Logger: 'https://docs.nestjs.com/techniques/logger',
                LoggerService: 'https://docs.nestjs.com/techniques/logger',
                LogLevel: 'https://docs.nestjs.com/techniques/logger',
              },
              '@openfeature/server-sdk': {
                Client:
                  'https://openfeature.dev/docs/reference/concepts/evaluation-api',
                Provider:
                  'https://openfeature.dev/docs/reference/concepts/provider',
              },
              '@openfeature/core': {
                EvaluationContext:
                  'https://openfeature.dev/docs/reference/concepts/evaluation-context',
              },
              '@mikro-orm/core': {
                EntityManager: 'https://mikro-orm.io/docs/entity-manager',
              },
              'cache-manager': {
                Cache:
                  'https://github.com/jaredwray/cacheable/tree/main/packages/cache-manager#readme',
              },
              cockatiel: {
                IPolicy: 'https://github.com/connor4312/cockatiel#readme',
              },
              zod: { 'ZodError.flatten': 'https://zod.dev/error-formatting' },
            },
          },
        }),
        starlightOpenAPI([
          {
            base: 'http-api',
            schema: '../api/dist/openapi.json',
            sidebar: {
              label: 'HTTP API',
              operations: { badges: true, labels: 'path' },
            },
          },
        ]),
        // starlight-openapi generates its routes, which are not content pages.
        starlightLinksValidator({
          exclude: [
            '/nestjs-pipeline/http-api/',
            '/nestjs-pipeline/http-api/**',
          ],
        }),
      ],
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'Overview', slug: 'overview' },
            { label: 'Getting started', slug: 'getting-started' },
            { label: 'Architecture', slug: 'concepts/architecture' },
          ],
        },
        {
          label: 'Concepts',
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        {
          label: 'Guides',
          items: [{ autogenerate: { directory: 'guides' } }],
        },
        {
          label: 'Recipes',
          items: [{ autogenerate: { directory: 'recipes' } }],
        },
        {
          label: '@nestjs-pipeline',
          items: [{ autogenerate: { directory: 'packages/nestjs-pipeline' } }],
        },
        {
          label: '@cqrs-ddd',
          items: [{ autogenerate: { directory: 'packages/cqrs-ddd' } }],
        },
        {
          label: 'Upgrading',
          collapsed: true,
          items: [
            { autogenerate: { directory: 'upgrading' } },
            {
              label: 'Release notes',
              items: [{ autogenerate: { directory: 'releases' } }],
            },
            { label: 'Changelog', slug: 'changelog' },
          ],
        },
        typeDocSidebarGroup,
        ...openAPISidebarGroups,
      ],
    }),
  ],
});
