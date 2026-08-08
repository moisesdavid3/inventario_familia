import pino, { type Logger } from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const isWorker =
  typeof (globalThis as { caches?: unknown }).caches !== "undefined";

function workerLogger(): Logger {
  const write = (level: string, args: unknown[]) => {
    if (args.length === 0) return;
    const [first, second] = args;
    if (typeof first === "string") {
      console.log(`[${level}]`, first);
    } else if (second !== undefined) {
      console.log(`[${level}]`, first, second);
    } else {
      console.log(`[${level}]`, first);
    }
  };
  const logger = {
    level: "info",
    child: () => logger,
    trace: (...args: unknown[]) => write("trace", args),
    debug: (...args: unknown[]) => write("debug", args),
    info: (...args: unknown[]) => write("info", args),
    warn: (...args: unknown[]) => write("warn", args),
    error: (...args: unknown[]) => write("error", args),
    fatal: (...args: unknown[]) => write("fatal", args),
    silent: () => {},
  };
  return logger as unknown as Logger;
}

export const logger: Logger = isWorker
  ? workerLogger()
  : pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']",
      ],
      ...(isProduction
        ? {}
        : {
            transport: {
              target: "pino-pretty",
              options: { colorize: true },
            },
          }),
    });
