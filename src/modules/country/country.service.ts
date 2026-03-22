import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateCountryDto } from './dto/create-country.dto';

@Injectable()
export class CountryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateCountryDto) {
    const country = await this.prisma.country.create({ data: dto });
    this.syncGateway.notifyChange('country', { added: [country] });
    return country;
  }
}
