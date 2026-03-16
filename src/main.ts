import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { apiReference } from '@scalar/nestjs-api-reference';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: configService.get<string>('FRONT_END_DOMAIN'),
    credentials: true,
  });

  if (configService.get('IS_DOCS_ENABLED') === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Meerk WMS API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('refresh_token')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const scalarPath = configService.get<string>('SCALAR_PATH') ?? '/docs';

    app.use(scalarPath, apiReference({ spec: { content: document } }));
  }

  const port = configService.get<number>('APP_PORT') ?? 3000;
  await app.listen(port);
}
bootstrap();
