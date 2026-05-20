import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';
import { Mention } from './mention.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UsersService } from '../users/users.service';

/**
 * Performance tests for mention parsing and sync.
 *
 * The regex parse is O(n) in content length.
 * syncMentions is O(m) where m = number of unique @mentions.
 * These tests guard against regressions like O(n²) mention diffing.
 */
describe('CommentsService — performance', () => {
  let service: CommentsService;

  const mockRepo = () => ({
    create: jest.fn(dto => dto),
    save: jest.fn(async entity => ({ ...entity, id: 1, version: 1 })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useFactory: mockRepo },
        { provide: getRepositoryToken(Mention), useFactory: mockRepo },
        {
          provide: UsersService,
          useValue: {
            // Resolves every username to a user (simulate they all exist)
            findByUsername: jest.fn(async (username: string) => ({
              id: username.charCodeAt(0),
              username,
            })),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  // ─── Mention parsing — pure regex ────────────────────────────────────────

  it('parses a comment with 20 unique @mentions in < 10ms', async () => {
    const mentions = Array.from({ length: 20 }, (_, i) => `@user${i}`).join(' ');
    const content = `Hey everyone: ${mentions} — please review this ticket.`;

    const commentRepo = service['commentRepo'] as any;
    const mentionRepo = service['mentionRepo'] as any;
    commentRepo.create.mockImplementation((dto: any) => dto);
    commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content, version: 1 });
    mentionRepo.find.mockResolvedValue([]);

    const start = Date.now();
    await service.create(1, { content }, 99);
    expect(Date.now() - start).toBeLessThan(10);
  });

  it('parses a very long comment (5 000 chars) with scattered @mentions in < 20ms', async () => {
    // Pad content with filler text + 10 @mentions scattered throughout
    const filler = 'lorem ipsum dolor sit amet '.repeat(100);
    const withMentions = filler.replace(
      /ipsum/g, // replace some words with @mentions
      (_, offset, str) => (offset % 500 === 0 ? '@mentioned' : 'ipsum'),
    );
    const content = withMentions.slice(0, 5000);

    const commentRepo = service['commentRepo'] as any;
    const mentionRepo = service['mentionRepo'] as any;
    commentRepo.create.mockImplementation((dto: any) => dto);
    commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content, version: 1 });
    mentionRepo.find.mockResolvedValue([]);

    const start = Date.now();
    await service.create(1, { content }, 99);
    expect(Date.now() - start).toBeLessThan(20);
  });

  // ─── Mention sync — diffing ────────────────────────────────────────────────

  it('syncing 20 new mentions (none existing) completes in < 50ms', async () => {
    const mentions = Array.from({ length: 20 }, (_, i) => `@user${i}`).join(' ');
    const content = mentions;

    const commentRepo = service['commentRepo'] as any;
    const mentionRepo = service['mentionRepo'] as any;
    commentRepo.findOne.mockResolvedValue({ id: 1, ticketId: 1, content: '', version: 1 });
    commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content, version: 2 });
    mentionRepo.find.mockResolvedValue([]); // no existing mentions

    const start = Date.now();
    await service.update(1, 1, { content, version: 1 }, 99);
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('removing 20 stale mentions completes in < 50ms', async () => {
    // Existing: 20 mentions; new content has none
    const existingMentions = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      commentId: 1,
      userId: i + 1,
    }));

    const commentRepo = service['commentRepo'] as any;
    const mentionRepo = service['mentionRepo'] as any;
    commentRepo.findOne.mockResolvedValue({
      id: 1,
      ticketId: 1,
      content: 'had many mentions',
      version: 5,
    });
    commentRepo.save.mockResolvedValue({ id: 1, ticketId: 1, content: 'no mentions', version: 6 });
    mentionRepo.find.mockResolvedValue(existingMentions);

    const usersService = service['usersService'] as any;
    usersService.findByUsername.mockResolvedValue(null); // no @mentions resolved

    const start = Date.now();
    await service.update(1, 1, { content: 'no mentions', version: 5 }, 99);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
