import { createZodDto } from 'nestjs-zod';
import { UpdateOrganizationSchema } from '@meerkapp/wms-contracts';

export class UpdateOrganizationDto extends createZodDto(UpdateOrganizationSchema) {}
