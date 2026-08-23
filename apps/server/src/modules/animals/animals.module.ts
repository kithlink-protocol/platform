import { Module } from '@nestjs/common';
import { AdminAnimalsController, AdminSterilizationController } from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  controllers: [AdminAnimalsController, AdminSterilizationController],
  providers: [AnimalsService],
})
export class AnimalsModule {}
