import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from '../decorators/public.decorator';
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "../../application/services/auth.service";
import { LoginDto } from "../../application/dto/login.dto";
import { ChangeOwnPasswordDto } from "../../application/dto/change-own-password.dto";
import {
  CurrentUser,
  AuthenticatedUser,
} from "../decorators/current-user.decorator";
import { parseDurationToMs } from "../../../../common/utils/parse-duration.util";

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    const isProduction =
      this.configService.get<string>("app.nodeEnv") === "production";

    res.cookie(REFRESH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post("login")
  @ApiOperation({ summary: "Iniciar sesión" })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.authService.login(
      dto.email,
      dto.password,
    );

    this.setRefreshCookie(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      success: true,
      message: "Inicio de sesión exitoso",
      data: {
        accessToken: tokens.accessToken,
        user,
      },
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  @ApiOperation({ summary: "Renovar access token usando el refresh token" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshTokenPlain = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshTokenPlain) {
      throw new UnauthorizedException("No se encontró el refresh token");
    }

    const { tokens, user } = await this.authService.refresh(refreshTokenPlain);

    this.setRefreshCookie(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      success: true,
      message: "Token renovado correctamente",
      data: {
        accessToken: tokens.accessToken,
        user,
      },
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post("logout")
  @ApiOperation({ summary: "Cerrar sesión" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshTokenPlain = req.cookies?.[REFRESH_COOKIE_NAME];
    await this.authService.logout(refreshTokenPlain);
    this.clearRefreshCookie(res);

    return {
      success: true,
      message: "Sesión cerrada correctamente",
      data: null,
    };
  }

  @ApiBearerAuth()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Patch("password")
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangeOwnPasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.changeOwnPassword(user.sub, dto.currentPassword, dto.newPassword);
    this.clearRefreshCookie(res);
    return { success: true, message: "Contrasena actualizada. Inicie sesion nuevamente", data: null };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: "Obtener el usuario autenticado" })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const freshUser = await this.authService.getMe(user.sub);

    return {
      success: true,
      message: "Usuario autenticado obtenido correctamente",
      data: freshUser,
    };
  }
}
