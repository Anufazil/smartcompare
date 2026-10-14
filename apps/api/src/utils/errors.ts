export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class BadRequestError extends AppError {
  constructor(message = 'Invalid request.') {
    super('BAD_REQUEST', message, 400);
  }
}
export class NotFoundError extends AppError {
  constructor() {
    super('NOT_FOUND', 'This resource was not found.', 404);
  }
}
export class ValidationError extends AppError {
  constructor() {
    super('VALIDATION_ERROR', 'Check the product name, location and preference.', 400);
  }
}
export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMITED', 'Too many requests. Please try again in a minute.', 429);
  }
}
export class ConnectorError extends AppError {
  constructor(
    public platform: string,
    code = 'CONNECTOR_UNAVAILABLE',
    public retryable = false,
  ) {
    super(code, 'A store is temporarily unavailable.', 503);
  }
}
export class ExternalServiceError extends AppError {
  constructor() {
    super('SERVICE_UNAVAILABLE', 'We could not complete the comparison. Please try again.', 503);
  }
}
