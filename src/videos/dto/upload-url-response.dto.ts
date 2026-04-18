import { ApiProperty } from '@nestjs/swagger';

export class UploadUrlResponseDto {
  @ApiProperty({
    description: 'The Mux direct upload URL — PUT your video file to this URL',
    example: 'https://storage.googleapis.com/video-upload/...',
  })
  uploadUrl: string;

  @ApiProperty({
    description: 'The Mux upload ID — stored on the VideoAsset record',
    example: 'K02aFQR8NxeKrpjuD6DFvNHC1NVrPNTXf00jRuN0200Wk',
  })
  muxUploadId: string;
}
