import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { Mention } from './mention.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActor } from '../audit-log/audit-log.entity';
import { UsersService } from '../users/users.service';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Mention)
    private readonly mentionRepo: Repository<Mention>,
    private readonly usersService: UsersService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(ticketId: number, dto: CreateCommentDto, userId: number) {
    const comment = this.commentRepo.create({ ticketId, authorId: userId, content: dto.content });
    const saved = await this.commentRepo.save(comment);

    await this.syncMentions(saved.id, dto.content);

    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'CREATE',
      entityType: 'Comment',
      entityId: saved.id,
      performedBy: userId,
    });

    // Re-fetch with mentions eager-loaded
    return this.enrichComment(saved.id, ticketId);
  }

  async findAll(ticketId: number) {
    const comments = await this.commentRepo.find({
      where: { ticketId },
      order: { createdAt: 'DESC' },
    });
    return comments.map((c) => this.formatComment(c));
  }

  async findOne(ticketId: number, commentId: number) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId, ticketId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);
    return this.formatComment(comment);
  }

  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
    userId: number,
  ) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId, ticketId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    // Optimistic locking check
    if (dto.version !== undefined && dto.version !== comment.version) {
      throw new ConflictException('Version mismatch — comment was modified concurrently');
    }

    comment.content = dto.content;
    await this.commentRepo.save(comment);

    await this.syncMentions(commentId, dto.content);

    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'UPDATE',
      entityType: 'Comment',
      entityId: commentId,
      performedBy: userId,
      changes: { content: dto.content },
    });

    // Re-fetch with mentions eager-loaded
    return this.enrichComment(commentId, ticketId);
  }

  async remove(ticketId: number, commentId: number, userId: number): Promise<{ message: string }> {
    const comment = await this.commentRepo.findOne({ where: { id: commentId, ticketId } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);
    await this.mentionRepo.delete({ commentId });
    await this.commentRepo.remove(comment);

    await this.auditLog.log({
      actor: AuditActor.USER,
      action: 'DELETE',
      entityType: 'Comment',
      entityId: commentId,
      performedBy: userId,
    });

    return { message: 'Comment deleted' };
  }

  async findMentionsByUser(
    userId: number,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    // Find comment IDs where the user is mentioned
    const [mentions, total] = await this.mentionRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    if (mentions.length === 0) {
      return { comments: [], total };
    }

    // Fetch full comments (with eager-loaded mentions) for each mention
    const commentIds = [...new Set(mentions.map((m) => m.commentId))];
    const comments = await this.commentRepo
      .createQueryBuilder('c')
      .whereInIds(commentIds)
      .orderBy('c.createdAt', 'DESC')
      .getMany();

    return {
      comments: comments.map((c) => this.formatComment(c)),
      total,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Re-fetch a comment with eager-loaded mentions and format it */
  private async enrichComment(commentId: number, ticketId: number) {
    const fresh = await this.commentRepo.findOne({ where: { id: commentId, ticketId } });
    if (!fresh) throw new NotFoundException(`Comment ${commentId} not found`);
    return this.formatComment(fresh);
  }

  /** Transform a comment entity into a response with mentionedUsers */
  private formatComment(comment: Comment) {
    const mentionedUsers = (comment.mentions || []).map((m) => ({
      id: m.user.id,
      username: m.user.username,
      fullName: m.user.fullName,
    }));

    return {
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      content: comment.content,
      version: comment.version,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      mentionedUsers,
    };
  }

  private parseMentions(content: string): string[] {
    const matches = content.match(/@([a-zA-Z0-9_]+)/g) || [];
    return [...new Set(matches.map(m => m.slice(1).toLowerCase()))];
  }

  private async syncMentions(commentId: number, content: string): Promise<void> {
    const usernames = this.parseMentions(content);

    // Resolve usernames to user IDs (case-insensitive via findByUsername)
    const mentionedUserIds: number[] = [];
    for (const username of usernames) {
      const user = await this.usersService.findByUsername(username);
      if (user) mentionedUserIds.push(user.id);
    }

    // Get existing mentions for this comment
    const existing = await this.mentionRepo.find({ where: { commentId } });
    const existingUserIds = existing.map(m => m.userId);

    // Add new mentions
    const toAdd = mentionedUserIds.filter(id => !existingUserIds.includes(id));
    for (const userId of toAdd) {
      const mention = this.mentionRepo.create({ commentId, userId });
      await this.mentionRepo.save(mention);
    }

    // Remove stale mentions
    const toRemove = existing.filter(m => !mentionedUserIds.includes(m.userId));
    if (toRemove.length > 0) {
      await this.mentionRepo.remove(toRemove);
    }
  }
}
