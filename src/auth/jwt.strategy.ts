import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  jti: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'issueflow-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (this.authService.isTokenDenied(payload.jti)) {
      throw new UnauthorizedException('Token has been invalidated');
    }
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
