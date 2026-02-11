import { ValidationError } from './types';

/**
 * Base class for all JSONQL errors.
 */
export class JsonQLError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'JsonQLError';
    this.code = code;
  }
}

/**
 * Thrown when a query or mutation fails schema validation.
 */
export class JsonQLValidationError extends JsonQLError {
  public readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'JsonQLValidationError';
    this.errors = errors;
  }

  /** The first validation error, for fail-fast callers. */
  get firstError(): ValidationError | undefined {
    return this.errors[0];
  }
}

/**
 * Thrown when JSONQL-to-SQL transpilation fails.
 */
export class JsonQLTranspileError extends JsonQLError {
  constructor(message: string) {
    super(message, 'TRANSPILE_ERROR');
    this.name = 'JsonQLTranspileError';
  }
}

/**
 * Thrown when database execution fails.
 */
export class JsonQLExecutionError extends JsonQLError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'EXECUTION_ERROR');
    this.name = 'JsonQLExecutionError';
    this.cause = cause;
  }
}
