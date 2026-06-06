import { Module } from '@nestjs/common';
import { TelemetryGatewayModule } from './telemetry-gateway/telemetry-gateway.module';
import { WebsocketModule } from './websocket/websocket.module';

@Module({
  imports: [TelemetryGatewayModule, WebsocketModule],
})
export class AppModule {}
