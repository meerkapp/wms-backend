import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class DirectPriceListAssignmentService {
  async findWarehouse(client: Prisma.TransactionClient, warehouseId: number) {
    await this.assertWarehouseExists(client, warehouseId);
    const assignment = await client.priceListAssignment.findUnique({
      where: { warehouseId },
      select: { priceListId: true },
    });
    return { priceListId: assignment?.priceListId ?? null };
  }

  async setWarehouse(
    client: Prisma.TransactionClient,
    warehouseId: number,
    priceListId: number | null,
  ) {
    await this.assertWarehouseExists(client, warehouseId);
    return this.setAssignment(client, { targetType: 'WAREHOUSE', warehouseId }, priceListId);
  }

  async findOrganization(client: Prisma.TransactionClient, organizationId: number) {
    await this.assertOrganizationExists(client, organizationId);
    const assignment = await client.priceListAssignment.findUnique({
      where: { organizationId },
      select: { priceListId: true },
    });
    return { priceListId: assignment?.priceListId ?? null };
  }

  async setOrganization(
    client: Prisma.TransactionClient,
    organizationId: number,
    priceListId: number | null,
  ) {
    await this.assertOrganizationExists(client, organizationId);
    return this.setAssignment(client, { targetType: 'ORGANIZATION', organizationId }, priceListId);
  }

  private async setAssignment(
    client: Prisma.TransactionClient,
    target:
      | { targetType: 'WAREHOUSE'; warehouseId: number }
      | { targetType: 'ORGANIZATION'; organizationId: number },
    priceListId: number | null,
  ) {
    const where =
      target.targetType === 'WAREHOUSE'
        ? { warehouseId: target.warehouseId }
        : { organizationId: target.organizationId };
    const currentAssignment = await client.priceListAssignment.findUnique({ where });

    if (priceListId === null) {
      if (currentAssignment) {
        await client.priceListAssignment.delete({ where });
      }
      return { priceListId: null };
    }

    await this.assertPriceListExists(client, priceListId);
    if (currentAssignment?.priceListId === priceListId) {
      return { priceListId };
    }

    const assignment = await client.priceListAssignment.upsert({
      where,
      update: { priceListId },
      create: { ...target, priceListId },
    });
    return { priceListId: assignment.priceListId };
  }

  private async assertPriceListExists(client: Prisma.TransactionClient, id: number) {
    const priceList = await client.priceList.findUnique({ where: { id }, select: { id: true } });
    if (!priceList) throw new NotFoundException(`Price list ${id} not found`);
  }

  private async assertWarehouseExists(client: Prisma.TransactionClient, id: number) {
    const warehouse = await client.warehouse.findUnique({ where: { id }, select: { id: true } });
    if (!warehouse) throw new NotFoundException(`Warehouse ${id} not found`);
  }

  private async assertOrganizationExists(client: Prisma.TransactionClient, id: number) {
    const organization = await client.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException(`Organization ${id} not found`);
  }
}
