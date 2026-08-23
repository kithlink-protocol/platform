import { Module } from '@nestjs/common';
import { AdminSyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  controllers: [AdminSyncController],
  providers: [SyncService],
})
export class SyncModule {}
