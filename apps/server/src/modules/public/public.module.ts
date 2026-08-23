import { Module } from '@nestjs/common';
import { HealthController, PublicRegistryController } from './public.controller';
import { AnimalsService } from '../animals/animals.service';

@Module({
  controllers: [PublicRegistryController, HealthController],
  providers: [AnimalsService],
})
export class PublicModule {}
