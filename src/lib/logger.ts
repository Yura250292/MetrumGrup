type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, unknown>;

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: Level =
  (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function emit(level: Level, msg: string, fields?: Fields) {
  if (!shouldLog(level)) return;
  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
  child: (base: Fields) => ({
    debug: (msg: string, fields?: Fields) => emit("debug", msg, { ...base, ...fields }),
    info: (msg: string, fields?: Fields) => emit("info", msg, { ...base, ...fields }),
    warn: (msg: string, fields?: Fields) => emit("warn", msg, { ...base, ...fields }),
    error: (msg: string, fields?: Fields) => emit("error", msg, { ...base, ...fields }),
  }),
};
