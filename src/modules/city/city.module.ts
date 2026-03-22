import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { CityController } from './city.controller';
import { CityService } from './city.service';

@Module({
  imports: [SyncModule],
  controllers: [CityController],
  providers: [CityService],
})
export class CityModule {}
