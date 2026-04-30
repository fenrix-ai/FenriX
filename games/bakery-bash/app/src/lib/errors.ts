import type { FunctionsError } from "firebase/functions";

/**
 * Extract a user-facing message from a Firebase callable error, falling
 * back to `fallback` if the error has no readable message. Checks for
 * either `code` or `message` so it accepts both `FunctionsError` (which
 * always has both) and plain `Error`-shaped rejections.
 */
export function humanizeFunctionError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && ("code" in err || "message" in err)) {
    const fnErr = err as FunctionsError;
    // Firebase surfaces unhandled backend exceptions as code="functions/internal"
    // with message="INTERNAL" — not useful to show verbatim. Match case-
    // insensitively so a future SDK formatting tweak ("Internal", "internal
    // error", etc.) still gets caught.
    const msg = typeof fnErr.message === "string" ? fnErr.message.trim() : "";
    if (fnErr.code === "functions/internal" || /^internal( error)?$/i.test(msg)) {
      return fallback;
    }
    if (fnErr.message) {
      return fnErr.message.replace(/\bminBidFloor\b/g, "Minimum Ask");
    }
  }
  return fallback;
}
