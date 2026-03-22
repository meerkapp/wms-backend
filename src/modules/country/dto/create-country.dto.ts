import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'AU' })
  @IsString()
  @Length(2, 2)
  declare code: string;

  @ApiProperty({ example: 'Australia' })
  @IsString()
  declare name: string;
}
