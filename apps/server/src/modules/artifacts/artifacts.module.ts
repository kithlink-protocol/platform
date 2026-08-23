import { Module } from '@nestjs/common';
import { ParseModule } from '../parse/parse.module';
import { AppArtifactsController, AdminArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

@Module({
  imports: [ParseModule],
  controllers: [AppArtifactsController, AdminArtifactsController],
  providers: [ArtifactsService],
})
export class ArtifactsModule {}
