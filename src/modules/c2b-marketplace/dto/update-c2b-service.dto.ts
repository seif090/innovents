import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateC2bServiceDto } from './create-c2b-service.dto';

export class UpdateC2bServiceDto extends PartialType(
  OmitType(CreateC2bServiceDto, ['eventId'] as const),
) {}
