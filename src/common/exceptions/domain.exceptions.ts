import { HttpException, HttpStatus } from '@nestjs/common';

// ─── Base ─────────────────────────────────────────────────────────────────────

export class DomainException extends HttpException {
  constructor(
    message: string,
    statusCode: HttpStatus,
    public readonly code: string,
  ) {
    super({ message, code, statusCode }, statusCode);
  }
}

// ─── Video exceptions ─────────────────────────────────────────────────────────

/**
 * CONTENT_001 — 404
 * The requested video does not exist.
 */
export class VideoNotFoundException extends DomainException {
  constructor() {
    super('Video not found', HttpStatus.NOT_FOUND, 'CONTENT_001');
  }
}

/**
 * CONTENT_002 — 403
 * The requesting user does not own this video.
 */
export class VideoForbiddenException extends DomainException {
  constructor() {
    super(
      'You do not have permission to access this video',
      HttpStatus.FORBIDDEN,
      'CONTENT_002',
    );
  }
}

/**
 * CONTENT_003 — 409
 * Attempted to publish a video that is not yet in READY status.
 */
export class VideoNotReadyException extends DomainException {
  constructor() {
    super(
      'Video must be in READY status before it can be published',
      HttpStatus.CONFLICT,
      'CONTENT_003',
    );
  }
}

/**
 * CONTENT_004 — 409
 * Attempted to publish a video that is already published.
 */
export class VideoAlreadyPublishedException extends DomainException {
  constructor() {
    super('Video is already published', HttpStatus.CONFLICT, 'CONTENT_004');
  }
}

/**
 * CONTENT_005 — 409
 * Attempted to unpublish a video that is already in DRAFT/READY status.
 */
export class VideoAlreadyDraftException extends DomainException {
  constructor() {
    super(
      'Video is already unpublished',
      HttpStatus.CONFLICT,
      'CONTENT_005',
    );
  }
}

/**
 * CONTENT_006 — 422
 * The requested status transition is not allowed.
 */
export class InvalidVideoStatusTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(
      `Invalid video status transition from ${from} to ${to}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CONTENT_006',
    );
  }
}

/**
 * CONTENT_007 — 401
 * The Mux webhook signature header is invalid or missing.
 */
export class MuxWebhookInvalidSignatureException extends DomainException {
  constructor() {
    super(
      'Invalid Mux webhook signature',
      HttpStatus.UNAUTHORIZED,
      'CONTENT_007',
    );
  }
}

/**
 * CONTENT_008 — 409
 * A Mux upload URL has already been issued for this video and has not been used yet.
 */
export class UploadUrlAlreadyIssuedException extends DomainException {
  constructor() {
    super(
      'An upload URL has already been issued for this video and is still pending',
      HttpStatus.CONFLICT,
      'CONTENT_008',
    );
  }
}
