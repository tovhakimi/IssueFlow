import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { Attachment } from './attachment.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketDependency, Attachment]),
    AuditLogModule,
  ],
  providers: [TicketsService],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
