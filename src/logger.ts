export interface Logger {
  log(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export class ConsoleLogger implements Logger {
  log(message: string, ...args: any[]) {
    console.log(message, ...args);
  }
  error(message: string, ...args: any[]) {
    console.error(message, ...args);
  }
  warn(message: string, ...args: any[]) {
    console.warn(message, ...args);
  }
  info(message: string, ...args: any[]) {
    console.info(message, ...args);
  }
  debug(message: string, ...args: any[]) {
    console.debug(message, ...args);
  }
}

export class NoOpLogger implements Logger {
  log() {}
  error() {}
  warn() {}
  info() {}
  debug() {}
}
