import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../user.entity';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}
