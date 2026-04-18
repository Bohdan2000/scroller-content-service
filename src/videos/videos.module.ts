import { Module } from '@nestjs/common';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { JwtAccessGuard } from '../common/guards/jwt-access.guard';

@Module({
  controllers: [VideosController],
  providers: [VideosService, JwtAccessGuard],
  exports: [VideosService],
})
export class VideosModule {}
