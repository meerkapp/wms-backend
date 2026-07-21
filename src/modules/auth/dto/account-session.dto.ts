import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AccountSessionSchema = z.object({
  accountId: z.string().uuid(),
});

export class AccountSessionDto extends createZodDto(AccountSessionSchema) {}
