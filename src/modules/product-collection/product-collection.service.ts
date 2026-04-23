import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateProductCollectionDto } from './dto/create-product-collection.dto';
import { UpdateProductCollectionDto } from './dto/update-product-collection.dto';

@Injectable()
export class ProductCollectionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.productCollection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const collection = await this.prisma.productCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException(`ProductCollection ${id} not found`);
    return collection;
  }

  async create(dto: CreateProductCollectionDto) {
    return this.prisma.productCollection
      .create({ data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Collection with this name already exists in the folder');
        }
        throw e;
      });
  }

  async update(id: number, dto: UpdateProductCollectionDto) {
    return this.prisma.productCollection
      .update({ where: { id }, data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === 'P2025') throw new NotFoundException(`ProductCollection ${id} not found`);
          if (e.code === 'P2002') throw new ConflictException('Collection with this name already exists in the folder');
        }
        throw e;
      });
  }

  async delete(id: number) {
    return this.prisma.productCollection
      .delete({ where: { id } })
      .catch(() => { throw new NotFoundException(`ProductCollection ${id} not found`); });
  }
}
