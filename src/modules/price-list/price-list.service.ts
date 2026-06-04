import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';

@Injectable()
export class PriceListService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.priceList.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreatePriceListDto) {
    const priceList = await this.prisma.priceList.create({
      data: {
        name: dto.name,
        currency: dto.currency,
      },
    });
    return priceList;
  }

  async update(id: number, dto: UpdatePriceListDto) {
    const priceList = await this.prisma.priceList.update({ where: { id }, data: dto }).catch(() => {
      throw new NotFoundException(`Price list ${id} not found`);
    });
    return priceList;
  }
}
