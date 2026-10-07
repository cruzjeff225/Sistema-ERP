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
import type { NextFunction, Request, Response } from "express";
import { runtimePolicy } from './config/runtime-policy';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  app.enableShutdownHooks();

  const port = configService.get<number>("app.port") ?? 3000;
  const policy=runtimePolicy(configService.get<string>('app.nodeEnv')!,configService.get<string>('app.frontendUrl')!,configService.get<number>('app.trustProxyHops')??0);
  app.set('trust proxy',policy.trustProxyHops);

  app.use(helmet());
  app.use(cookieParser());
  app.use('/api',(_request:Request,response:Response,next:NextFunction)=>{response.setHeader('Cache-Control','no-store');next();});
  const uploadDirectory = join(process.cwd(), "uploads");
  mkdirSync(join(uploadDirectory, "product-images"), { recursive: true });
  mkdirSync(join(uploadDirectory, "purchase-expenses"), { recursive: true });
  app.use("/uploads/purchase-expenses", (_request: Request, response: Response) => response.sendStatus(404));
  app.useStaticAssets(uploadDirectory, { prefix: "/uploads/" });

  app.enableCors({
    origin: policy.allowedOrigins,
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

  if(policy.swaggerEnabled){
  const swaggerConfig = new DocumentBuilder()
    .setTitle("ERP API")
    .setDescription("API del sistema ERP modular con RBAC")
    .setVersion("1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);
  }

  await app.listen(port, "0.0.0.0");
  console.log(`Backend corriendo en http://localhost:${port}/api`);
  if(policy.swaggerEnabled) console.log(`Swagger disponible en http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error("No fue posible iniciar el backend", error);
  process.exitCode = 1;
});
