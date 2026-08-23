import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './modules/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { AnimalsModule } from './modules/animals/animals.module';
import { PublicModule } from './modules/public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    StaffModule,
    AnimalsModule,
    PublicModule,
  ],
})
export class AppModule {}
