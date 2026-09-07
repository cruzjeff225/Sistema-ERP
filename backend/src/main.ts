import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { mkdirSync } from "fs";
import { join } from "path";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.enableShutdownHooks();

  const port = configService.get<number>("app.port") ?? 3000;
  const frontendUrl = configService.get<string>("app.frontendUrl");
  const allowedOrigins = Array.from(
    new Set([
      frontendUrl,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ].filter((origin): origin is string => Boolean(origin))),
  );

  app.use(helmet());
  app.use(cookieParser());
  const uploadDirectory = join(process.cwd(), "uploads");
  mkdirSync(join(uploadDirectory, "product-images"), { recursive: true });
  app.useStaticAssets(uploadDirectory, { prefix: "/uploads/" });

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("ERP API")
    .setDescription("API del sistema ERP modular con RBAC")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(port, "0.0.0.0");
  console.log(`Backend corriendo en http://localhost:${port}/api`);
  console.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error("No fue posible iniciar el backend", error);
  process.exitCode = 1;
});
