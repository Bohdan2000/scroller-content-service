import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap(): Promise<void> {
  // rawBody: true makes NestJS's FastifyAdapter register the JSON parser with
  // parseAs:'buffer' and store the original bytes at req.rawBody — required
  // for Mux webhook signature verification.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'test' }),
    { rawBody: true },
  );

  const config = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Content Service')
    .setDescription(
      'Video upload, processing, and management for the Scroller platform. ' +
      'Integrates with Mux for video hosting and streaming.',
    )
    .setVersion('1.0')
    .addTag('videos', 'Video management')
    .addTag('webhooks', 'Mux webhook receiver')
    .addTag('health', 'Service health')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Required for onModuleDestroy (PrismaService.$disconnect) to fire on
  // SIGTERM / SIGINT — e.g. docker stop, Kubernetes pod eviction
  app.enableShutdownHooks();

  const port = config.get<number>('port', 3003);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
