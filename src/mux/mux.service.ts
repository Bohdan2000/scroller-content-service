import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mux from '@mux/mux-node';
import { MuxWebhookInvalidSignatureException } from '../common/exceptions/domain.exceptions';

type MuxInstance = InstanceType<typeof Mux>;

@Injectable()
export class MuxService {
  private readonly logger = new Logger(MuxService.name);
  private readonly mux: MuxInstance;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.mux = new Mux({
      tokenId: config.getOrThrow<string>('mux.tokenId'),
      tokenSecret: config.getOrThrow<string>('mux.tokenSecret'),
    });
    this.webhookSecret = config.getOrThrow<string>('mux.webhookSecret');
  }

  /**
   * Create a Mux direct upload URL.
   * The caller supplies the CORS origin (usually the API gateway or configured value).
   */
  async createDirectUpload(
    corsOrigin: string,
  ): Promise<{ uploadId: string; uploadUrl: string }> {
    const upload = await this.mux.video.uploads.create({
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: ['public'],
      },
    });

    this.logger.debug(`Mux direct upload created: ${upload.id}`);

    return { uploadId: upload.id, uploadUrl: upload.url };
  }

  /**
   * Verify a Mux webhook signature.
   * Throws MuxWebhookInvalidSignatureException if the signature is invalid.
   * @param rawBody  The raw request body as a Buffer.
   * @param headers  The request headers as a plain object.
   */
  verifyWebhookSignature(
    rawBody: Buffer | undefined,
    headers: Record<string, string>,
  ): void {
    if (!rawBody) {
      throw new MuxWebhookInvalidSignatureException();
    }
    try {
      this.mux.webhooks.verifySignature(rawBody.toString('utf8'), headers, this.webhookSecret);
    } catch (err) {
      this.logger.warn(
        `Mux webhook signature verification failed: ${(err as Error).message}`,
      );
      throw new MuxWebhookInvalidSignatureException();
    }
  }

  /**
   * Retrieve a Mux asset by its asset ID.
   */
  async getAsset(muxAssetId: string): Promise<Mux.Video.Asset> {
    return this.mux.video.assets.retrieve(muxAssetId);
  }
}
