import { Module } from '@nestjs/common';
import { HealthController, PublicRegistryController } from './public.controller';
import { PublicFeedController, PublicSitesController } from '../sites/public-sites.controller';
import { AnimalsService } from '../animals/animals.service';

@Module({
  controllers: [PublicRegistryController, HealthController, PublicSitesController, PublicFeedController],
  providers: [AnimalsService],
})
export class PublicModule {}
