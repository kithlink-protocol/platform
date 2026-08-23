import { Module } from '@nestjs/common';
import { AppApplicationsController, AdminApplicationsController, AdminShelterReviewController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JourneysModule } from '../journeys/journeys.module';

@Module({
  imports: [JourneysModule],
  controllers: [AppApplicationsController, AdminApplicationsController, AdminShelterReviewController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
