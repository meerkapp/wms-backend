import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async create(dto: CreateOrganizationDto) {
    const organization = await this.prisma.organization.create({ data: dto });
    this.syncGateway.notifyChange('organization', { added: [organization] });
    return organization;
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.organization
      .update({ where: { id }, data: dto })
      .catch(() => {
        throw new NotFoundException(`Organization ${id} not found`);
      });
    this.syncGateway.notifyChange('organization', { modified: [organization] });
    return organization;
  }
}
