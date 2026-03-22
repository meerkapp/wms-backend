import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module';
import { CountryController } from './country.controller';
import { CountryService } from './country.service';

@Module({
  imports: [SyncModule],
  controllers: [CountryController],
  providers: [CountryService],
})
export class CountryModule {}
