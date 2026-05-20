import { Test, TestingModule } from '@nestjs/testing';
import { EscalationService } from './escalation.service';
import { TicketsService } from '../tickets/tickets.service';

describe('EscalationService', () => {
  let service: EscalationService;
  let ticketsService: jest.Mocked<TicketsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        {
          provide: TicketsService,
          useValue: {
            escalateOverdueTickets: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(EscalationService);
    ticketsService = module.get(TicketsService);
  });

  it('calls escalateOverdueTickets when cron fires', async () => {
    await service.handleEscalation();
    expect(ticketsService.escalateOverdueTickets).toHaveBeenCalledTimes(1);
  });
});
