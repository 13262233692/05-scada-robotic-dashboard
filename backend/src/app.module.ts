import { Module } from '@nestjs/common';
import { TelemetryGatewayModule } from './telemetry-gateway/telemetry-gateway.module';
import { WebsocketModule } from './websocket/websocket.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [RateLimitModule, TelemetryGatewayModule, WebsocketModule],
})
export class AppModule {}
