import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStockDto {
  @ApiProperty({ example: 'WH-001' })
  @IsString()
  declare code: string;

  @ApiProperty({ example: '123 Warehouse St' })
  @IsString()
  declare address: string;

  @ApiPropertyOptional({ example: 'Main warehouse' })
  @IsOptional()
  @IsString()
  declare note?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare organizationId?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  declare cityId?: number;
}
