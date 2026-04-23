import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FolderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.folder.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async findOne(id: number) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    return folder;
  }

  async create(dto: CreateFolderDto) {
    return this.prisma.folder.create({ data: dto });
  }

  async update(id: number, dto: UpdateFolderDto) {
    return this.prisma.folder
      .update({ where: { id }, data: dto })
      .catch(() => { throw new NotFoundException(`Folder ${id} not found`); });
  }

  async delete(id: number) {
    const hasChildren = await this.prisma.folder.count({ where: { parentId: id } });
    if (hasChildren > 0) {
      throw new BadRequestException('Cannot delete folder with subfolders');
    }

    const hasCollections = await this.prisma.productCollection.count({ where: { folderId: id } });
    if (hasCollections > 0) {
      throw new BadRequestException('Cannot delete folder with collections');
    }

    return this.prisma.folder
      .delete({ where: { id } })
      .catch(() => { throw new NotFoundException(`Folder ${id} not found`); });
  }
}
