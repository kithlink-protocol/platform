import { Module } from '@nestjs/common';
import { AdminJourneysController, PublicJourneysController } from './journeys.controller';
import { JourneysService } from './journeys.service';

@Module({
  controllers: [PublicJourneysController, AdminJourneysController],
  providers: [JourneysService],
  exports: [JourneysService],
})
export class JourneysModule {}
