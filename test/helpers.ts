import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';

export const ADMIN = {
  email: 'admin@test.com',
  password: 'Test1234!',
  firstName: 'Gavr',
  lastName: 'Balavr',
};

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function seedAdmin(app: INestApplication): Promise<{ access_token: string }> {
  const res = await request(app.getHttpServer()).post('/api/setup/init').send(ADMIN).expect(201);
  return res.body as { access_token: string };
}

export function extractCookie(res: request.Response, name: string): string | undefined {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  if (!header) return undefined;
  const cookies = Array.isArray(header) ? header : [header];
  const entry = cookies.find((c) => c.startsWith(`${name}=`));
  return entry?.split(';')[0].split('=').slice(1).join('=');
}

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.employeeRoleAssignment.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.employeeRolePermission.deleteMany();
  await prisma.employeeRole.deleteMany();
  await prisma.employeePermission.deleteMany();
  await prisma.serverSettings.deleteMany();
}
