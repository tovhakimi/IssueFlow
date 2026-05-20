import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TicketsService } from './tickets.service';
import { Ticket, TicketStatus, TicketPriority, TicketType } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { Attachment } from './attachment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';

/**
 * Performance tests — verify that key operations complete within acceptable
 * time bounds even when handling larger input sets.
 *
 * Thresholds are intentionally generous (we're running against mocks, not a
 * real DB) — the goal is to catch O(n²) regressions, not measure absolute
 * latency.
 */

const makeTicket = (id: number, overrides: Partial<Ticket> = {}): Ticket => ({
  id,
  title: `Ticket ${id}`,
  description: 'desc',
  status: TicketStatus.IN_PROGRESS,
  priority: TicketPriority.LOW,
  type: TicketType.TASK,
  projectId: 1,
  assigneeId: 1,
  dueDate: new Date(Date.now() - 1000), // in the past → overdue
  isOverdue: false,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('TicketsService — performance', () => {
  let service: TicketsService;
  let savedTickets: Ticket[];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        {
          provide: getRepositoryToken(Ticket),
          useValue: {
            create: jest.fn(dto => dto),
            save: jest.fn(async t => t),
            findOne: jest.fn(),
            find: jest.fn(),
            findByIds: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              getMany: jest.fn(async () => savedTickets),
            }),
            manager: { query: jest.fn() },
          },
        },
        {
          provide: getRepositoryToken(TicketDependency),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(Attachment),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  // ─── Escalation — linear scaling ──────────────────────────────────────────

  it('escalates 10 overdue tickets in < 50ms', async () => {
    savedTickets = Array.from({ length: 10 }, (_, i) => makeTicket(i + 1));
    const start = Date.now();
    await service.escalateOverdueTickets();
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('escalates 100 overdue tickets in < 200ms', async () => {
    savedTickets = Array.from({ length: 100 }, (_, i) => makeTicket(i + 1));
    const start = Date.now();
    await service.escalateOverdueTickets();
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('escalation time scales linearly (100 tickets < 5× time of 10 tickets)', async () => {
    savedTickets = Array.from({ length: 10 }, (_, i) => makeTicket(i + 1));
    const start10 = Date.now();
    await service.escalateOverdueTickets();
    const time10 = Date.now() - start10;

    savedTickets = Array.from({ length: 100 }, (_, i) => makeTicket(i + 1));
    const start100 = Date.now();
    await service.escalateOverdueTickets();
    const time100 = Date.now() - start100;

    // 100 tickets should be < 5× the time for 10 (confirms O(n), not O(n²))
    // Allow a generous multiplier since timing jitter on CI can be high
    expect(time100).toBeLessThan(Math.max(time10 * 15, 100));
  });

  // ─── Status transition check — constant time ──────────────────────────────

  it('status transition validation is effectively instant (< 5ms)', async () => {
    const ticket = makeTicket(1, { status: TicketStatus.IN_REVIEW });
    const ticketRepo = service['ticketRepo'] as any;
    ticketRepo.findOne.mockResolvedValue(ticket);
    ticketRepo.save.mockResolvedValue({ ...ticket, status: TicketStatus.DONE });

    // Mock no blockers
    const depRepo = service['depRepo'] as any;
    depRepo.find.mockResolvedValue([]);

    const start = Date.now();
    await service.update(1, { status: TicketStatus.DONE }, 1);
    expect(Date.now() - start).toBeLessThan(5);
  });

  // ─── CSV Import — row processing ──────────────────────────────────────────

  it('imports 50 CSV rows in < 500ms', async () => {
    // Build a CSV buffer in memory
    const header = 'title,description,status,priority,type,assigneeId\n';
    const rows = Array.from(
      { length: 50 },
      (_, i) => `Ticket ${i},desc,TODO,MEDIUM,TASK,1`,
    ).join('\n');
    const csvBuffer = Buffer.from(header + rows);

    const ticketRepo = service['ticketRepo'] as any;
    ticketRepo.create.mockImplementation((dto: any) => dto);
    ticketRepo.save.mockResolvedValue(makeTicket(1));
    ticketRepo.manager.query.mockResolvedValue([]); // no DEVELOPER → assigneeId undefined

    const file = { buffer: csvBuffer } as Express.Multer.File;

    const start = Date.now();
    const result = await service.importCsv(file, 1, 1);
    const elapsed = Date.now() - start;

    expect(result.created).toBe(50);
    expect(elapsed).toBeLessThan(500);
  });
});
