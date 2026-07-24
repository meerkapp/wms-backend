import { Module } from '@nestjs/common';
import { RoleController } from './role.controller';
import { RoleHierarchyService } from './role-hierarchy.service';
import { RoleService } from './role.service';

@Module({
  controllers: [RoleController],
  providers: [RoleHierarchyService, RoleService],
  exports: [RoleHierarchyService],
})
export class RoleModule {}
