import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';

export const VideoVisibility = {
  PUBLIC: 'public',
  UNLISTED: 'unlisted',
} as const;
export type VideoVisibility =
  (typeof VideoVisibility)[keyof typeof VideoVisibility];

export const VideoStatus = {
  DRAFT: 'draft',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
} as const;
export type VideoStatus = (typeof VideoStatus)[keyof typeof VideoStatus];

@Entity('videos')
export class Video {
  @PrimaryColumn({ type: 'varchar', length: 21 })
  id: string;

  @Column({ type: 'uuid' })
  channel_id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({
    type: 'enum',
    enum: Object.values(VideoVisibility),
    default: VideoVisibility.PUBLIC,
  })
  visibility: VideoVisibility;

  @Column({
    type: 'enum',
    enum: Object.values(VideoStatus),
    default: VideoStatus.DRAFT,
  })
  status: VideoStatus;

  @Column({ type: 'varchar', unique: true })
  storage_key: string;

  @Column({ type: 'varchar', nullable: true })
  thumbnail_key: string | null;

  @Column({ type: 'bigint', nullable: true })
  source_size: string | null;

  @Column({ type: 'int', nullable: true })
  duration_seconds: number | null;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ type: 'int', default: 0 })
  views_count: number;

  @Column({ type: 'varchar', nullable: true })
  upload_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Channel, (channel) => channel.videos)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;
}
