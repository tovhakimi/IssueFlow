import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateCommentDto {
  @IsNotEmpty()
  @IsString()
  content: string;

  // Required for optimistic locking
  @IsOptional()
  @IsNumber()
  version?: number;
}
