import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditActor } from './audit-log.entity';

export interface CreateAuditLogDto {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: number;
  performedBy?: number;
  changes?: Record<string, any>;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(dto: CreateAuditLogDto): Promise<void> {
    const entry = this.repo.create(dto);
    await this.repo.save(entry);
  }

  async findAll(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actor?: AuditActor;
  }) {
    const qb = this.repo.createQueryBuilder('log').orderBy('log.timestamp', 'DESC');

    if (filters.entityType) qb.andWhere('log.entityType = :entityType', { entityType: filters.entityType });
    if (filters.entityId) qb.andWhere('log.entityId = :entityId', { entityId: filters.entityId });
    if (filters.action) qb.andWhere('log.action = :action', { action: filters.action });
    if (filters.actor) qb.andWhere('log.actor = :actor', { actor: filters.actor });

    return qb.getMany();
  }
}
