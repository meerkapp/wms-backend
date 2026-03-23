import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';

export class CreateCityDto {
  @ApiProperty({ example: 'Sydney' })
  @IsString()
  declare name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  declare countryId: number;
}
