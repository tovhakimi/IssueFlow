import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { Ticket, TicketStatus, TicketPriority } from './ticket.entity';
import { TicketDependency } from './ticket-dependency.entity';
import { Attachment } from './attachment.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActor } from '../audit-log/audit-log.entity';
import { UserRole } from '../users/user.entity';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Status lifecycle is strictly forward-only
const STATUS_ORDER = [
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.IN_REVIEW,
  TicketStatus.DONE,
];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketDependency)
    private readonly depRepo: Repository<TicketDependency>,
    @InjectRepository(Attachment)
    private readonly attachmentRepo: Repository<Attachment>,
    private readonly auditLog: AuditLogService,
  ) {}

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(dto: CreateTicketDto, userId: number): Promise<Ticket> {
    let assigneeId = dto.assigneeId;
    const autoAssigned = !assigneeId;

    if (autoAssigned) {
      assigneeId = await this.autoAssign(dto.projectId);
    }

    const ticket = this.ticketRepo.create({ ...dto, assigneeId });
    const saved = await this.ticketRepo.save(ticket);

    // Always log the ticket creation as a USER action
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'CREATE',
      entityType: 'Ticket',
      entityId: saved.id,
      performedBy: userId,
    });

    // Log a separate SYSTEM entry specifically for the auto-assignment
    if (autoAssigned && assigneeId) {
      await this.auditLog.log({
        actor: AuditActor.SYSTEM,
        action: 'AUTO_ASSIGN',
        entityType: 'Ticket',
        entityId: saved.id,
        changes: { assigneeId },
      });
    }

    return saved;
  }

  async findAll(projectId?: number): Promise<Ticket[]> {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    return this.ticketRepo.find({ where });
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto, userId: number): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (ticket.status === TicketStatus.DONE) {
      throw new ForbiddenException('DONE tickets cannot be updated');
    }

    // Optimistic locking: if version is provided, it must match
    if (dto.version !== undefined && dto.version !== ticket.version) {
      throw new ConflictException('Version mismatch — ticket was modified concurrently');
    }

    // Validate status transition
    if (dto.status && dto.status !== ticket.status) {
      const fromIdx = STATUS_ORDER.indexOf(ticket.status);
      const toIdx = STATUS_ORDER.indexOf(dto.status);
      if (toIdx <= fromIdx) {
        throw new BadRequestException(
          `Invalid status transition: ${ticket.status} → ${dto.status}`,
        );
      }

      // Block transition to DONE if there are unresolved blockers
      if (dto.status === TicketStatus.DONE) {
        await this.assertNoBlockers(id);
      }
    }

    // Manual priority update resets isOverdue
    const changes: any = { ...dto };
    if (dto.priority !== undefined) {
      changes.isOverdue = false;
    }

    Object.assign(ticket, changes);

    let saved: Ticket;
    try {
      saved = await this.ticketRepo.save(ticket);
    } catch (err) {
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException('Version mismatch — ticket was modified concurrently');
      }
      throw err;
    }

    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'UPDATE',
      entityType: 'Ticket',
      entityId: id,
      performedBy: userId,
      changes: dto,
    });

    return saved;
  }

  async softDelete(id: number, userId: number): Promise<{ message: string }> {
    await this.findOne(id);
    await this.ticketRepo.softDelete(id);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'DELETE',
      entityType: 'Ticket',
      entityId: id,
      performedBy: userId,
    });
    return { message: 'Ticket deleted' };
  }

  async restore(id: number, userId: number): Promise<Ticket> {
    await this.ticketRepo.restore(id);
    const ticket = await this.ticketRepo.findOne({ where: { id }, withDeleted: true });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'RESTORE',
      entityType: 'Ticket',
      entityId: id,
      performedBy: userId,
    });
    return ticket;
  }

  async findDeleted(): Promise<Ticket[]> {
    return this.ticketRepo
      .createQueryBuilder('t')
      .withDeleted()
      .where('t.deletedAt IS NOT NULL')
      .getMany();
  }

  // ─── Auto-assignment ─────────────────────────────────────────────────────────

  private async autoAssign(projectId: number): Promise<number | undefined> {
    // Find DEVELOPER already assigned to a ticket in this project, with fewest non-DONE tickets; tie-break by createdAt
    const rows = await this.ticketRepo.manager.query(
      `SELECT u.id, u."createdAt",
              COUNT(t.id) FILTER (
                WHERE t."projectId" = $1
                  AND t.status != 'DONE'
                  AND t."deletedAt" IS NULL
              ) AS active_count
       FROM users u
       LEFT JOIN tickets t ON t."assigneeId" = u.id
       WHERE u.role = $2
         AND u.id IN (
           SELECT DISTINCT t2."assigneeId"
           FROM tickets t2
           WHERE t2."projectId" = $1
             AND t2."assigneeId" IS NOT NULL
             AND t2."deletedAt" IS NULL
         )
       GROUP BY u.id, u."createdAt"
       ORDER BY active_count ASC, u."createdAt" ASC
       LIMIT 1`,
      [projectId, UserRole.DEVELOPER],
    );

    return rows.length > 0 ? rows[0].id : undefined;
  }

  // ─── Dependencies ────────────────────────────────────────────────────────────

  async addDependency(ticketId: number, dto: CreateDependencyDto, performedBy: number): Promise<TicketDependency> {
    const ticket = await this.findOne(ticketId);
    const blocker = await this.findOne(dto.blockedBy);

    if (ticket.projectId !== blocker.projectId) {
      throw new BadRequestException('Both tickets must belong to the same project');
    }

    const existing = await this.depRepo.findOne({
      where: { ticketId, blockedById: dto.blockedBy },
    });
    if (existing) throw new ConflictException('Dependency already exists');

    const dep = this.depRepo.create({ ticketId, blockedById: dto.blockedBy });
    const saved = await this.depRepo.save(dep);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'ADD_DEPENDENCY',
      entityType: 'Ticket',
      entityId: ticketId,
      performedBy,
    });
    return saved;
  }

  async removeDependency(ticketId: number, blockedById: number, performedBy: number): Promise<{ message: string }> {
    const dep = await this.depRepo.findOne({ where: { ticketId, blockedById } });
    if (!dep) throw new NotFoundException('Dependency not found');
    await this.depRepo.remove(dep);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'REMOVE_DEPENDENCY',
      entityType: 'Ticket',
      entityId: ticketId,
      performedBy,
    });
    return { message: 'Dependency removed' };
  }

  async getDependencies(ticketId: number): Promise<Ticket[]> {
    const deps = await this.depRepo.find({ where: { ticketId } });
    if (deps.length === 0) return [];
    const blockerIds = deps.map(d => d.blockedById);
    return this.ticketRepo.findBy({ id: In(blockerIds) });
  }

  private async assertNoBlockers(ticketId: number): Promise<void> {
    const blockers = await this.depRepo.find({ where: { ticketId } });
    if (blockers.length === 0) return;

    const blockerIds = blockers.map(b => b.blockedById);
    const blockerTickets = await this.ticketRepo.findBy({ id: In(blockerIds) });
    const unresolved = blockerTickets.filter(t => t.status !== TicketStatus.DONE);

    if (unresolved.length > 0) {
      throw new BadRequestException(
        `Cannot mark DONE: blockers [${unresolved.map(t => t.id).join(', ')}] are not DONE`,
      );
    }
  }

  // ─── Attachments ─────────────────────────────────────────────────────────────

  async addAttachment(ticketId: number, file: Express.Multer.File): Promise<Attachment> {
    await this.findOne(ticketId);
    const attachment = this.attachmentRepo.create({
      ticketId,
      filename: file.filename,
      originalName: file.originalname,
      contentType: file.mimetype,
      path: file.path,
      size: file.size,
    });
    return this.attachmentRepo.save(attachment);
  }

  async getAttachments(ticketId: number): Promise<Attachment[]> {
    await this.findOne(ticketId);
    return this.attachmentRepo.find({ where: { ticketId } });
  }

  async deleteAttachment(ticketId: number, attachmentId: number): Promise<{ message: string }> {
    const att = await this.attachmentRepo.findOne({ where: { id: attachmentId, ticketId } });
    if (!att) throw new NotFoundException('Attachment not found');
    await this.attachmentRepo.remove(att);
    return { message: 'Attachment deleted' };
  }

  // ─── CSV Export / Import ──────────────────────────────────────────────────────

  async exportCsv(projectId: number): Promise<string> {
    const tickets = await this.ticketRepo.find({ where: { projectId } });
    const rows = tickets.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      type: t.type,
      assigneeId: t.assigneeId ?? '',
    }));

    return stringify(rows, { header: true });
  }

  async importCsv(
    file: Express.Multer.File,
    projectId: number,
    userId: number,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    const records = parse(file.buffer, { columns: true, skip_empty_lines: true });

    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const dto: CreateTicketDto = {
          title: row.title,
          description: row.description || undefined,
          status: row.status || undefined,
          priority: row.priority || undefined,
          type: row.type || undefined,
          projectId: Number(projectId),
          assigneeId: row.assigneeId ? Number(row.assigneeId) : undefined,
        };
        await this.create(dto, userId);
        created++;
      } catch (e) {
        failed++;
        errors.push(`Row ${i + 2}: ${e.message}`);
      }
    }

    return { created, failed, errors };
  }

  // ─── Used by escalation cron ─────────────────────────────────────────────────

  async escalateOverdueTickets(): Promise<void> {
    const now = new Date();
    const overdueTickets = await this.ticketRepo
      .createQueryBuilder('t')
      .where('t.dueDate < :now', { now })
      .andWhere('t.status != :done', { done: TicketStatus.DONE })
      .andWhere('t.deletedAt IS NULL')
      .getMany();

    const ESCALATION: Record<TicketPriority, TicketPriority | null> = {
      [TicketPriority.LOW]: TicketPriority.MEDIUM,
      [TicketPriority.MEDIUM]: TicketPriority.HIGH,
      [TicketPriority.HIGH]: TicketPriority.CRITICAL,
      [TicketPriority.CRITICAL]: null, // already at max
    };

    for (const ticket of overdueTickets) {
      const nextPriority = ESCALATION[ticket.priority];

      // Already CRITICAL and already flagged — nothing to do (idempotent)
      if (!nextPriority && ticket.isOverdue) continue;

      if (nextPriority) {
        ticket.priority = nextPriority;
      }
      // Set isOverdue=true at CRITICAL (or when already CRITICAL)
      if (ticket.priority === TicketPriority.CRITICAL) {
        ticket.isOverdue = true;
      }
      await this.ticketRepo.save(ticket);

      await this.auditLog.log({
        actor: AuditActor.SYSTEM,
        action: 'ESCALATE',
        entityType: 'Ticket',
        entityId: ticket.id,
        changes: { priority: ticket.priority, isOverdue: ticket.isOverdue },
      });
    }
  }
}
