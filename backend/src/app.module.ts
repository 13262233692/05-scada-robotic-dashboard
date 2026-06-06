import { Module } from '@nestjs/common';
import { TelemetryGatewayModule } from './telemetry-gateway/telemetry-gateway.module';
import { WebsocketModule } from './websocket/websocket.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { GCodeParserModule } from './gcode-parser/gcode-parser.module';

@Module({
  imports: [RateLimitModule, TelemetryGatewayModule, WebsocketModule, GCodeParserModule],
})
export class AppModule {}
