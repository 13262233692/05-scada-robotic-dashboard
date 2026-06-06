import { Module } from '@nestjs/common';
import { TelemetryGatewayService } from './telemetry-gateway.service';
import { PlcProtocolModule } from '../plc-protocol/plc-protocol.module';

@Module({
  imports: [PlcProtocolModule],
  providers: [TelemetryGatewayService],
  exports: [TelemetryGatewayService],
})
export class TelemetryGatewayModule {}
