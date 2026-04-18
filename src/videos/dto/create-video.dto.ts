import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VisibilityType } from '@prisma/client';

export class CreateVideoDto {
  @ApiProperty({
    description: 'Video title',
    maxLength: 200,
    example: 'Introduction to TypeScript Generics',
  })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Video description',
    maxLength: 2000,
    example: 'A deep dive into TypeScript generics with practical examples.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of topic UUIDs to associate with this video',
    type: [String],
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  topicIds?: string[];

  @ApiPropertyOptional({
    description: 'Visibility of the video',
    enum: VisibilityType,
    default: VisibilityType.PUBLIC,
  })
  @IsOptional()
  @IsEnum(VisibilityType)
  visibility?: VisibilityType;

  @ApiPropertyOptional({
    description: 'Group ID — required when visibility is GROUP_ONLY',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
