import { Module } from '@nestjs/common';
import { AppApplicationsController, AdminApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  controllers: [AppApplicationsController, AdminApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
