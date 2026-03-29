import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class UpdateOwnEmailDto {
  @ApiPropertyOptional()
  @IsEmail()
  declare email: string;
}

export class UpdateOwnPasswordDto {
  @ApiPropertyOptional()
  @IsString()
  declare currentPassword: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(8)
  declare newPassword: string;
}
