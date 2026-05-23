import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActor } from '../audit-log/audit-log.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly repo: Repository<Project>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateProjectDto, ownerId: number): Promise<Project> {
    const project = this.repo.create({ ...dto, ownerId });
    const saved = await this.repo.save(project);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'CREATE',
      entityType: 'Project',
      entityId: saved.id,
      performedBy: ownerId,
    });
    return saved;
  }

  async findAll(): Promise<Project[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.repo.findOne({ where: { id } });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async update(id: number, dto: UpdateProjectDto, userId: number): Promise<Project> {
    const project = await this.findOne(id);
    Object.assign(project, dto);
    const saved = await this.repo.save(project);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'UPDATE',
      entityType: 'Project',
      entityId: id,
      performedBy: userId,
      changes: dto,
    });
    return saved;
  }

  async softDelete(id: number, userId: number): Promise<{ message: string }> {
    await this.findOne(id);
    await this.repo.softDelete(id);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'DELETE',
      entityType: 'Project',
      entityId: id,
      performedBy: userId,
    });
    return { message: 'Project deleted' };
  }

  async restore(id: number, userId: number): Promise<Project> {
    await this.repo.restore(id);
    const project = await this.repo.findOne({ where: { id }, withDeleted: true });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'RESTORE',
      entityType: 'Project',
      entityId: id,
      performedBy: userId,
    });
    return project;
  }

  async findDeleted(): Promise<Project[]> {
    return this.repo
      .createQueryBuilder('p')
      .withDeleted()
      .where('p.deletedAt IS NOT NULL')
      .getMany();
  }

  async getWorkload(projectId: number) {
    await this.findOne(projectId);
    // Raw query: count non-DONE tickets per DEVELOPER in this project
    const rows = await this.repo.manager.query(
      `SELECT u.id AS "userId", u.username, u."fullName",
              COUNT(t.id) FILTER (WHERE t."projectId" = $1 AND t.status != 'DONE' AND t."deletedAt" IS NULL) AS "openTicketCount"
       FROM users u
       LEFT JOIN tickets t ON t."assigneeId" = u.id
       WHERE u.role = 'DEVELOPER'
       GROUP BY u.id, u.username, u."fullName"
       ORDER BY "openTicketCount" ASC`,
      [projectId],
    );
    return rows.map(r => ({ ...r, openTicketCount: parseInt(r.openTicketCount, 10) }));
  }
}
