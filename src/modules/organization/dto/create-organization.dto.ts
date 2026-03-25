import { createZodDto } from 'nestjs-zod';
import { CreateOrganizationSchema } from '@meerkapp/wms-contracts';

export class CreateOrganizationDto extends createZodDto(CreateOrganizationSchema) {}
