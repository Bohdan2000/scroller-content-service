import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProcessingStatus,
  UploadStatus,
  VideoStatus,
  VisibilityType,
} from '@prisma/client';

export class VideoAssetResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  videoId: string;

  @ApiPropertyOptional({ example: 'K02aFQR8NxeKrpjuD6DFvNHC1NVrPNTXf00jRuN0200Wk' })
  muxAssetId: string | null;

  @ApiPropertyOptional({ example: 'K02aFQR8NxeKrpjuD6DFvNHC1NVrPNTXf00jRuN0200Wk' })
  muxUploadId: string | null;

  @ApiPropertyOptional({ example: 'AbC123xyz' })
  playbackId: string | null;

  @ApiProperty({ enum: UploadStatus, example: UploadStatus.PENDING })
  uploadStatus: UploadStatus;

  @ApiProperty({ enum: ProcessingStatus, example: ProcessingStatus.WAITING })
  processingStatus: ProcessingStatus;

  @ApiPropertyOptional({ example: null })
  errorMessage: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;
}

export class VideoTopicResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  videoId: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  topicId: string;
}

export class VideoVisibilityResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  videoId: string;

  @ApiProperty({ enum: VisibilityType, example: VisibilityType.PUBLIC })
  visibilityType: VisibilityType;

  @ApiPropertyOptional({ example: null })
  groupId: string | null;
}

export class VideoResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'user-uuid-123' })
  authorUserId: string;

  @ApiProperty({ example: 'Introduction to TypeScript Generics' })
  title: string;

  @ApiPropertyOptional({
    example: 'A deep dive into TypeScript generics with practical examples.',
  })
  description: string | null;

  @ApiProperty({ enum: VideoStatus, example: VideoStatus.DRAFT })
  status: VideoStatus;

  @ApiPropertyOptional({ example: 142 })
  durationSec: number | null;

  @ApiPropertyOptional({ example: 'https://image.mux.com/AbC123xyz/thumbnail.jpg' })
  thumbnailUrl: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiPropertyOptional({ type: VideoAssetResponseDto })
  asset: VideoAssetResponseDto | null;

  @ApiProperty({ type: [VideoTopicResponseDto] })
  topics: VideoTopicResponseDto[];

  @ApiPropertyOptional({ type: VideoVisibilityResponseDto })
  visibility: VideoVisibilityResponseDto | null;
}
