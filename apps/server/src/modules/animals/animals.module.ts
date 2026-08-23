import { Module } from '@nestjs/common';
import {
  AdminAnimalsController,
  AdminSterilizationController,
  PublicAnimalPhotosController,
} from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  controllers: [AdminAnimalsController, AdminSterilizationController, PublicAnimalPhotosController],
  providers: [AnimalsService],
})
export class AnimalsModule {}
