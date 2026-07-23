declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function () {
  return String(this);
};

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { ConfigService } from '@nestjs/config';
import { apiReference } from '@scalar/nestjs-api-reference';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { DEVICE_SESSION_COOKIE } from './modules/auth/device-session.service';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
  const frontendOrigin = configService.get<string>('FRONT_END_DOMAIN');
  if (!frontendOrigin || frontendOrigin === '*') {
    throw new Error('FRONT_END_DOMAIN must be an explicit origin when credentials are enabled');
  }
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });

  if (configService.get('IS_DOCS_ENABLED') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Meerk WMS API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth(DEVICE_SESSION_COOKIE)
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const scalarPath = configService.get<string>('SCALAR_PATH') ?? '/docs';

    app.use(scalarPath, apiReference({ spec: { content: document } }));
  }

  const port = configService.get<number>('APP_PORT') ?? 3000;
  await app.listen(port);
}

if (require.main === module) {
  void bootstrap();
}
