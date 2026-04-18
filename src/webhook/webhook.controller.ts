import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { Public } from '../common/decorators/public.decorator';
import { MuxService } from '../mux/mux.service';
import { VideosService } from '../videos/videos.service';

/**
 * Shape of the Mux webhook event body.
 * We only type the fields we actually consume; remaining fields are unknown.
 */
interface MuxWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

@ApiTags('webhooks')
@Public()
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly mux: MuxService,
    private readonly videos: VideosService,
  ) {}

  /**
   * POST /webhooks/mux
   *
   * Receives Mux video lifecycle events.
   *
   * IMPORTANT: Signature verification requires the raw request body (not the
   * parsed JSON). main.ts registers a custom content-type parser that stores
   * the raw buffer at `req.rawBody` before handing the parsed JSON to NestJS.
   */
  @Post('mux')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mux webhook receiver',
    description:
      'Receives Mux video events. Signature is verified via the mux-webhook-secret.',
  })
  async handleMuxWebhook(@Req() req: RawBodyRequest<FastifyRequest>): Promise<void> {
    // rawBody is populated by NestJS when the app is created with { rawBody: true }
    const rawBody = req.rawBody;

    // 2. Verify the Mux webhook signature — throws MuxWebhookInvalidSignatureException on failure
    this.mux.verifyWebhookSignature(rawBody, req.headers as Record<string, string>);

    // 3. Parse the event from the already-deserialized body
    const event = req.body as MuxWebhookEvent;

    this.logger.debug(`Mux webhook received: type=${event.type}`);

    // 4. Route to the appropriate handler
    await this.routeEvent(event);
  }

  // ─── Private routing ────────────────────────────────────────────────────────

  private async routeEvent(event: MuxWebhookEvent): Promise<void> {
    switch (event.type) {
      case 'video.upload.asset_created':
        await this.handleUploadAssetCreated(event.data);
        break;

      case 'video.asset.ready':
        await this.handleAssetReady(event.data);
        break;

      case 'video.asset.errored':
        await this.handleAssetErrored(event.data);
        break;

      case 'video.upload.cancelled':
        await this.handleUploadCancelled(event.data);
        break;

      default:
        this.logger.debug(`Unhandled Mux event type: ${event.type}`);
        break;
    }
  }

  /**
   * video.upload.asset_created
   * Payload shape: { id: muxUploadId, asset_id: muxAssetId, ... }
   */
  private async handleUploadAssetCreated(
    data: Record<string, unknown>,
  ): Promise<void> {
    const muxUploadId = data['id'] as string;
    const muxAssetId = data['asset_id'] as string;

    if (!muxUploadId || !muxAssetId) {
      this.logger.warn(
        `video.upload.asset_created: missing id or asset_id in payload`,
      );
      return;
    }

    await this.videos.handleUploadAssetCreated(muxUploadId, muxAssetId);
  }

  /**
   * video.asset.ready
   * Payload shape: { id: muxAssetId, playback_ids: [{ id: playbackId }], duration: number, ... }
   */
  private async handleAssetReady(
    data: Record<string, unknown>,
  ): Promise<void> {
    const muxAssetId = data['id'] as string;

    if (!muxAssetId) {
      this.logger.warn(`video.asset.ready: missing id in payload`);
      return;
    }

    // Extract first public playback ID
    const playbackIds = data['playback_ids'] as
      | Array<{ id: string; policy: string }>
      | undefined;
    const playbackId =
      playbackIds?.find((p) => p.policy === 'public')?.id ??
      playbackIds?.[0]?.id ??
      null;

    // Duration comes as a floating-point number of seconds from Mux
    const durationRaw = data['duration'];
    const durationSec =
      typeof durationRaw === 'number' ? Math.round(durationRaw) : null;

    await this.videos.handleAssetReady(muxAssetId, playbackId, durationSec);
  }

  /**
   * video.asset.errored
   * Payload shape: { id: muxAssetId, errors: { messages: string[] }, ... }
   */
  private async handleAssetErrored(
    data: Record<string, unknown>,
  ): Promise<void> {
    const muxAssetId = data['id'] as string;

    if (!muxAssetId) {
      this.logger.warn(`video.asset.errored: missing id in payload`);
      return;
    }

    const errors = data['errors'] as
      | { messages?: string[] }
      | undefined;
    const errorMessage =
      errors?.messages?.join('; ') ?? 'Unknown Mux processing error';

    await this.videos.handleAssetErrored(muxAssetId, errorMessage);
  }

  /**
   * video.upload.cancelled
   * Payload shape: { id: muxUploadId, ... }
   */
  private async handleUploadCancelled(
    data: Record<string, unknown>,
  ): Promise<void> {
    const muxUploadId = data['id'] as string;

    if (!muxUploadId) {
      this.logger.warn(`video.upload.cancelled: missing id in payload`);
      return;
    }

    await this.videos.handleUploadCancelled(muxUploadId);
  }
}
