import { Module } from '@nestjs/common';
import { GCodeController } from './gcode.controller';
import { GCodeParserEngine } from './gcode-parser.service';

@Module({
  controllers: [GCodeController],
  providers: [GCodeParserEngine],
  exports: [GCodeParserEngine],
})
export class GCodeParserModule {}
