import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateCityDto {
  @ApiProperty({ example: 'Sydney' })
  @IsString()
  declare name: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare countryId?: number;
}
