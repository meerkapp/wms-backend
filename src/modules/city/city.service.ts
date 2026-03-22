import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateCityDto } from './dto/create-city.dto';

@Injectable()
export class CityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateCityDto) {
    const city = await this.prisma.city.create({ data: dto });
    this.syncGateway.notifyChange('city', { added: [city] });
    return city;
  }
}
