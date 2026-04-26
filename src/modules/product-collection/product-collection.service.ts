import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPinnedEntries, PinnedEntry } from '../../common/utils/pin-order.util';
import { SyncGateway } from '../sync/sync.gateway';
import { CreateProductCollectionDto } from './dto/create-product-collection.dto';
import { UpdateProductCollectionDto } from './dto/update-product-collection.dto';

@Injectable()
export class ProductCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncGateway: SyncGateway,
  ) {}

  async findAll() {
    const [pinned, unpinned] = await Promise.all([
      this.prisma.productCollection.findMany({
        where: { pinnedAt: { not: null } },
        orderBy: [{ pinOrder: { sort: 'asc', nulls: 'last' } }, { pinnedAt: 'asc' }],
      }),
      this.prisma.productCollection.findMany({
        where: { pinnedAt: null },
        orderBy: { name: 'asc' },
      }),
    ]);
    return [...pinned, ...unpinned];
  }

  async findOne(id: number) {
    const collection = await this.prisma.productCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException(`ProductCollection ${id} not found`);
    return collection;
  }

  async create(dto: CreateProductCollectionDto) {
    const result = await this.prisma.productCollection
      .create({ data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Collection with this name already exists in the folder');
        }
        throw e;
      });
    this.syncGateway.notifyChange('product_collection', { added: [result] });
    return result;
  }

  async update(id: number, dto: UpdateProductCollectionDto) {
    const result = await this.prisma.productCollection
      .update({ where: { id }, data: dto })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
          if (e.code === 'P2025') throw new NotFoundException(`ProductCollection ${id} not found`);
          if (e.code === 'P2002') throw new ConflictException('Collection with this name already exists in the folder');
        }
        throw e;
      });
    this.syncGateway.notifyChange('product_collection', { modified: [result] });
    return result;
  }

  async delete(id: number) {
    const result = await this.prisma.productCollection
      .delete({ where: { id } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException(`ProductCollection ${id} not found`);
        }
        throw e;
      });
    this.syncGateway.notifyChange('product_collection', { removed: [result] });
    return result;
  }

  async pin(id: number) {
    const collection = await this.prisma.productCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException(`ProductCollection ${id} not found`);
    if (collection.pinnedAt) return collection;

    const result = await this.prisma.productCollection.update({ where: { id }, data: { pinnedAt: new Date(), pinOrder: null } });
    this.syncGateway.notifyChange('product_collection', { modified: [result] });
    return result;
  }

  async unpin(id: number) {
    const result = await this.prisma.productCollection
      .update({ where: { id }, data: { pinnedAt: null, pinOrder: null } })
      .catch((e: unknown) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          throw new NotFoundException(`ProductCollection ${id} not found`);
        }
        throw e;
      });
    this.syncGateway.notifyChange('product_collection', { modified: [result] });
    return result;
  }

  async moveUp(id: number) {
    return this.movePinned(id, 'up');
  }

  async moveDown(id: number) {
    return this.movePinned(id, 'down');
  }

  private async movePinned(id: number, direction: 'up' | 'down') {
    const collection = await this.prisma.productCollection.findUnique({ where: { id } });
    if (!collection) throw new NotFoundException(`ProductCollection ${id} not found`);
    if (!collection.pinnedAt) throw new BadRequestException('ProductCollection is not pinned');

    const [pinnedFolders, pinnedCollections] = await Promise.all([
      this.prisma.folder.findMany({ where: { parentId: collection.folderId, pinnedAt: { not: null } } }),
      this.prisma.productCollection.findMany({ where: { folderId: collection.folderId, pinnedAt: { not: null } } }),
    ]);

    const entries = buildPinnedEntries(pinnedFolders, pinnedCollections);
    const index = entries.findIndex(e => e.kind === 'collection' && e.id === id);

    if (direction === 'up') {
      if (index <= 0) return collection;
      [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]];
    } else {
      if (index >= entries.length - 1) return collection;
      [entries[index], entries[index + 1]] = [entries[index + 1], entries[index]];
    }

    return this.applyPinOrder(entries, id);
  }

  private async applyPinOrder(entries: PinnedEntry[], collectionId: number) {
    const folderOps = entries
      .map((e, i) => e.kind === 'folder' ? this.prisma.folder.update({ where: { id: e.id }, data: { pinOrder: i + 1 } }) : null)
      .filter((op): op is NonNullable<typeof op> => op !== null);

    const collectionOps = entries
      .map((e, i) => e.kind === 'collection' ? this.prisma.productCollection.update({ where: { id: e.id }, data: { pinOrder: i + 1 } }) : null)
      .filter((op): op is NonNullable<typeof op> => op !== null);

    const results = await this.prisma.$transaction([...folderOps, ...collectionOps]);
    const updatedFolders = results.slice(0, folderOps.length);
    const updatedCollections = results.slice(folderOps.length);

    if (updatedFolders.length > 0) {
      this.syncGateway.notifyChange('folder', { modified: updatedFolders });
    }
    this.syncGateway.notifyChange('product_collection', { modified: updatedCollections });

    return updatedCollections.find(c => c.id === collectionId)!;
  }
}
