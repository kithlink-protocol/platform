import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './modules/db.module';
import { AuthModule } from './modules/auth/auth.module';
import { StaffModule } from './modules/staff/staff.module';
import { AnimalsModule } from './modules/animals/animals.module';
import { PublicModule } from './modules/public/public.module';
import { CryptoModule } from './common/crypto.util';
import { S3Module } from './modules/s3/s3.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ArtifactsModule } from './modules/artifacts/artifacts.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { ParseModule } from './modules/parse/parse.module';
import { VerificationsModule } from './modules/verifications/verifications.module';
import { SitesModule } from './modules/sites/sites.module';
import { SyncModule } from './modules/sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    StaffModule,
    AnimalsModule,
    PublicModule,
    CryptoModule,
    S3Module,
    NotificationsModule,
    ProfileModule,
    ArtifactsModule,
    ApplicationsModule,
    ConsentsModule,
    ParseModule,
    VerificationsModule,
    SitesModule,
    SyncModule,
  ],
})
export class AppModule {}
