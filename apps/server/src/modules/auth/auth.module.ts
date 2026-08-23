import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { MeLifecycleController } from './me-lifecycle.controller';

@Module({
  controllers: [AuthController, MeLifecycleController],
})
export class AuthModule {}
