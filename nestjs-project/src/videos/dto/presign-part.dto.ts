import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PresignPartQueryDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  partNumber: number;
}
