import { Module } from '@nestjs/common';
import { AppApplicationsController, AdminApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JourneysModule } from '../journeys/journeys.module';

@Module({
  imports: [JourneysModule],
  controllers: [AppApplicationsController, AdminApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
