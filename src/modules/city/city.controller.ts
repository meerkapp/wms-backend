import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CityService } from './city.service';
import { CreateCityDto } from './dto/create-city.dto';

@ApiTags('city')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('city')
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @ApiOperation({ summary: 'Create a city' })
  @Post()
  create(@Body() dto: CreateCityDto) {
    return this.cityService.create(dto);
  }
}
