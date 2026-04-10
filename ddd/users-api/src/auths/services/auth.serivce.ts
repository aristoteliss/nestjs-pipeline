import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Capability,
  CapabilityString,
  capabilitiesToRawRules,
  type UserCapabilities,
} from '@nestjs-pipeline/casl';
import { SignJWT } from 'jose';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly queryBus: QueryBus) {}

  async authenticate(email: string, code: string): Promise<User> {
    const expectedCode = process.env.AUTH_LOGIN_CODE;
    if (!expectedCode) {
      throw new InternalServerErrorException(
        'AUTH_LOGIN_CODE is not configured',
      );
    }

    if (code !== expectedCode) {
      throw new UnauthorizedException('Invalid code');
    }

    const user = await this.queryBus.execute<GetUserQuery, User>(
      new GetUserQuery({ email }),
    );

    return user;
  }

  async signToken(user: User): Promise<AuthResult> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new InternalServerErrorException('JWT_SECRET is not configured');
    }

    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;

    const userCapabilities = await this.queryBus.execute<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >(new GetUserCapabilitiesQuery({ userId: user.id }));

    const capabilities: Array<Capability | CapabilityString> = [];
    capabilities.push(
      ...(userCapabilities.additionalCapabilities ?? []),
      ...(userCapabilities.deniedCapabilities ?? []),
    );

    const jwt = new SignJWT({
      email: user.email,
      tenantId: user.tenantId,
      department: user.department,
      roles: userCapabilities.roles,
      capabilities: capabilitiesToRawRules(capabilities),
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1h');

    if (issuer) {
      jwt.setIssuer(issuer);
    }

    if (audience) {
      jwt.setAudience(audience);
    }

    const accessToken = await jwt.sign(new TextEncoder().encode(jwtSecret));

    return {
      userId: user.id,
      userCapabilities,
      accessToken,
    };
  }
}
