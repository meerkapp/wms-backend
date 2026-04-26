import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPinnedEntries, PinnedEntry } from '../../common/utils/pin-order.util';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FolderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async findAll() {
    const [pinned, unpinned] = await Promise.all([
      this.prisma.folder.findMany({
        where: { pinnedAt: { not: null } },
        orderBy: [{ pinOrder: { sort: 'asc', nulls: 'last' } }, { pinnedAt: 'asc' }],
      }),
      this.prisma.folder.findMany({
        where: { pinnedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);
    return [...pinned, ...unpinned];
  }

  async findOne(id: number) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    return folder;
  }

  async create(dto: CreateFolderDto) {
    const result = await this.prisma.folder.create({ data: dto });
    this.syncGateway.notifyChange('folder', { added: [result] });
    return result;
  }

  async update(id: number, dto: UpdateFolderDto) {
    const result = await this.prisma.folder
      .update({ where: { id }, data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException(`Folder ${id} not found`);
        }
        throw e;
      });
    this.syncGateway.notifyChange('folder', { modified: [result] });
    return result;
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

    const result = await this.prisma.folder
      .delete({ where: { id } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException(`Folder ${id} not found`);
        }
        throw e;
      });
    this.syncGateway.notifyChange('folder', { removed: [result] });
    return result;
  }

  async pin(id: number) {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    if (folder.pinnedAt) return folder;

    const result = await this.prisma.folder.update({ where: { id }, data: { pinnedAt: new Date(), pinOrder: null } });
    this.syncGateway.notifyChange('folder', { modified: [result] });
    return result;
  }

  async unpin(id: number) {
    const result = await this.prisma.folder
      .update({ where: { id }, data: { pinnedAt: null, pinOrder: null } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException(`Folder ${id} not found`);
        }
        throw e;
      });
    this.syncGateway.notifyChange('folder', { modified: [result] });
    return result;
  }

  async moveUp(id: number) {
    return this.movePinned(id, 'up');
  }

  async moveDown(id: number) {
    return this.movePinned(id, 'down');
  }

  private async movePinned(id: number, direction: 'up' | 'down') {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException(`Folder ${id} not found`);
    if (!folder.pinnedAt) throw new BadRequestException('Folder is not pinned');

    const [pinnedFolders, pinnedCollections] = await Promise.all([
      this.prisma.folder.findMany({ where: { parentId: folder.parentId, pinnedAt: { not: null } } }),
      this.prisma.productCollection.findMany({ where: { folderId: folder.parentId, pinnedAt: { not: null } } }),
    ]);

    const entries = buildPinnedEntries(pinnedFolders, pinnedCollections);
    const index = entries.findIndex(e => e.kind === 'folder' && e.id === id);

    if (direction === 'up') {
      if (index <= 0) return folder;
      [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
    } else {
      if (index >= entries.length - 1) return folder;
      [entries[index], entries[index + 1]] = [entries[index + 1], entries[index]];
    }

    return this.applyPinOrder(entries, id);
  }

  private async applyPinOrder(entries: PinnedEntry[], folderId: number) {
    const folderOps = entries
      .map((e, i) => e.kind === 'folder' ? this.prisma.folder.update({ where: { id: e.id }, data: { pinOrder: i + 1 } }) : null)
      .filter((op): op is NonNullable<typeof op> => op !== null);

    const collectionOps = entries
      .map((e, i) => e.kind === 'collection' ? this.prisma.productCollection.update({ where: { id: e.id }, data: { pinOrder: i + 1 } }) : null)
      .filter((op): op is NonNullable<typeof op> => op !== null);

    const results = await this.prisma.$transaction([...folderOps, ...collectionOps]);
    const updatedFolders = results.slice(0, folderOps.length);
    const updatedCollections = results.slice(folderOps.length);

    this.syncGateway.notifyChange('folder', { modified: updatedFolders });
    if (updatedCollections.length > 0) {
      this.syncGateway.notifyChange('product_collection', { modified: updatedCollections });
    }

    return updatedFolders.find(f => f.id === folderId)!;
  }
}
