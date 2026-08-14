import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { VideosService } from './videos.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { PresignPartQueryDto } from './dto/presign-part.dto';
import { VideoViewDto } from './dto/video-view.dto';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('initiate-upload')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initiate a video multipart upload',
    description:
      'Creates an S3 multipart upload and a draft Video row owned by the caller channel.',
  })
  @ApiResponse({
    status: 201,
    description: 'Multipart upload initiated',
  })
  @ApiResponse({
    status: 413,
    description: 'File exceeds 10GB',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ) {
    return this.videosService.initiateUpload(
      user.sub,
      dto.filename,
      dto.contentType,
      dto.size,
    );
  }

  @Get(':id/presign-part')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a presigned URL to upload a video part' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Presigned part URL',
    schema: { type: 'string' },
  })
  presignPart(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query() query: PresignPartQueryDto,
  ): Promise<string> {
    return this.videosService.presignPart(user.sub, id, query.partNumber);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Complete a video multipart upload' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Upload completed; video queued for processing',
    type: VideoViewDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Upload not initiated or parts incomplete',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 403,
    description: 'Not owner of the video',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<VideoViewDto> {
    return this.videosService.completeUpload(user.sub, id, dto);
  }

  @Post(':id/abort')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Abort a video multipart upload' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Upload aborted',
    type: VideoViewDto,
  })
  abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<VideoViewDto> {
    return this.videosService.abortUpload(user.sub, id);
  }

  @Get(':id/stream')
  @Public()
  @ApiOperation({ summary: 'Get streaming URL for a video' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Streaming URL or null while not published',
    schema: { type: 'string', nullable: true },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async stream(@Param('id') id: string): Promise<{ streamUrl: string | null }> {
    const streamUrl = await this.videosService.getStreamUrlPublic(id);
    return { streamUrl };
  }

  @Get(':id/download')
  @Public()
  @ApiOperation({ summary: 'Get presigned download URL for a video' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Presigned download URL',
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async download(@Param('id') id: string): Promise<{ downloadUrl: string }> {
    const downloadUrl = await this.videosService.getDownloadUrl(id);
    return { downloadUrl };
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get public video view' })
  @ApiParam({ name: 'id', description: 'Video id' })
  @ApiResponse({
    status: 200,
    description: 'Video view',
    type: VideoViewDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  getVideo(@Param('id') id: string): Promise<VideoViewDto> {
    return this.videosService.getVideo(id);
  }
}
