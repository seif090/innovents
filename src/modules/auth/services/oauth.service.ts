import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, OAuthProvider } from '@prisma/client';
import * as crypto from 'crypto';

import { CryptoUtil } from '../../../common/utils/crypto.util';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../infrastructure/cache/redis.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Injectable()
export class OAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Generates the Google OAuth authorization URL.
   *
   * Security:
   * - state protects against CSRF.
   * - PKCE protects the authorization code.
   * - state + code verifier are temporarily stored in Redis.
   */
  async getGoogleAuthorizationUrl(): Promise<string> {
    const clientId = this.configService.get<string>('oauth.google.clientId');

    const callbackUrl = this.configService.get<string>('oauth.google.callbackUrl');

    const stateTtl = this.configService.get<number>('oauth.stateTtlSeconds', 600);

    if (!clientId || !callbackUrl) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    const redisHealthy = await this.redisService.ping();

    if (!redisHealthy) {
      throw new ServiceUnavailableException('OAuth temporary storage is unavailable');
    }

    // Protect against Login CSRF
    const state = CryptoUtil.generateRandomToken(32);

    // PKCE verifier
    const codeVerifier = CryptoUtil.generateRandomToken(48);

    // PKCE challenge
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // Store state and verifier temporarily in Redis
    await this.redisService.set(
      `oauth:google:state:${state}`,
      JSON.stringify({
        codeVerifier,
      }),
      stateTtl,
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Handles the callback received from Google.
   *
   * Flow:
   * 1. Validate state.
   * 2. Retrieve PKCE verifier from Redis.
   * 3. Exchange Google authorization code for Google access token.
   * 4. Retrieve Google user profile.
   * 5. Find or create INOVENT attendee.
   * 6. Link Google account to INOVENT user.
   * 7. Generate INOVENT access + refresh tokens.
   */
  async handleGoogleCallback(
    code: string,
    state: string,
  ): Promise<{
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }> {
    if (!code || !state) {
      throw new BadRequestException('Missing Google authorization code or state');
    }

    /*
     * ---------------------------------------------------------
     * 1. Validate OAuth state
     * ---------------------------------------------------------
     */

    const stateKey = `oauth:google:state:${state}`;

    const storedState = await this.redisService.get(stateKey);

    if (!storedState) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    // OAuth state must only be usable once
    await this.redisService.del(stateKey);

    let parsedState: {
      codeVerifier: string;
    };

    try {
      parsedState = JSON.parse(storedState) as {
        codeVerifier: string;
      };
    } catch {
      throw new BadRequestException('Invalid OAuth state data');
    }

    const { codeVerifier } = parsedState;

    if (!codeVerifier) {
      throw new BadRequestException('OAuth PKCE verifier is missing');
    }

    /*
     * ---------------------------------------------------------
     * 2. Google configuration
     * ---------------------------------------------------------
     */

    const clientId = this.configService.get<string>('oauth.google.clientId');

    const clientSecret = this.configService.get<string>('oauth.google.clientSecret');

    const callbackUrl = this.configService.get<string>('oauth.google.callbackUrl');

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    /*
     * ---------------------------------------------------------
     * 3. Exchange Google authorization code for token
     * ---------------------------------------------------------
     */

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },

      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Failed to exchange Google authorization code');
    }

    const googleTokens = (await tokenResponse.json()) as {
      access_token: string;
    };

    if (!googleTokens.access_token) {
      throw new BadRequestException('Google did not return an access token');
    }

    /*
     * ---------------------------------------------------------
     * 4. Retrieve Google user information
     * ---------------------------------------------------------
     */

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${googleTokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new BadRequestException('Failed to retrieve Google user profile');
    }

    const googleProfile = (await profileResponse.json()) as {
      sub: string;
      email: string;
      email_verified: boolean;
      given_name?: string;
      family_name?: string;
      picture?: string;
    };

    if (!googleProfile.sub) {
      throw new BadRequestException('Google account identifier is missing');
    }

    if (!googleProfile.email || !googleProfile.email_verified) {
      throw new ForbiddenException('Google account email must be verified');
    }

    const normalizedEmail = googleProfile.email.trim().toLowerCase();

    /*
     * ---------------------------------------------------------
     * 5. Check whether Google account is already linked
     * ---------------------------------------------------------
     */

    const oauthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: googleProfile.sub,
        },
      },

      include: {
        user: {
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let user = oauthAccount?.user ?? null;
    /*
     * ---------------------------------------------------------
     * 6. Existing INOVENT user with same email
     * ---------------------------------------------------------
     */

    if (!user) {
      user = await this.prisma.user.findFirst({
        where: {
          email: normalizedEmail,
          deletedAt: null,
        },

        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (user) {
        const isAttendee = user.userRoles.some((userRole) => userRole.role.name === 'ATTENDEE');

        /*
         * Google OAuth is currently only intended
         * for attendee accounts.
         */
        if (!isAttendee) {
          throw new ForbiddenException(
            'Google sign-in is currently available for attendee accounts only',
          );
        }

        /*
         * Link existing INOVENT attendee with Google.
         */
        await this.prisma.oAuthAccount.create({
          data: {
            userId: user.id,

            provider: OAuthProvider.GOOGLE,

            providerAccountId: googleProfile.sub,

            providerEmail: normalizedEmail,

            lastLoginAt: new Date(),
          },
        });

        /*
         * Google has already verified this email,
         * therefore the attendee can safely become verified.
         */
        user = await this.prisma.user.update({
          where: {
            id: user.id,
          },

          data: {
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),

            status: user.status === AccountStatus.PENDING ? AccountStatus.ACTIVE : user.status,
          },

          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
      }
    }

    /*
     * ---------------------------------------------------------
     * 7. Create brand-new attendee
     * ---------------------------------------------------------
     */

    if (!user) {
      const attendeeRole = await this.prisma.role.findUnique({
        where: {
          name: 'ATTENDEE',
        },
      });

      if (!attendeeRole) {
        throw new ServiceUnavailableException('ATTENDEE role is not configured');
      }

      /*
       * User model currently requires passwordHash.
       *
       * OAuth users therefore receive a cryptographically
       * random internal password that they never know.
       *
       * They can later use "Forgot Password" if they want
       * to enable password login as well.
       */
      const randomPassword = CryptoUtil.generateRandomToken(48);

      const passwordHash = await this.passwordService.hash(randomPassword);

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,

          passwordHash,

          status: AccountStatus.ACTIVE,

          emailVerifiedAt: new Date(),

          /*
           * Give the new account ATTENDEE role.
           */
          userRoles: {
            create: {
              roleId: attendeeRole.id,
            },
          },

          /*
           * Create basic attendee profile
           * from Google information.
           */
          attendeeProfile: {
            create: {
              firstName: googleProfile.given_name || 'Google',

              lastName: googleProfile.family_name || 'User',

              avatarUrl: googleProfile.picture,
            },
          },

          /*
           * Link Google account.
           */
          oauthAccounts: {
            create: {
              provider: OAuthProvider.GOOGLE,

              providerAccountId: googleProfile.sub,

              providerEmail: normalizedEmail,

              lastLoginAt: new Date(),
            },
          },
        },

        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    /*
     * ---------------------------------------------------------
     * 8. Only attendees may authenticate through this flow
     * ---------------------------------------------------------
     */

    const isAttendee = user.userRoles.some((userRole) => userRole.role.name === 'ATTENDEE');

    if (!isAttendee) {
      throw new ForbiddenException(
        'Google sign-in is currently available for attendee accounts only',
      );
    }

    /*
     * ---------------------------------------------------------
     * 9. Account lifecycle checks
     * ---------------------------------------------------------
     */

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('Your account has been suspended.');
    }

    if (user.status === AccountStatus.REJECTED) {
      throw new ForbiddenException('Your account has been rejected.');
    }

    if (user.status === AccountStatus.DEACTIVATED) {
      throw new ForbiddenException('Your account has been deactivated.');
    }

    /*
     * In case an already-linked attendee somehow remained
     * pending, Google verification activates the account.
     */
    if (user.status === AccountStatus.PENDING) {
      user = await this.prisma.user.update({
        where: {
          id: user.id,
        },

        data: {
          status: AccountStatus.ACTIVE,

          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },

        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    /*
     * ---------------------------------------------------------
     * 10. Update login timestamps
     * ---------------------------------------------------------
     */

    await this.prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        lastLoginAt: new Date(),
      },
    });

    await this.prisma.oAuthAccount.update({
      where: {
        provider_providerAccountId: {
          provider: OAuthProvider.GOOGLE,

          providerAccountId: googleProfile.sub,
        },
      },

      data: {
        lastLoginAt: new Date(),

        providerEmail: normalizedEmail,
      },
    });

    /*
     * ---------------------------------------------------------
     * 11. Collect roles
     * ---------------------------------------------------------
     */

    const roles = user.userRoles.map((userRole) => userRole.role.name);

    /*
     * ---------------------------------------------------------
     * 12. Collect permissions
     * ---------------------------------------------------------
     */

    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((userRole) =>
          userRole.role.rolePermissions.map(
            (rolePermission) =>
              `${rolePermission.permission.action}:${rolePermission.permission.resource}`,
          ),
        ),
      ),
    );

    /*
     * ---------------------------------------------------------
     * 13. Generate INOVENT JWT + refresh token
     * ---------------------------------------------------------
     */

    const tokens = await this.tokenService.generateTokens(user.id, user.email, roles, permissions);

    /*
     * ---------------------------------------------------------
     * 14. OAuth authentication complete
     * ---------------------------------------------------------
     */

    return {
      userId: user.id,

      email: user.email,

      accessToken: tokens.accessToken,

      refreshToken: tokens.refreshToken,

      expiresIn: tokens.expiresIn,
    };
  }

  async createOAuthExchangeCode(data: {
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }): Promise<string> {
    const exchangeCode = CryptoUtil.generateRandomToken(32);

    const ttl = this.configService.get<number>('oauth.exchangeTtlSeconds', 60);

    await this.redisService.set(`oauth:exchange:${exchangeCode}`, JSON.stringify(data), ttl);

    return exchangeCode;
  }

  async exchangeOAuthCode(code: string): Promise<{
    userId: string;
    email: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }> {
    if (!code) {
      throw new BadRequestException('OAuth exchange code is required');
    }

    const key = `oauth:exchange:${code}`;

    const stored = await this.redisService.get(key);

    if (!stored) {
      throw new BadRequestException('Invalid or expired OAuth exchange code');
    }

    // one-time use
    await this.redisService.del(key);

    return JSON.parse(stored) as {
      userId: string;
      email: string;
      accessToken: string;
      refreshToken: string;
      expiresIn: string;
    };
  }
}
