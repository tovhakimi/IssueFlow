import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';

import { User } from './users/user.entity';
import { Project } from './projects/project.entity';
import { Ticket } from './tickets/ticket.entity';
import { TicketDependency } from './tickets/ticket-dependency.entity';
import { Attachment } from './tickets/attachment.entity';
import { Comment } from './comments/comment.entity';
import { Mention } from './comments/mention.entity';
import { AuditLog } from './audit-log/audit-log.entity';

import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { SchedulerModule } from './scheduler/scheduler.module';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'issueflow',
      password: process.env.DB_PASS || 'issueflow',
      database: process.env.DB_NAME || 'issueflow',
      entities: [User, Project, Ticket, TicketDependency, Attachment, Comment, Mention, AuditLog],
      synchronize: true, // dev only — auto-creates tables from entities
    }),
    UsersModule,
    AuthModule,
    ProjectsModule,
    TicketsModule,
    CommentsModule,
    AuditLogModule,
    SchedulerModule,
  ],
  providers: [
    // Apply JWT guard globally; use @Public() decorator to opt out
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
