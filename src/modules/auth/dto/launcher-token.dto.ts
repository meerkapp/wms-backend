import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LauncherTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  declare code: string;
}
