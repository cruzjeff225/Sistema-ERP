import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsInt,
  IsOptional,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Type(()=>Number)
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsOptional() @IsInt() @Min(0) @Max(3) @Type(()=>Number)
  TRUST_PROXY_HOPS?: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  FRONTEND_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Variables de entorno inválidas: ${messages}`);
  }

  let frontend: URL;
  try { frontend = new URL(validatedConfig.FRONTEND_URL); } catch { throw new Error('FRONTEND_URL debe ser una URL válida'); }
  if (!['http:','https:'].includes(frontend.protocol) || frontend.pathname !== '/' || frontend.search || frontend.hash || frontend.username || frontend.password) throw new Error('FRONTEND_URL debe indicar únicamente el origen del frontend');
  let database: URL;
  try { database=new URL(validatedConfig.DATABASE_URL); } catch { throw new Error('DATABASE_URL debe ser una conexión PostgreSQL válida'); }
  if(!['postgresql:','postgres:'].includes(database.protocol)||!database.hostname||database.pathname.length<2)throw new Error('DATABASE_URL debe ser una conexión PostgreSQL válida');
  if (validatedConfig.NODE_ENV === Environment.Production) {
    if (frontend.protocol !== 'https:' || /(^localhost$|\.localhost$|\.local$|\.example$|\.invalid$|\.test$|^127\.|^\[::1\]$)/i.test(frontend.hostname)) throw new Error('Producción requiere FRONTEND_URL con HTTPS y el dominio real del ERP');
    const secrets=[validatedConfig.JWT_ACCESS_SECRET,validatedConfig.JWT_REFRESH_SECRET];
    if(secrets.some(secret=>secret.length<48||/(change[_-]?me|placeholder|example|development|default[_-]?secret)/i.test(secret))) throw new Error('Producción requiere secretos JWT aleatorios de al menos 48 caracteres');
    if(secrets[0]===secrets[1]) throw new Error('Los secretos JWT de acceso y renovación deben ser diferentes');
  }

  return validatedConfig;
}
