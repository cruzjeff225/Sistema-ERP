import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  ApiErrorField,
  ApiErrorResponse,
} from "../interfaces/api-response.interface";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Error interno del servidor";
    let errors: ApiErrorField[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const responseObj = exceptionResponse as Record<string, unknown>;
        const rawMessage = responseObj.message;

        if (Array.isArray(rawMessage)) {
          message = "Validation failed";
          errors = rawMessage.map((msg) => {
            const parts = String(msg).split(" ");
            return {
              field: parts[0] ?? "unknown",
              message: String(msg),
            };
          });
        } else if (typeof rawMessage === "string") {
          message = rawMessage;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const body: ApiErrorResponse = {
      success: false,
      statusCode,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }
}
