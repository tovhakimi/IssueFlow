import { IsNumber } from 'class-validator';

export class CreateDependencyDto {
  @IsNumber()
  blockedBy: number;
}
