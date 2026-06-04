import { Module } from '@nestjs/common';
import { LocalityController } from './locality.controller';
import { LocalityService } from './locality.service';

@Module({
  controllers: [LocalityController],
  providers: [LocalityService],
})
export class LocalityModule {}
