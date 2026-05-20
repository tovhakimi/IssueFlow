import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { UsersService } from '../src/users/users.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { UsersController } from '../src/users/users.controller';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

/**
 * E2e happy-path test using an in-memory mock (no real DB needed).
 * These verify auth flow, JWT lifecycle, and basic endpoint contracts.
 * Full integration tests against a real DB can be run with docker-compose up.
 */
describe('Auth + Users happy path (e2e)', () => {
  let app: INestApplication;

  // In-memory user store
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

  beforeAll(async () => {
    // Ensure JwtStrategy and JwtModule use the same secret
    process.env.JWT_SECRET = 'test-secret';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [AuthController, UsersController],
      providers: [
        AuthService,
        JwtStrategy,
        { provide: UsersService, useValue: mockUsersService },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let accessToken: string;

  it('POST /users — creates a user and returns 200 without passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({
        username: 'alice',
        email: 'alice@example.com',
        fullName: 'Alice Smith',
        password: 'password123',
        role: 'DEVELOPER',
      });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('POST /auth/login — returns accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;
  });

  it('GET /auth/me — returns current user from JWT', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
  });

  it('GET /auth/me — returns 401 without token', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /auth/logout — invalidates the token', async () => {
    const logoutRes = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(logoutRes.status).toBe(200);

    // Token should now be denied
    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(401);
  });

  it('GET /users — returns user list (requires fresh auth)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'password123' });
    const freshToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${freshToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].username).toBe('alice');
  });
});
