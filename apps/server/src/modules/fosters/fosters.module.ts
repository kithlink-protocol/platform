import { Module } from '@nestjs/common';
import { AdminFostersController, PublicFostersController } from './fosters.controller';
import { FostersService } from './fosters.service';

@Module({
  controllers: [PublicFostersController, AdminFostersController],
  providers: [FostersService],
  exports: [FostersService],
})
export class FostersModule {}
