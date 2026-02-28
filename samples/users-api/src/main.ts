import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const useFastify = process.env['ADAPTER'] === 'fastify';

  const app = useFastify
    ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
    : await NestFactory.create(AppModule);

  await app.listen(3000, '0.0.0.0');
  console.log(
    `Users API running on http://localhost:3000 (adapter: ${useFastify ? 'fastify' : 'express'})`,
  );
}

bootstrap();
