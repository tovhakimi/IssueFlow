import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';
import { Mention } from './mention.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';
import { ConflictException } from '@nestjs/common';

const mockRepo = () => ({
  create: jest.fn(dto => dto),
  save: jest.fn(entity => Promise.resolve({ ...entity, id: 1, version: 1 })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  remove: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
});

// Helper to build a comment with mentions for findOne mock
const commentWithMentions = (overrides: any = {}) => ({
  id: 1,
  ticketId: 1,
  authorId: 2,
  content: 'test',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  mentions: [],
  ...overrides,
});

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepo: any;
  let mentionRepo: any;
  let usersService: any;
  let auditLog: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useFactory: mockRepo },
        { provide: getRepositoryToken(Mention), useFactory: mockRepo },
        {
          provide: UsersService,
          useValue: {
            findByUsername: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CommentsService);
    commentRepo = module.get(getRepositoryToken(Comment));
    mentionRepo = module.get(getRepositoryToken(Mention));
    usersService = module.get(UsersService);
    auditLog = module.get(AuditLogService);
  });

  describe('mention parsing', () => {
    it('parses @mentions from comment body and creates mention records', async () => {
      const alice = { id: 10, username: 'alice', fullName: 'Alice A' };
      commentRepo.create.mockImplementation(dto => dto);
      commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content: 'Hi @alice', version: 1 });
      // enrichComment re-fetches the comment with eager mentions
      commentRepo.findOne.mockResolvedValue(
        commentWithMentions({ content: 'Hi @alice', mentions: [{ id: 1, commentId: 1, userId: 10, user: alice }] }),
      );
      mentionRepo.find.mockResolvedValue([]);
      usersService.findByUsername.mockResolvedValue(alice);

      const result = await service.create(1, { content: 'Hi @alice' }, 2);

      expect(usersService.findByUsername).toHaveBeenCalledWith('alice');
      expect(mentionRepo.save).toHaveBeenCalled();
      expect(result.mentionedUsers).toEqual([{ id: 10, username: 'alice', fullName: 'Alice A' }]);
    });

    it('is case-insensitive when matching usernames', async () => {
      const alice = { id: 10, username: 'alice', fullName: 'Alice A' };
      commentRepo.create.mockImplementation(dto => dto);
      commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content: 'Hi @Alice', version: 1 });
      commentRepo.findOne.mockResolvedValue(
        commentWithMentions({ content: 'Hi @Alice', mentions: [{ id: 1, commentId: 1, userId: 10, user: alice }] }),
      );
      mentionRepo.find.mockResolvedValue([]);
      usersService.findByUsername.mockResolvedValue(alice);

      await service.create(1, { content: 'Hi @Alice' }, 2);

      // findByUsername is called with lowercased username
      expect(usersService.findByUsername).toHaveBeenCalledWith('alice');
    });

    it('removes stale mentions on update', async () => {
      const existingComment = commentWithMentions({ content: 'Hi @alice', version: 2 });
      // First findOne for the update lookup
      commentRepo.findOne
        .mockResolvedValueOnce(existingComment)
        // Second findOne for enrichComment after update
        .mockResolvedValueOnce(commentWithMentions({ content: 'No mentions', version: 3 }));
      commentRepo.save.mockResolvedValue({ ...existingComment, content: 'No mentions' });
      // Existing mention for alice (userId 10)
      mentionRepo.find.mockResolvedValue([{ id: 5, commentId: 1, userId: 10 }]);
      usersService.findByUsername.mockResolvedValue(null);

      await service.update(1, 1, { content: 'No mentions', version: 2 }, 2);

      expect(mentionRepo.remove).toHaveBeenCalledWith([{ id: 5, commentId: 1, userId: 10 }]);
    });

    it('adds new mentions on update without removing existing ones', async () => {
      const existingComment = commentWithMentions({ content: 'Hi', version: 1 });
      const bob = { id: 20, username: 'bob', fullName: 'Bob B' };
      commentRepo.findOne
        .mockResolvedValueOnce(existingComment)
        .mockResolvedValueOnce(
          commentWithMentions({ content: 'Hi @bob', mentions: [{ id: 2, commentId: 1, userId: 20, user: bob }] }),
        );
      commentRepo.save.mockResolvedValue({ ...existingComment, content: 'Hi @bob' });
      mentionRepo.find.mockResolvedValue([]);
      usersService.findByUsername.mockResolvedValue(bob);

      const result = await service.update(1, 1, { content: 'Hi @bob', version: 1 }, 2);

      expect(mentionRepo.save).toHaveBeenCalled();
      expect(result.mentionedUsers).toEqual([{ id: 20, username: 'bob', fullName: 'Bob B' }]);
    });
  });

  describe('optimistic locking', () => {
    it('throws ConflictException on version mismatch', async () => {
      commentRepo.findOne.mockResolvedValue(commentWithMentions({ version: 5 }));

      await expect(
        service.update(1, 1, { content: 'new', version: 2 }, 2),
      ).rejects.toThrow(ConflictException);
    });
  });
});
