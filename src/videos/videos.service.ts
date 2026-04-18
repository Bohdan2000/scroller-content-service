import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Video,
  VideoStatus,
  UploadStatus,
  ProcessingStatus,
  VisibilityType,
} from '@prisma/client';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../prisma/prisma.service';
import { MuxService } from '../mux/mux.service';
import { SCROLLER_EXCHANGE, RoutingKeys } from '../events/events.constants';
import {
  VideoNotFoundException,
  VideoForbiddenException,
  VideoNotReadyException,
  VideoAlreadyPublishedException,
  VideoAlreadyDraftException,
  InvalidVideoStatusTransitionException,
  UploadUrlAlreadyIssuedException,
} from '../common/exceptions/domain.exceptions';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { UploadUrlResponseDto } from './dto/upload-url-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';

// ─── Allowed status transitions ───────────────────────────────────────────────
// Each key is the "from" state; the Set contains all valid "to" states.
const ALLOWED_TRANSITIONS: Record<VideoStatus, Set<VideoStatus>> = {
  [VideoStatus.DRAFT]: new Set([VideoStatus.UPLOADING]),
  [VideoStatus.UPLOADING]: new Set([VideoStatus.PROCESSING, VideoStatus.FAILED]),
  [VideoStatus.PROCESSING]: new Set([VideoStatus.READY, VideoStatus.FAILED]),
  [VideoStatus.READY]: new Set([VideoStatus.PUBLISHED, VideoStatus.FAILED]),
  [VideoStatus.PUBLISHED]: new Set([VideoStatus.READY]),
  [VideoStatus.FAILED]: new Set(),
};

