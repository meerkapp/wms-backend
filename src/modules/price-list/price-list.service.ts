import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { SetDirectPriceListAssignmentDto } from './dto/set-direct-price-list-assignment.dto';
import { SetPriceListAssignmentsDto } from './dto/set-price-list-assignments.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { UpdatePriceListPricesDto } from './dto/update-price-list-prices.dto';
import { DirectPriceListAssignmentService } from './direct-price-list-assignment.service';

@Injectable()
export class PriceListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAssignments: DirectPriceListAssignmentService,
  ) {}

  async findAll() {
    const priceLists = await this.prisma.priceList.findMany({
      include: {
        _count: { select: { assignments: true, prices: true } },
        assignments: {
          where: { targetType: { in: ['LOCALITY', 'COUNTRY'] } },
          select: { localityId: true, countryId: true },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return priceLists.map(({ _count, assignments, ...priceList }) => ({
      ...priceList,
      assignmentCount: _count.assignments,
      priceCount: _count.prices,
      localityIds: assignments.flatMap(({ localityId }) =>
        localityId === null ? [] : [localityId],
      ),
      countryIds: assignments.flatMap(({ countryId }) => (countryId === null ? [] : [countryId])),
    }));
  }

  async create(dto: CreatePriceListDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const priceList = await tx.priceList.create({
          data: {
            name: dto.name,
            currency: dto.currency,
          },
        });
        await this.replaceGeographicAssignments(tx, priceList.id, dto.localityIds, dto.countryIds);
        return priceList;
      });
    } catch (error) {
      this.rethrowAssignmentConflict(error);
    }
  }

  async update(id: number, dto: UpdatePriceListDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const currentPriceList = await tx.priceList.findUnique({
          where: { id },
          select: {
            currency: true,
            _count: { select: { prices: true } },
          },
        });

        if (!currentPriceList) {
          throw new NotFoundException(`Price list ${id} not found`);
        }

        const changesCurrency =
          dto.currency !== undefined && dto.currency !== currentPriceList.currency;
        if (changesCurrency && currentPriceList._count.prices > 0) {
          throw new ConflictException(
            'Cannot change the currency of a price list that contains prices',
          );
        }

        const { localityIds, countryIds, ...priceListData } = dto;
        const priceList = await tx.priceList.update({
          where: { id },
          data: priceListData,
        });

        if (localityIds !== undefined && countryIds !== undefined) {
          await this.replaceGeographicAssignments(tx, id, localityIds, countryIds);
        }

        return priceList;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Price list ${id} not found`);
      }
      this.rethrowAssignmentConflict(error);
    }
  }

  async findWarehouseAssignment(warehouseId: number) {
    return this.directAssignments.findWarehouse(this.prisma, warehouseId);
  }

  async setWarehouseAssignment(warehouseId: number, dto: SetDirectPriceListAssignmentDto) {
    return this.prisma.$transaction((tx) =>
      this.directAssignments.setWarehouse(tx, warehouseId, dto.priceListId),
    );
  }

  async findOrganizationAssignment(organizationId: number) {
    return this.directAssignments.findOrganization(this.prisma, organizationId);
  }

  async setOrganizationAssignment(organizationId: number, dto: SetDirectPriceListAssignmentDto) {
    return this.prisma.$transaction((tx) =>
      this.directAssignments.setOrganization(tx, organizationId, dto.priceListId),
    );
  }

  async findAssignments(id: number) {
    await this.assertPriceListExists(this.prisma, id);
    return this.findAssignmentsWithClient(this.prisma, id);
  }

  async setAssignments(id: number, dto: SetPriceListAssignmentsDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertPriceListExists(tx, id);
        await this.assertAssignmentTargetsExist(tx, dto);

        const targetConditions = this.assignmentTargetConditions(dto);
        const conflicts =
          targetConditions.length === 0
            ? []
            : await tx.priceListAssignment.findMany({
                where: {
                  priceListId: { not: id },
                  OR: targetConditions,
                },
                select: {
                  priceListId: true,
                  targetType: true,
                  warehouseId: true,
                  organizationId: true,
                  localityId: true,
                  countryId: true,
                },
              });

        if (conflicts.length > 0) {
          throw new ConflictException({
            message: 'One or more targets are assigned to another price list',
            conflicts,
          });
        }

        await tx.priceListAssignment.deleteMany({ where: { priceListId: id } });

        const assignments: Prisma.PriceListAssignmentCreateManyInput[] = [
          ...dto.warehouseIds.map((warehouseId) => ({
            priceListId: id,
            targetType: 'WAREHOUSE' as const,
            warehouseId,
          })),
          ...dto.organizationIds.map((organizationId) => ({
            priceListId: id,
            targetType: 'ORGANIZATION' as const,
            organizationId,
          })),
          ...dto.localityIds.map((localityId) => ({
            priceListId: id,
            targetType: 'LOCALITY' as const,
            localityId,
          })),
          ...dto.countryIds.map((countryId) => ({
            priceListId: id,
            targetType: 'COUNTRY' as const,
            countryId,
          })),
        ];

        if (assignments.length > 0) {
          await tx.priceListAssignment.createMany({ data: assignments });
        }

        return this.findAssignmentsWithClient(tx, id);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('One or more targets are assigned to another price list');
      }
      throw error;
    }
  }

  async findPrices(id: number) {
    await this.assertPriceListExists(this.prisma, id);
    return this.findPricesWithClient(this.prisma, id);
  }

  async updatePrices(id: number, dto: UpdatePriceListPricesDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertPriceListExists(tx, id);

      const productPackageIds = [
        ...dto.upserted.map((price) => price.productPackageId),
        ...dto.removedProductPackageIds,
      ];
      if (productPackageIds.length > 0) {
        const existingPackageCount = await tx.productPackage.count({
          where: { id: { in: productPackageIds } },
        });
        if (existingPackageCount !== productPackageIds.length) {
          throw new BadRequestException('One or more product packages do not exist');
        }
      }

      if (dto.removedProductPackageIds.length > 0) {
        await tx.productPrice.deleteMany({
          where: {
            priceListId: id,
            productPackageId: { in: dto.removedProductPackageIds },
          },
        });
      }

      for (const price of dto.upserted) {
        await tx.productPrice.upsert({
          where: {
            priceListId_productPackageId: {
              priceListId: id,
              productPackageId: price.productPackageId,
            },
          },
          update: { priceAmount: BigInt(price.priceAmount) },
          create: {
            priceListId: id,
            productPackageId: price.productPackageId,
            priceAmount: BigInt(price.priceAmount),
          },
        });
      }

      return this.findPricesWithClient(tx, id);
    });
  }

  private async assertPriceListExists(client: Prisma.TransactionClient, id: number) {
    const priceList = await client.priceList.findUnique({ where: { id }, select: { id: true } });
    if (!priceList) throw new NotFoundException(`Price list ${id} not found`);
  }

  private async replaceGeographicAssignments(
    client: Prisma.TransactionClient,
    priceListId: number,
    localityIds: number[],
    countryIds: number[],
  ) {
    const [localityCount, countryCount, existingAssignments] = await Promise.all([
      client.locality.count({ where: { id: { in: localityIds } } }),
      client.country.count({ where: { id: { in: countryIds } } }),
      client.priceListAssignment.findMany({
        where: {
          priceListId,
          targetType: { in: ['LOCALITY', 'COUNTRY'] },
        },
        select: { id: true, localityId: true, countryId: true },
      }),
    ]);
    if (localityCount !== localityIds.length || countryCount !== countryIds.length) {
      throw new BadRequestException('One or more geographic assignment targets do not exist');
    }

    const targetConditions: Prisma.PriceListAssignmentWhereInput[] = [];
    if (localityIds.length > 0) targetConditions.push({ localityId: { in: localityIds } });
    if (countryIds.length > 0) targetConditions.push({ countryId: { in: countryIds } });

    if (targetConditions.length > 0) {
      const conflicts = await client.priceListAssignment.findMany({
        where: {
          priceListId: { not: priceListId },
          OR: targetConditions,
        },
        select: {
          priceListId: true,
          targetType: true,
          localityId: true,
          countryId: true,
        },
      });
      if (conflicts.length > 0) {
        throw new ConflictException({
          message: 'One or more geographic targets are assigned to another price list',
          conflicts,
        });
      }
    }

    const localityIdSet = new Set(localityIds);
    const countryIdSet = new Set(countryIds);
    const existingLocalityIds = new Set(
      existingAssignments.flatMap(({ localityId }) => (localityId === null ? [] : [localityId])),
    );
    const existingCountryIds = new Set(
      existingAssignments.flatMap(({ countryId }) => (countryId === null ? [] : [countryId])),
    );
    const removedAssignmentIds = existingAssignments.flatMap((assignment) => {
      if (assignment.localityId !== null && !localityIdSet.has(assignment.localityId)) {
        return [assignment.id];
      }
      if (assignment.countryId !== null && !countryIdSet.has(assignment.countryId)) {
        return [assignment.id];
      }
      return [];
    });

    if (removedAssignmentIds.length > 0) {
      await client.priceListAssignment.deleteMany({
        where: { id: { in: removedAssignmentIds } },
      });
    }

    const assignments: Prisma.PriceListAssignmentCreateManyInput[] = [
      ...localityIds.flatMap((localityId) =>
        existingLocalityIds.has(localityId)
          ? []
          : [{ priceListId, targetType: 'LOCALITY' as const, localityId }],
      ),
      ...countryIds.flatMap((countryId) =>
        existingCountryIds.has(countryId)
          ? []
          : [{ priceListId, targetType: 'COUNTRY' as const, countryId }],
      ),
    ];
    if (assignments.length > 0) {
      await client.priceListAssignment.createMany({ data: assignments });
    }
  }

  private rethrowAssignmentConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        'One or more geographic targets are assigned to another price list',
      );
    }
    throw error;
  }

  private async assertAssignmentTargetsExist(
    client: Prisma.TransactionClient,
    dto: SetPriceListAssignmentsDto,
  ) {
    const [warehouseCount, organizationCount, localityCount, countryCount] = await Promise.all([
      client.warehouse.count({ where: { id: { in: dto.warehouseIds } } }),
      client.organization.count({ where: { id: { in: dto.organizationIds } } }),
      client.locality.count({ where: { id: { in: dto.localityIds } } }),
      client.country.count({ where: { id: { in: dto.countryIds } } }),
    ]);

    if (
      warehouseCount !== dto.warehouseIds.length ||
      organizationCount !== dto.organizationIds.length ||
      localityCount !== dto.localityIds.length ||
      countryCount !== dto.countryIds.length
    ) {
      throw new BadRequestException('One or more assignment targets do not exist');
    }
  }

  private assignmentTargetConditions(
    dto: SetPriceListAssignmentsDto,
  ): Prisma.PriceListAssignmentWhereInput[] {
    const conditions: Prisma.PriceListAssignmentWhereInput[] = [];
    if (dto.warehouseIds.length > 0) {
      conditions.push({ warehouseId: { in: dto.warehouseIds } });
    }
    if (dto.organizationIds.length > 0) {
      conditions.push({ organizationId: { in: dto.organizationIds } });
    }
    if (dto.localityIds.length > 0) {
      conditions.push({ localityId: { in: dto.localityIds } });
    }
    if (dto.countryIds.length > 0) {
      conditions.push({ countryId: { in: dto.countryIds } });
    }
    return conditions;
  }

  private findAssignmentsWithClient(client: Prisma.TransactionClient, priceListId: number) {
    return client.priceListAssignment.findMany({
      where: { priceListId },
      orderBy: [{ targetType: 'asc' }, { id: 'asc' }],
    });
  }

  private async findPricesWithClient(client: Prisma.TransactionClient, priceListId: number) {
    const prices = await client.productPrice.findMany({
      where: { priceListId },
      orderBy: { productPackageId: 'asc' },
    });
    return prices.map((price) => ({
      ...price,
      priceAmount: price.priceAmount.toString(),
    }));
  }
}
