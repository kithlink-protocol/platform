import { Module } from '@nestjs/common';
import { AdminAnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';

@Module({
  controllers: [AdminAnimalsController],
  providers: [AnimalsService],
})
export class AnimalsModule {}
