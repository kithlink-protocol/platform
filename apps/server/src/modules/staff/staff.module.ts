import { Module } from '@nestjs/common';
import { AdminStaffController } from './staff.controller';

@Module({
  controllers: [AdminStaffController],
})
export class StaffModule {}
