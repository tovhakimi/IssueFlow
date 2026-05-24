import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCommentDto {
  @IsNotEmpty()
  @IsString()
  content: string;

  // Required for optimistic locking — prevents concurrent update conflicts
  @IsNotEmpty()
  @IsNumber()
  version: number;
}
