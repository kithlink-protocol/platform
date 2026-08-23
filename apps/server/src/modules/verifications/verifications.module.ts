import { Module } from '@nestjs/common';
import { AdminVerificationsController, AppVerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

@Module({
  controllers: [AppVerificationsController, AdminVerificationsController],
  providers: [VerificationsService],
})
export class VerificationsModule {}
