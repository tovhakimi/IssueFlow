import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  // In-memory deny-list for invalidated JTIs (sufficient for assignment scope)
  private readonly deniedTokens = new Set<string>();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    return user;
  }

  async login(username: string, password: string) {
    const user = await this.validateUser(username, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const jti = randomUUID();
    const payload = { sub: user.id, username: user.username, role: user.role, jti };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  logout(token: string) {
    try {
      const payload = this.jwtService.verify<{ jti: string }>(token);
      this.deniedTokens.add(payload.jti);
    } catch {
      // Invalid or expired token — no-op
    }
  }

  isTokenDenied(jti: string): boolean {
    return this.deniedTokens.has(jti);
  }
}
