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
      commentRepo.create.mockImplementation(dto => dto);
      commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content: 'Hi @alice', version: 1 });
      mentionRepo.find.mockResolvedValue([]);
      usersService.findByUsername.mockResolvedValue({ id: 10, username: 'alice' });

      await service.create(1, { content: 'Hi @alice' }, 2);

      expect(usersService.findByUsername).toHaveBeenCalledWith('alice');
      expect(mentionRepo.save).toHaveBeenCalled();
    });

    it('is case-insensitive when matching usernames', async () => {
      commentRepo.create.mockImplementation(dto => dto);
      commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content: 'Hi @Alice', version: 1 });
      mentionRepo.find.mockResolvedValue([]);
      usersService.findByUsername.mockResolvedValue({ id: 10, username: 'alice' });

      await service.create(1, { content: 'Hi @Alice' }, 2);

      // findByUsername is called with lowercased username
      expect(usersService.findByUsername).toHaveBeenCalledWith('alice');
    });

    it('removes stale mentions on update', async () => {
      const existingComment = { id: 1, ticketId: 1, content: 'Hi @alice', version: 2 };
      commentRepo.findOne.mockResolvedValue(existingComment);
      commentRepo.save.mockResolvedValue({ ...existingComment, content: 'No mentions' });
      // Existing mention for alice (userId 10)
      mentionRepo.find.mockResolvedValue([{ id: 5, commentId: 1, userId: 10 }]);
      usersService.findByUsername.mockResolvedValue(null); // no @mentions in new content

      await service.update(1, 1, { content: 'No mentions', version: 2 }, 2);

      // Should remove the stale mention
      expect(mentionRepo.remove).toHaveBeenCalledWith([{ id: 5, commentId: 1, userId: 10 }]);
    });

    it('adds new mentions on update without removing existing ones', async () => {
      const existingComment = { id: 1, ticketId: 1, content: 'Hi', version: 1 };
      commentRepo.findOne.mockResolvedValue(existingComment);
      commentRepo.save.mockResolvedValue({ ...existingComment, content: 'Hi @bob' });
      mentionRepo.find.mockResolvedValue([]); // no existing mentions
      usersService.findByUsername.mockResolvedValue({ id: 20, username: 'bob' });

      await service.update(1, 1, { content: 'Hi @bob', version: 1 }, 2);

      expect(mentionRepo.save).toHaveBeenCalled();
    });
  });

  describe('optimistic locking', () => {
    it('throws ConflictException on version mismatch', async () => {
      commentRepo.findOne.mockResolvedValue({ id: 1, ticketId: 1, version: 5 });

      await expect(
        service.update(1, 1, { content: 'new', version: 2 }, 2),
      ).rejects.toThrow(ConflictException);
    });
  });
});
