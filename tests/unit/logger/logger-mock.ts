import { expect, vi } from "vitest";

import { createMock } from "@/tests/utils/mock";

import { Logger } from "@/src/logger/logger";

export class LoggerMock implements Logger {
  private readonly mock = createMock<Logger>();
  private infoMessages: string[] = [];
  public readonly error = vi.fn();

  debug(message: string): void {
    this.mock.debug(message);
  }

  info(message: string): void {
    this.infoMessages.push(message);
    this.mock.info(message);
  }

  assertInfoToHaveBeenCalledWith(message: string): void {
    expect(this.mock.info).toHaveBeenCalledWith(message);
  }

  getInfoMessages(): string[] {
    return this.infoMessages;
  }
}
