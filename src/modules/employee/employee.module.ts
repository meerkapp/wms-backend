import { Module } from '@nestjs/common';
import { StorageModule } from '../../common/storage/storage.module';
import { RoleModule } from '../role/role.module';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

@Module({
  imports: [StorageModule, RoleModule],
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class EmployeeModule {}
