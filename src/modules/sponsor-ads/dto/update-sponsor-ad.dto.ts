import { PartialType } from '@nestjs/swagger';
import { CreateSponsorAdDto } from './create-sponsor-ad.dto';

export class UpdateSponsorAdDto extends PartialType(CreateSponsorAdDto) {}
