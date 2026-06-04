import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateLocalityDto } from './dto/create-locality.dto';

@Injectable()
export class LocalityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLocalityDto) {
    const locality = await this.prisma.locality.create({ data: dto });
    return locality;
  }
}
