import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAccessGuard } from '../common/guards/jwt-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadUrlResponseDto } from './dto/upload-url-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAccessGuard)
@Controller()
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  // ─── POST /videos ──────────────────────────────────────────────────────────

  @Post('videos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new video in DRAFT status' })
  @ApiCreatedResponse({ type: VideoResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async create(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateVideoDto,
  ): Promise<VideoResponseDto> {
    return this.videosService.create(userId, dto);
  }

  // ─── GET /videos/:id ──────────────────────────────────────────────────────
  // Public endpoint — auth is optional. JwtAccessGuard skips due to @Public().
  // We manually attempt to extract the user from the request so that PRIVATE
  // videos can still be read by their author.

  @Public()
  @Get('videos/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a video by ID',
    description:
      'Public videos are accessible without authentication. ' +
      'Private videos are only accessible to the author.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') userId?: string,
  ): Promise<VideoResponseDto> {
    return this.videosService.getVideoById(id, userId);
  }

  // ─── PATCH /videos/:id ────────────────────────────────────────────────────

  @Patch('videos/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update video metadata' })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    return this.videosService.update(userId, id, dto);
  }

  // ─── DELETE /videos/:id ───────────────────────────────────────────────────

  @Delete('videos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a video' })
  @ApiNoContentResponse({ description: 'Video deleted successfully' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async delete(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.videosService.delete(userId, id);
  }

  // ─── POST /videos/:id/upload-url ──────────────────────────────────────────

  @Post('videos/:id/upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a Mux direct upload URL',
    description:
      'The video must be in DRAFT status. Returns a signed Mux upload URL. ' +
      'PUT your video file to this URL. The video transitions to UPLOADING.',
  })
  @ApiCreatedResponse({ type: UploadUrlResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async requestUploadUrl(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UploadUrlResponseDto> {
    return this.videosService.requestUploadUrl(userId, id);
  }

  // ─── POST /videos/:id/publish ─────────────────────────────────────────────

  @Post('videos/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a video',
    description: 'Video must be in READY status.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async publish(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return this.videosService.publish(userId, id);
  }

  // ─── POST /videos/:id/unpublish ───────────────────────────────────────────

  @Post('videos/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unpublish a video',
    description: 'Transitions the video from PUBLISHED back to READY.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async unpublish(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponseDto> {
    return this.videosService.unpublish(userId, id);
  }

  // ─── GET /me/videos ───────────────────────────────────────────────────────

  @Get('me/videos')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "List the authenticated user's videos" })
  @ApiOkResponse({ type: [VideoResponseDto] })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async getMyVideos(
    @CurrentUser('sub') userId: string,
  ): Promise<VideoResponseDto[]> {
    return this.videosService.getMyVideos(userId);
  }
}
