/* eslint-disable no-console */
export interface Logger {
  info(message: string): void;
  error(message: string): void;
}

export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(message);
  }
  error(message: string): void {
    console.error(message);
  }
}
