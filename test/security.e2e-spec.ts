import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { randomUUID } from 'crypto';

import { UsersService } from '../src/users/users.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UsersController } from '../src/users/users.controller';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { ProjectsController } from '../src/projects/projects.controller';
import { ProjectsService } from '../src/projects/projects.service';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UserRole } from '../src/users/user.entity';

/**
 * Security tests — verify that the API correctly rejects:
 * - Wrong credentials
 * - Malformed / tampered / missing JWT tokens
 * - DEVELOPER users accessing ADMIN-only endpoints
 * - Sensitive fields never leaking in responses
 * - Input containing SQL-injection-like strings
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const users: any[] = [];
  let userIdSeq = 1;

  const mockUsersService = {
    create: jest.fn(async (dto: any) => {
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = { id: userIdSeq++, ...dto, passwordHash, createdAt: new Date() };
      delete user.password;
      users.push(user);
      const { passwordHash: _ph, ...rest } = user;
      return rest;
    }),
    findAll: jest.fn(async () => users.map(({ passwordHash: _ph, ...u }) => u)),
    findOne: jest.fn(async (id: number) => {
      const u = users.find(u => u.id === id);
      if (!u) throw new Error('not found');
      const { passwordHash: _ph, ...rest } = u;
      return rest;
    }),
    findByUsername: jest.fn(async (username: string) =>
      users.find(u => u.username === username),
    ),
    update: jest.fn(),
  };

  const mockProjectsService = {
    create: jest.fn(),
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    findDeleted: jest.fn().mockResolvedValue([]),
    getWorkload: jest.fn(),
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController, UsersController, ProjectsController],
      providers: [
        AuthService,
        JwtStrategy,
        RolesGuard,
        { provide: UsersService, useValue: mockUsersService },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    jwtService = moduleFixture.get(JwtService);

    // Seed two users: one ADMIN, one DEVELOPER
    await request(app.getHttpServer()).post('/users').send({
      username: 'admin',
      email: 'admin@example.com',
      fullName: 'Admin User',
      password: 'adminpass',
      role: UserRole.ADMIN,
    });
    await request(app.getHttpServer()).post('/users').send({
      username: 'developer',
      email: 'dev@example.com',
      fullName: 'Dev User',
      password: 'devpass',
      role: UserRole.DEVELOPER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Helper ─────────────────────────────────────────────────────────────────

  async function loginAs(username: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password });
    return res.body.accessToken;
  }

  // ─── Authentication Attacks ──────────────────────────────────────────────────

  describe('authentication', () => {
    it('rejects login with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('rejects login with non-existent username', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'pass' });
      expect(res.status).toBe(401);
    });

    it('rejects request with no Authorization header', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('rejects request with malformed Authorization header (no Bearer prefix)', async () => {
      const token = await loginAs('admin', 'adminpass');
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', token); // missing "Bearer "
      expect(res.status).toBe(401);
    });

    it('rejects a structurally invalid JWT (random string)', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.jwt');
      expect(res.status).toBe(401);
    });

    it('rejects a JWT signed with a different secret (tampered)', async () => {
      // Sign with a different secret — should fail verification
      const tampered = jwtService.sign(
        { sub: 1, username: 'admin', role: 'ADMIN', jti: randomUUID() },
        { secret: 'wrong-secret' },
      );
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });

    it('rejects a token after logout (deny-list)', async () => {
      const token = await loginAs('admin', 'adminpass');

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  // ─── Authorization (Role-Based) ──────────────────────────────────────────────

  describe('authorization', () => {
    it('DEVELOPER cannot access GET /projects/deleted (ADMIN-only)', async () => {
      const token = await loginAs('developer', 'devpass');
      const res = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('ADMIN can access GET /projects/deleted', async () => {
      const token = await loginAs('admin', 'adminpass');
      const res = await request(app.getHttpServer())
        .get('/projects/deleted')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('DEVELOPER cannot access POST /projects/:id/restore (ADMIN-only)', async () => {
      const token = await loginAs('developer', 'devpass');
      const res = await request(app.getHttpServer())
        .post('/projects/1/restore')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Sensitive Data Exposure ──────────────────────────────────────────────────

  describe('sensitive data', () => {
    it('POST /users response never contains passwordHash', async () => {
      const res = await request(app.getHttpServer()).post('/users').send({
        username: 'newuser',
        email: 'new@example.com',
        fullName: 'New User',
        password: 'secret123',
        role: 'DEVELOPER',
      });
      expect(res.status).toBe(200);
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.password).toBeUndefined();
    });

    it('GET /users response never contains passwordHash', async () => {
      const token = await loginAs('admin', 'adminpass');
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      for (const user of res.body) {
        expect(user.passwordHash).toBeUndefined();
        expect(user.password).toBeUndefined();
      }
    });

    it('GET /auth/me does not expose passwordHash', async () => {
      const token = await loginAs('admin', 'adminpass');
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.passwordHash).toBeUndefined();
    });
  });

  // ─── Input Validation ─────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('rejects POST /users with missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ username: 'incomplete' }); // missing email, fullName, password
      expect(res.status).toBe(400);
    });

    it('rejects POST /users with invalid email format', async () => {
      const res = await request(app.getHttpServer()).post('/users').send({
        username: 'bademail',
        email: 'not-an-email',
        fullName: 'Bad Email',
        password: 'pass123',
      });
      expect(res.status).toBe(400);
    });

    it('rejects POST /users with password shorter than 6 characters', async () => {
      const res = await request(app.getHttpServer()).post('/users').send({
        username: 'shortpass',
        email: 'short@example.com',
        fullName: 'Short Pass',
        password: '123',
      });
      expect(res.status).toBe(400);
    });

    it('strips unknown fields from request body (whitelist)', async () => {
      // "isAdmin: true" should be silently stripped, not cause an error or escalate privileges
      const res = await request(app.getHttpServer()).post('/users').send({
        username: 'injectionattempt',
        email: 'inject@example.com',
        fullName: 'Inject',
        password: 'pass123',
        isAdmin: true,
        role: 'ADMIN', // valid field — but let's check it comes through as-is
        __proto__: { admin: true }, // prototype pollution attempt
      });
      expect(res.status).toBe(200);
      // The response should not have any extra unexpected fields beyond the User shape
      expect(res.body.isAdmin).toBeUndefined();
    });

    it('handles SQL-injection-like strings in login body safely', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: "' OR '1'='1", password: "' OR '1'='1" });
      // Should return 401, not 200 and not 500
      expect(res.status).toBe(401);
    });
  });
});
