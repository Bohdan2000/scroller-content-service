import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { MuxModule } from './mux/mux.module';
import { HealthModule } from './health/health.module';
import { VideosModule } from './videos/videos.module';
import { WebhookModule } from './webhook/webhook.module';
import { EventsModule } from './events/events.module';
import { JwtAccessStrategy } from './common/strategies/jwt-access.strategy';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      expandVariables: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    PrismaModule,
    MuxModule,
    EventsModule,
    HealthModule,
    VideosModule,
    WebhookModule,
  ],
  providers: [JwtAccessStrategy],
})
export class AppModule {}
