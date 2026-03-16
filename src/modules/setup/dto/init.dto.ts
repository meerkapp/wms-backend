import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class InitDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  declare email: string;

  @ApiProperty({ example: 'password123', minLength: 8 })
  @IsString()
  @MinLength(8)
  declare password: string;

  @ApiProperty({ example: 'Gavr' })
  @IsString()
  declare firstName: string;

  @ApiProperty({ example: 'Balavr' })
  @IsString()
  declare lastName: string;
}
