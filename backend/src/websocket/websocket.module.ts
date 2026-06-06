import { Module } from '@nestjs/common';
import { TelemetryWebSocketGateway } from './telemetry.gateway';
import { TelemetryGatewayModule } from '../telemetry-gateway/telemetry-gateway.module';

@Module({
  imports: [TelemetryGatewayModule],
  providers: [TelemetryWebSocketGateway],
  exports: [TelemetryWebSocketGateway],
})
export class WebsocketModule {}
