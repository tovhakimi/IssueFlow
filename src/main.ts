import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { mkdirSync } from 'fs';

async function bootstrap() {
  // Ensure uploads directory exists before app starts
  const uploadPath = process.env.UPLOAD_PATH || './uploads';
  mkdirSync(uploadPath, { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Global validation pipe: strip unknown fields, auto-transform types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  await app.listen(3000);
}
bootstrap();