// Type for the full video shape returned by Prisma with includes
type VideoWithRelations = Awaited<ReturnType<VideosService['fetchVideoWithRelations']>>;

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mux: MuxService,
    private readonly config: ConfigService,
    private readonly amqp: AmqpConnection,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create a new video in DRAFT status.
   * Also creates the VideoVisibilityRule and any VideoTopic associations.
   */
  async create(userId: string, dto: CreateVideoDto): Promise<VideoResponseDto> {
    const video = await this.prisma.video.create({
      data: {
        authorUserId: userId,
        title: dto.title,
        description: dto.description ?? null,
        status: VideoStatus.DRAFT,
        visibility: {
          create: {
            visibilityType: dto.visibility ?? VisibilityType.PUBLIC,
            groupId: dto.groupId ?? null,
          },
        },
        topics: dto.topicIds?.length
          ? {
              createMany: {
                data: dto.topicIds.map((topicId) => ({ topicId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        asset: true,
        topics: true,
        visibility: true,
      },
    });

    this.logger.debug(`Video created: ${video.id} by user ${userId}`);
    return this.toResponseDto(video);
  }

  /**
   * Request a Mux direct upload URL for a video in DRAFT status.
   * Transitions the video to UPLOADING and stores the muxUploadId on the VideoAsset.
   * Throws UploadUrlAlreadyIssuedException if an asset already has a pending upload.
   */
  async requestUploadUrl(
    userId: string,
    videoId: string,
    corsOrigin?: string,
  ): Promise<UploadUrlResponseDto> {
    const video = await this.fetchVideoWithRelations(videoId);
    this.assertOwnership(video, userId);

    // Allow re-requesting only from DRAFT; if already UPLOADING with a pending
    // muxUploadId, guard against double-issue.
    if (video.status === VideoStatus.UPLOADING && video.asset?.muxUploadId) {
      throw new UploadUrlAlreadyIssuedException();
    }

    this.assertTransition(video.status, VideoStatus.UPLOADING);

    const origin =
      corsOrigin ?? this.config.get<string>('corsOrigin', 'http://localhost:3000');

    const { uploadId, uploadUrl } = await this.mux.createDirectUpload(origin);

    // Create or update the VideoAsset record with the new upload ID
    await this.prisma.videoAsset.upsert({
      where: { videoId },
      create: {
        videoId,
        muxUploadId: uploadId,
        uploadStatus: UploadStatus.PENDING,
        processingStatus: ProcessingStatus.WAITING,
      },
      update: {
        muxUploadId: uploadId,
        uploadStatus: UploadStatus.PENDING,
        processingStatus: ProcessingStatus.WAITING,
        errorMessage: null,
      },
    });

    // Transition to UPLOADING
    await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.UPLOADING },
    });

    this.logger.debug(
      `Upload URL issued for video ${videoId}: muxUploadId=${uploadId}`,
    );

    return { uploadUrl, muxUploadId: uploadId };
  }

  /**
   * Fetch a single video by ID.
   * Access control:
   *  - PUBLIC videos are accessible without auth.
   *  - PRIVATE videos are only accessible to the author.
   *  - GROUP_ONLY videos: for now treated the same as PUBLIC (group membership
   *    check is out of scope — see TODO below).
   * @param requestingUserId  Optional; pass when the caller is authenticated.
   */
  async getVideoById(
    videoId: string,
    requestingUserId?: string,
  ): Promise<VideoResponseDto> {
    const video = await this.fetchVideoWithRelations(videoId);

    const visibilityType =
      video.visibility?.visibilityType ?? VisibilityType.PUBLIC;

    if (visibilityType === VisibilityType.PRIVATE) {
      // Private videos are only visible to the author
      if (!requestingUserId || video.authorUserId !== requestingUserId) {
        throw new VideoNotFoundException();
      }
    }

    // TODO: GROUP_ONLY — verify the requesting user is a member of video.visibility.groupId
    //       by calling the social-service or reading a local membership cache.
    //       For now, GROUP_ONLY videos are treated as publicly readable.

    return this.toResponseDto(video);
  }

  /**
   * List all videos belonging to the authenticated user, ordered by newest first.
   */
  async getMyVideos(userId: string): Promise<VideoResponseDto[]> {
    const videos = await this.prisma.video.findMany({
      where: { authorUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: true,
        topics: true,
        visibility: true,
      },
    });

    return videos.map((v) => this.toResponseDto(v));
  }

  /**
   * Update video metadata (title, description, topics, visibility).
   * Topics and visibility are fully replaced when provided.
   */
  async update(
    userId: string,
    videoId: string,
    dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.fetchVideoWithRelations(videoId);
    this.assertOwnership(video, userId);

    await this.prisma.$transaction(async (tx) => {
      // Update scalar fields
      await tx.video.update({
        where: { id: videoId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
      });

      // Replace topic associations if provided
      if (dto.topicIds !== undefined) {
        await tx.videoTopic.deleteMany({ where: { videoId } });
        if (dto.topicIds.length > 0) {
          await tx.videoTopic.createMany({
            data: dto.topicIds.map((topicId) => ({ videoId, topicId })),
            skipDuplicates: true,
          });
        }
      }

      // Update visibility rule if provided
      if (dto.visibility !== undefined || dto.groupId !== undefined) {
        await tx.videoVisibilityRule.upsert({
          where: { videoId },
          create: {
            videoId,
            visibilityType: dto.visibility ?? VisibilityType.PUBLIC,
            groupId: dto.groupId ?? null,
          },
          update: {
            ...(dto.visibility !== undefined && { visibilityType: dto.visibility }),
            ...(dto.groupId !== undefined && { groupId: dto.groupId }),
          },
        });
      }
    });

    return this.getVideoById(videoId, userId);
  }

  /**
   * Publish a video. The video must be in READY status and owned by the caller.
   * Emits a `video.published` domain event.
   */
  async publish(userId: string, videoId: string): Promise<VideoResponseDto> {
    const video = await this.fetchVideoWithRelations(videoId);
    this.assertOwnership(video, userId);

    if (video.status === VideoStatus.PUBLISHED) {
      throw new VideoAlreadyPublishedException();
    }

    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }

    this.assertTransition(video.status, VideoStatus.PUBLISHED);

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.PUBLISHED },
      include: { asset: true, topics: true, visibility: true },
    });

    await this.emitEvent(RoutingKeys.VIDEO_PUBLISHED, {
      videoId,
      authorUserId: userId,
      title: updated.title,
      topicIds: updated.topics.map((t) => t.topicId),
      visibility: updated.visibility?.visibilityType ?? VisibilityType.PUBLIC,
      publishedAt: new Date().toISOString(),
    });

    return this.toResponseDto(updated);
  }

  /**
   * Unpublish a video (transitions PUBLISHED → READY).
   * Emits a `video.unpublished` domain event.
   */
  async unpublish(userId: string, videoId: string): Promise<VideoResponseDto> {
    const video = await this.fetchVideoWithRelations(videoId);
    this.assertOwnership(video, userId);

    if (video.status !== VideoStatus.PUBLISHED) {
      throw new VideoAlreadyDraftException();
    }

    this.assertTransition(video.status, VideoStatus.READY);

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.READY },
      include: { asset: true, topics: true, visibility: true },
    });

    await this.emitEvent(RoutingKeys.VIDEO_UNPUBLISHED, { videoId, authorUserId: userId });

    return this.toResponseDto(updated);
  }

  /**
   * Hard-delete a video (cascades to VideoAsset, VideoTopics, VideoVisibilityRule).
   * Emits a `video.deleted` domain event.
   */
  async delete(userId: string, videoId: string): Promise<void> {
    const video = await this.fetchVideoWithRelations(videoId);
    this.assertOwnership(video, userId);

    await this.prisma.video.delete({ where: { id: videoId } });

    await this.emitEvent(RoutingKeys.VIDEO_DELETED, { videoId, authorUserId: userId });

    this.logger.debug(`Video ${videoId} deleted by user ${userId}`);
  }

  // ─── Webhook handlers ────────────────────────────────────────────────────────

  /**
   * Called when Mux fires `video.upload.asset_created`.
   * Links the newly-created Mux asset to the video and transitions status → PROCESSING.
   */
  async handleUploadAssetCreated(
    muxUploadId: string,
    muxAssetId: string,
  ): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { muxUploadId },
    });

    if (!asset) {
      this.logger.warn(
        `handleUploadAssetCreated: no VideoAsset found for muxUploadId=${muxUploadId}`,
      );
      return;
    }

    await this.prisma.videoAsset.update({
      where: { muxUploadId },
      data: {
        muxAssetId,
        uploadStatus: UploadStatus.ASSET_CREATED,
        processingStatus: ProcessingStatus.PREPARING,
      },
    });

    const video = await this.prisma.video.findUnique({
      where: { id: asset.videoId },
    });

    if (!video) {
      this.logger.warn(
        `handleUploadAssetCreated: no Video found for videoId=${asset.videoId}`,
      );
      return;
    }

    // Only transition if still in UPLOADING (idempotency guard)
    if (video.status === VideoStatus.UPLOADING) {
      this.assertTransition(video.status, VideoStatus.PROCESSING);
      await this.prisma.video.update({
        where: { id: asset.videoId },
        data: { status: VideoStatus.PROCESSING },
      });
    }

    this.logger.debug(
      `Asset created: muxAssetId=${muxAssetId} linked to videoId=${asset.videoId}`,
    );
  }

  /**
   * Called when Mux fires `video.asset.ready`.
   * Updates playbackId, durationSec, processingStatus and transitions video → READY.
   */
  async handleAssetReady(
    muxAssetId: string,
    playbackId: string | null,
    durationSec: number | null,
  ): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { muxAssetId },
    });

    if (!asset) {
      this.logger.warn(
        `handleAssetReady: no VideoAsset found for muxAssetId=${muxAssetId}`,
      );
      return;
    }

    await this.prisma.videoAsset.update({
      where: { muxAssetId },
      data: {
        playbackId,
        processingStatus: ProcessingStatus.READY,
      },
    });

    const video = await this.prisma.video.findUnique({
      where: { id: asset.videoId },
    });

    if (!video) {
      this.logger.warn(
        `handleAssetReady: no Video found for videoId=${asset.videoId}`,
      );
      return;
    }

    // Only transition if still in PROCESSING
    if (video.status === VideoStatus.PROCESSING) {
      this.assertTransition(video.status, VideoStatus.READY);
      await this.prisma.video.update({
        where: { id: asset.videoId },
        data: {
          status: VideoStatus.READY,
          ...(durationSec !== null && { durationSec }),
        },
      });
    }

    this.logger.debug(
      `Asset ready: muxAssetId=${muxAssetId}, videoId=${asset.videoId}, playbackId=${playbackId}`,
    );
  }

  /**
   * Called when Mux fires `video.asset.errored`.
   * Sets processingStatus to ERRORED and transitions video → FAILED.
   */
  async handleAssetErrored(
    muxAssetId: string,
    errorMessage: string,
  ): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { muxAssetId },
    });

    if (!asset) {
      this.logger.warn(
        `handleAssetErrored: no VideoAsset found for muxAssetId=${muxAssetId}`,
      );
      return;
    }

    await this.prisma.videoAsset.update({
      where: { muxAssetId },
      data: {
        processingStatus: ProcessingStatus.ERRORED,
        errorMessage,
      },
    });

    await this.prisma.video.update({
      where: { id: asset.videoId },
      data: { status: VideoStatus.FAILED },
    });

    this.logger.warn(
      `Asset errored: muxAssetId=${muxAssetId}, videoId=${asset.videoId}, error=${errorMessage}`,
    );
  }

  /**
   * Called when Mux fires `video.upload.cancelled`.
   * Marks the upload as FAILED and transitions the video → FAILED.
   */
  async handleUploadCancelled(muxUploadId: string): Promise<void> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { muxUploadId },
    });

    if (!asset) {
      this.logger.warn(
        `handleUploadCancelled: no VideoAsset found for muxUploadId=${muxUploadId}`,
      );
      return;
    }

    await this.prisma.videoAsset.update({
      where: { muxUploadId },
      data: {
        uploadStatus: UploadStatus.FAILED,
        errorMessage: 'Upload was cancelled',
      },
    });

    await this.prisma.video.update({
      where: { id: asset.videoId },
      data: { status: VideoStatus.FAILED },
    });

    this.logger.warn(
      `Upload cancelled: muxUploadId=${muxUploadId}, videoId=${asset.videoId}`,
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fetch a video with all relations. Throws VideoNotFoundException if not found.
   */
  private async fetchVideoWithRelations(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        asset: true,
        topics: true,
        visibility: true,
      },
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    return video;
  }

  /**
   * Assert that the requesting user is the owner of the video.
   * Throws VideoForbiddenException if not.
   */
  private assertOwnership(
    video: Pick<Video, 'authorUserId'>,
    userId: string,
  ): void {
    if (video.authorUserId !== userId) {
      throw new VideoForbiddenException();
    }
  }

  /**
   * Assert that a status transition is in the allowed set.
   * Throws InvalidVideoStatusTransitionException if the transition is invalid.
   */
  private assertTransition(from: VideoStatus, to: VideoStatus): void {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.has(to)) {
      throw new InvalidVideoStatusTransitionException(from, to);
    }
  }

  /**
   * Publish a domain event to the scroller topic exchange.
   * The routing key is the event name (e.g. "video.published").
   */
  private async emitEvent(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.amqp.publish(SCROLLER_EXCHANGE, routingKey, payload);
      this.logger.debug(`[EVENT] ${routingKey}: ${JSON.stringify(payload)}`);
    } catch (err) {
      // Log and swallow — event emission must not fail the primary operation
      this.logger.error(
        `Failed to publish event ${routingKey}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Map a Prisma video (with relations) to the response DTO shape.
   */
  private toResponseDto(video: VideoWithRelations): VideoResponseDto {
    return {
      id: video.id,
      authorUserId: video.authorUserId,
      title: video.title,
      description: video.description ?? null,
      status: video.status,
      durationSec: video.durationSec ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      asset: video.asset
        ? {
            id: video.asset.id,
            videoId: video.asset.videoId,
            muxAssetId: video.asset.muxAssetId ?? null,
            muxUploadId: video.asset.muxUploadId ?? null,
            playbackId: video.asset.playbackId ?? null,
            uploadStatus: video.asset.uploadStatus,
            processingStatus: video.asset.processingStatus,
            errorMessage: video.asset.errorMessage ?? null,
            createdAt: video.asset.createdAt,
            updatedAt: video.asset.updatedAt,
          }
        : null,
      topics: video.topics.map((t) => ({
        id: t.id,
        videoId: t.videoId,
        topicId: t.topicId,
      })),
      visibility: video.visibility
        ? {
            id: video.visibility.id,
            videoId: video.visibility.videoId,
            visibilityType: video.visibility.visibilityType,
            groupId: video.visibility.groupId ?? null,
          }
        : null,
    };
  }
}
