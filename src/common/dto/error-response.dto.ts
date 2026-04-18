import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'CONTENT_001', description: 'Machine-readable error code' })
  code: string;

  @ApiProperty({ example: 'Video not found' })
  message: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '/api/v1/videos/abc-123' })
  path: string;
}
