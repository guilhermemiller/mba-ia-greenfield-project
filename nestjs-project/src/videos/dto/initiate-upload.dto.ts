import { IsInt, IsString, Max, Min } from 'class-validator';

export class InitiateUploadDto {
  /** Video file name, used to derive the object key and content type. */
  @IsString()
  filename: string;

  /** MIME content type of the source file. */
  @IsString()
  contentType: string;

  /** Source file size in bytes (must be > 0 and <= 10GB). */
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024 * 1024)
  size: number;
}
