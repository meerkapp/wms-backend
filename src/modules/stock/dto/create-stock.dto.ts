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

  @ApiProperty({ example: 1 })
  @IsInt()
  declare organizationId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  declare cityId: number;
}
