import { Module } from '@nestjs/common';
import {
  AdminJourneysController,
  PublicJourneysController,
} from './journeys.controller';
import { NudgePreferencesController } from './nudges.controller';
import { JourneysService } from './journeys.service';

@Module({
  controllers: [PublicJourneysController, AdminJourneysController, NudgePreferencesController],
  providers: [JourneysService],
  exports: [JourneysService],
})
export class JourneysModule {}
