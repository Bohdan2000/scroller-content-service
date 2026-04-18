import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [VideosModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
