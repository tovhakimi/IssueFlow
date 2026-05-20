import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './comment.entity';
import { Mention } from './mention.entity';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { MentionsController } from './mentions.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Mention]), AuditLogModule, UsersModule],
  providers: [CommentsService],
  controllers: [CommentsController, MentionsController],
  exports: [CommentsService],
})
export class CommentsModule {}
