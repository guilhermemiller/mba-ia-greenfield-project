import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1780000000000 implements MigrationInterface {
  name = 'CreateVideos1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."videos_visibility_enum" AS ENUM('public', 'unlisted')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."videos_status_enum" AS ENUM('draft', 'processing', 'published', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" character varying(21) NOT NULL, "channel_id" uuid NOT NULL, "title" character varying(255) NOT NULL, "description" text NOT NULL DEFAULT '', "visibility" "public"."videos_visibility_enum" NOT NULL DEFAULT 'public', "status" "public"."videos_status_enum" NOT NULL DEFAULT 'draft', "storage_key" character varying NOT NULL, "thumbnail_key" character varying, "source_size" bigint, "duration_seconds" integer, "width" integer, "height" integer, "views_count" integer NOT NULL DEFAULT '0', "upload_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_videos" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_videos_storage_key" ON "videos" ("storage_key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_videos_channel_id" ON "videos" ("channel_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_videos_channel" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_videos_channel"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_videos_channel_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_videos_storage_key"`);
    await queryRunner.query(`DROP TABLE "videos"`);
    await queryRunner.query(`DROP TYPE "public"."videos_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."videos_visibility_enum"`);
  }
}
