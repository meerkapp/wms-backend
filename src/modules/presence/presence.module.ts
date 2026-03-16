import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [PresenceGateway, PresenceService],
  exports: [PresenceService, PresenceGateway],
})
export class PresenceModule {}
