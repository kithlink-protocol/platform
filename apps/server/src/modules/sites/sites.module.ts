import { Module } from '@nestjs/common';
import { AdminSitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  controllers: [AdminSitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
