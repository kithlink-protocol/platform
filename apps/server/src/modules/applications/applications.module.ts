import { Module } from '@nestjs/common';
import { AppApplicationsController, AdminApplicationsController, AdminShelterReviewController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { MeUniversalController, PublicRentalsController } from './universal.controller';
import { UniversalService } from './universal.service';
import { JourneysModule } from '../journeys/journeys.module';

@Module({
  imports: [JourneysModule],
  controllers: [AppApplicationsController, AdminApplicationsController, AdminShelterReviewController, MeUniversalController, PublicRentalsController],
  providers: [ApplicationsService, UniversalService],
})
export class ApplicationsModule {}
