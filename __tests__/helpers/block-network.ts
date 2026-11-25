import http from "http";
import https from "https";
import net from "net";
import tls from "tls";

/**
 * Prevents unit tests from accidentally making live external network requests.
 * Integration tests use jest.integration.config.js which does not load this file.
 */
function throwBlocked(kind: string, target: string): never {
  const err = new Error(
    `Blocked outbound ${kind} to "${target}" in unit test. Mock the provider/HTTP client or move this test to __tests__/integration/.`,
  ) as NodeJS.ErrnoException;
  err.code = "ENETBLOCKED";
  throw err;
}

const blockedHttp = function (opts: unknown): never {
  const target =
    typeof opts === "string"
      ? opts
      : ((opts as { hostname?: string; host?: string })?.hostname ??
        (opts as { host?: string })?.host ??
        "unknown");
  return throwBlocked("http.request", target);
};

const blockedHttps = function (opts: unknown): never {
  const target =
    typeof opts === "string"
      ? opts
      : ((opts as { hostname?: string; host?: string })?.hostname ??
        (opts as { host?: string })?.host ??
        "unknown");
  return throwBlocked("https.request", target);
};

(http as unknown as { request: unknown; get: unknown }).request = blockedHttp;
(http as unknown as { request: unknown; get: unknown }).get = blockedHttp;
(https as unknown as { request: unknown; get: unknown }).request = blockedHttps;
(https as unknown as { request: unknown; get: unknown }).get = blockedHttps;

const origNetConnect = net.Socket.prototype.connect;
(net.Socket.prototype as unknown as { connect: unknown }).connect = function (
  this: net.Socket,
  ...args: unknown[]
) {
  const first = args[0] as
    | { host?: string; port?: number; path?: string }
    | undefined;
  // Allow local IPC / unix domain sockets used by Node/Jest internals
  if (first && typeof first === "object" && first.path && !first.host && !first.port) {
    return (origNetConnect as (...a: unknown[]) => unknown).apply(this, args);
  }
  const target =
    first && typeof first === "object"
      ? `${first.host ?? first.path ?? ""}:${first.port ?? ""}`
      : String(first);
  return throwBlocked("net.connect", target);
};

(tls as unknown as { connect: unknown }).connect = function (opts: unknown): never {
  const target =
    opts && typeof opts === "object"
      ? `${(opts as { host?: string; servername?: string }).host ?? (opts as { servername?: string }).servername ?? "unknown"}:${(opts as { port?: number }).port ?? ""}`
      : String(opts);
  return throwBlocked("tls.connect", target);
};

if (typeof globalThis.fetch === "function") {
  (globalThis as unknown as { fetch: (input: unknown) => Promise<never> }).fetch =
    async function (input: unknown): Promise<never> {
      return throwBlocked("fetch", String(input));
    };
}
