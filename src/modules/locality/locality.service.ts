import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateLocalityDto } from './dto/create-locality.dto';

@Injectable()
export class LocalityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateLocalityDto) {
    const locality = await this.prisma.locality.create({ data: dto });
    this.syncGateway.notifyChange('locality', { added: [locality] });
    return locality;
  }
}
