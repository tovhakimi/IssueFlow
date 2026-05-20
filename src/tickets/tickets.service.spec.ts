import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketsService } from './tickets.service';
import { Ticket, TicketStatus, TicketPriority, TicketType } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { Attachment } from './attachment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

const mockTicket = (overrides = {}): Ticket => ({
  id: 1,
  title: 'Test Ticket',
  description: 'desc',
  status: TicketStatus.TODO,
  priority: TicketPriority.MEDIUM,
  type: TicketType.TASK,
  projectId: 1,
  assigneeId: 1,
  dueDate: null,
  isOverdue: false,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

const mockRepo = () => ({
  create: jest.fn(dto => dto),
  save: jest.fn(entity => Promise.resolve({ ...entity, id: 1, version: 1 })),
  findOne: jest.fn(),
  find: jest.fn(),
  findByIds: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  createQueryBuilder: jest.fn(),
  manager: { query: jest.fn() },
});

const mockAuditLog = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: jest.Mocked<Repository<Ticket>>;
  let depRepo: jest.Mocked<Repository<TicketDependency>>;
  let auditLog: ReturnType<typeof mockAuditLog>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useFactory: mockRepo },
        { provide: getRepositoryToken(TicketDependency), useFactory: mockRepo },
        { provide: getRepositoryToken(Attachment), useFactory: mockRepo },
        { provide: AuditLogService, useFactory: mockAuditLog },
      ],
    }).compile();

    service = module.get(TicketsService);
    ticketRepo = module.get(getRepositoryToken(Ticket));
    depRepo = module.get(getRepositoryToken(TicketDependency));
    auditLog = module.get(AuditLogService);
  });

  describe('status lifecycle', () => {
    it('allows forward status transitions', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.save.mockResolvedValue({ ...ticket, status: TicketStatus.IN_PROGRESS });

      const result = await service.update(1, { status: TicketStatus.IN_PROGRESS }, 1);
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('rejects backward status transitions', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { status: TicketStatus.TODO }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects updates on DONE tickets', async () => {
      const ticket = mockTicket({ status: TicketStatus.DONE });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { title: 'changed' }, 1)).rejects.toThrow(ForbiddenException);
    });

    it('blocks transition to DONE when there are unresolved blockers', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW });
      ticketRepo.findOne.mockResolvedValue(ticket);
      depRepo.find.mockResolvedValue([{ id: 1, ticketId: 1, blockedById: 2 }] as any);
      ticketRepo.findByIds.mockResolvedValue([
        mockTicket({ id: 2, status: TicketStatus.IN_PROGRESS }),
      ]);

      await expect(service.update(1, { status: TicketStatus.DONE }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('optimistic locking', () => {
    it('throws ConflictException on version mismatch', async () => {
      const ticket = mockTicket({ version: 3 });
      ticketRepo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { title: 'new', version: 1 }, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('allows update when version matches', async () => {
      const ticket = mockTicket({ version: 3 });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.save.mockResolvedValue({ ...ticket, title: 'new' });

      const result = await service.update(1, { title: 'new', version: 3 }, 1);
      expect(result.title).toBe('new');
    });
  });

  describe('auto-assignment', () => {
    it('auto-assigns to a DEVELOPER when no assigneeId given', async () => {
      (ticketRepo.manager.query as jest.Mock).mockResolvedValue([{ id: 5, createdAt: new Date() }]);
      ticketRepo.create.mockImplementation(dto => ({ ...dto } as any));
      ticketRepo.save.mockResolvedValue(mockTicket({ assigneeId: 5 }));
      auditLog.log.mockResolvedValue(undefined);

      const result = await service.create({ title: 'T', projectId: 1 } as any, 1);
      expect(result.assigneeId).toBe(5);
    });

    it('logs AUTO_ASSIGN with actor=SYSTEM when auto-assigning', async () => {
      (ticketRepo.manager.query as jest.Mock).mockResolvedValue([{ id: 5, createdAt: new Date() }]);
      ticketRepo.create.mockImplementation(dto => ({ ...dto } as any));
      ticketRepo.save.mockResolvedValue(mockTicket({ assigneeId: 5 }));
      auditLog.log.mockResolvedValue(undefined);

      await service.create({ title: 'T', projectId: 1 } as any, 1);

      // Two audit entries: CREATE (USER) + AUTO_ASSIGN (SYSTEM)
      expect(auditLog.log).toHaveBeenCalledTimes(2);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'USER', action: 'CREATE' }),
      );
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'SYSTEM', action: 'AUTO_ASSIGN' }),
      );
    });

    it('logs only CREATE when assigneeId is manually provided (no AUTO_ASSIGN entry)', async () => {
      ticketRepo.create.mockImplementation(dto => ({ ...dto } as any));
      ticketRepo.save.mockResolvedValue(mockTicket({ assigneeId: 99 }));
      auditLog.log.mockResolvedValue(undefined);

      await service.create({ title: 'T', projectId: 1, assigneeId: 99 } as any, 1);

      expect(ticketRepo.manager.query).not.toHaveBeenCalled();
      expect(auditLog.log).toHaveBeenCalledTimes(1);
      expect(auditLog.log).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'USER', action: 'CREATE' }),
      );
    });
  });

  describe('DONE guard', () => {
    it('prevents any field update on a DONE ticket', async () => {
      ticketRepo.findOne.mockResolvedValue(mockTicket({ status: TicketStatus.DONE }));
      await expect(service.update(1, { description: 'x' }, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('priority reset on manual update', () => {
    it('resets isOverdue to false when priority is manually updated', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_PROGRESS, isOverdue: true });
      ticketRepo.findOne.mockResolvedValue(ticket);
      ticketRepo.save.mockImplementation(async (t: any) => ({ ...t } as any));

      const result = await service.update(1, { priority: TicketPriority.HIGH }, 1);
      expect(result.isOverdue).toBe(false);
    });
  });
});
