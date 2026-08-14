import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsModule } from '../channels/channels.module';
import { Video } from './entities/video.entity';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VideoWorkerService } from './video-worker.service';

@Module({
  imports: [TypeOrmModule.forFeature([Video]), ChannelsModule],
  controllers: [VideosController],
  providers: [VideosService, VideoWorkerService],
  exports: [TypeOrmModule, VideosService],
})
export class VideosModule {}
