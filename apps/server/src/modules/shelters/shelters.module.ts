import { Module } from '@nestjs/common';
import { AdminSheltersController } from './shelters.controller';
import { SheltersService } from './shelters.service';

@Module({
  controllers: [AdminSheltersController],
  providers: [SheltersService],
  exports: [SheltersService],
})
export class SheltersModule {}
