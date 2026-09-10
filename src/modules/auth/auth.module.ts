import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import { OtpService } from './services/otp.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ResourceOwnerGuard } from './guards/resource-owner.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    OtpService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ResourceOwnerGuard,
  ],
  exports: [
    AuthService,
    PasswordService,
    TokenService,
    OtpService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ResourceOwnerGuard,
  ],
})
export class AuthModule {}
