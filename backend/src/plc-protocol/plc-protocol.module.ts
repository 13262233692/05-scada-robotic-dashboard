import { Module } from '@nestjs/common';
import { PlcProtocolParser } from './parser';

@Module({
  providers: [PlcProtocolParser],
  exports: [PlcProtocolParser],
})
export class PlcProtocolModule {}
