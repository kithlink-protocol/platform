import { Module } from '@nestjs/common';
import { ParseProcessor } from './processor';
import { ParseQueue } from './queue';

@Module({
  providers: [ParseProcessor, ParseQueue],
  exports: [ParseQueue],
})
export class ParseModule {}
