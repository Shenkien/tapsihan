import { NextResponse } from "next/server";

/**
 * Every dynamic [id] route segment arrives as a string straight from the
 * URL — `Number("abc")` is `NaN`, and passing that into a Prisma
 * `where: { id: NaN }` throws a raw 500 instead of a clean error. Call this
 * right after destructuring `id` from `params` and return early if it's
 * set: it means the id in the URL wasn't a positive integer.
 */
export function invalidIdResponse(id: string): NextResponse | null {
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  return null;
}

/** Parses a JSON body, returning null (instead of throwing a 500) if it's missing or malformed. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** JSON response the browser and any proxy must never keep a copy of (passwords, account data). */
export function noStoreJson(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, {
    status: init.status,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

/** Turns a failed re-authentication into the HTTP response for it. */
export function reauthFailureResponse(r: { status: number; error: string; retryAfterSec?: number }) {
  return NextResponse.json(
    { error: r.error },
    {
      status: r.status,
      headers: r.retryAfterSec ? { "Retry-After": String(r.retryAfterSec) } : undefined,
    }
  );
}

/**
 * An error that carries the HTTP status it should turn into. Throw it from
 * shared service code (e.g. markOrderPaid) and let the route hand it to
 * toErrorResponse() — no more guessing the status from the message text.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Known HttpErrors keep their own status and message. Anything else is an
 * unexpected failure: it is logged on the server and the caller only sees a
 * generic 500, so Prisma/connection details never leak to the browser.
 */
export function toErrorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
