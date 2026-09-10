import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth.constants';

export const Roles = (...roles: string[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);
