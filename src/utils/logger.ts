import { config } from "../config.ts";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private logLevel: LogLevel;
  private logFile: string;

  constructor(logLevel: LogLevel = LogLevel.INFO) {
    this.logLevel = logLevel;
    this.logFile = join(config.logs.path, `platform-${this.getDateString()}.log`);
  }

  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
  }

  private formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  private async writeToFile(message: string): Promise<void> {
    try {
      await ensureDir(config.logs.path);
      const encoder = new TextEncoder();
      const data = encoder.encode(message + "\n");
      const file = await Deno.open(this.logFile, { write: true, create: true, append: true });
      await file.write(data);
      file.close();
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  private log(level: LogLevel, levelName: string, message: string, meta?: Record<string, unknown>): void {
    if (level < this.logLevel) return;

    const formattedMessage = this.formatMessage(levelName, message, meta);
    console.log(formattedMessage);
    this.writeToFile(formattedMessage);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, "DEBUG", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, "INFO", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, "WARN", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, "ERROR", message, meta);
  }
}

// Singleton logger instance
export const logger = new Logger();
