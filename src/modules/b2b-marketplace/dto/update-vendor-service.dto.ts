import { PartialType } from '@nestjs/swagger';
import { CreateVendorServiceDto } from './create-vendor-service.dto';

export class UpdateVendorServiceDto extends PartialType(CreateVendorServiceDto) {}
