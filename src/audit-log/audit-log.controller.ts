import { Controller, Get, Query, HttpCode } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditActor } from './audit-log.entity';

@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @HttpCode(200)
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: AuditActor,
  ) {
    return this.auditLogService.findAll({
      entityType,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      action,
      actor,
    });
  }
}
