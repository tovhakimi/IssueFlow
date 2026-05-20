import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(private readonly ticketsService: TicketsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleEscalation() {
    this.logger.log('Running overdue ticket escalation...');
    await this.ticketsService.escalateOverdueTickets();
    this.logger.log('Escalation complete');
  }
}
