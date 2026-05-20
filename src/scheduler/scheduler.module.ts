import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EscalationService } from './escalation.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [ScheduleModule.forRoot(), TicketsModule],
  providers: [EscalationService],
})
export class SchedulerModule {}
