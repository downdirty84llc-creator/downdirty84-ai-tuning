/**
 * Deciding what an HTTP response from "Resend" actually means.
 *
 * This exists because the naive version got it wrong in a way that caused
 * real harm: a container network policy answered 403 to the CONNECT, the
 * request never reached Resend at all, and the setup check reported "the key
 * is wrong or was revoked" — advice that would have had someone revoke a
 * perfectly good key while the real problem (no route to api.resend.com) went
 * untouched.
 *
 * Two lessons are encoded here:
 *
 *   1. A status code alone does not identify who answered. A proxy, a captive
 *      portal and an API all speak HTTP, and only one of them knows anything
 *      about your credentials. Resend's errors carry a JSON body; a network
 *      denial carries plain text.
 *
 *   2. 403 from Resend is usually not a fault at all. A "Sending access" key
 *      cannot list domains — that is the *better* security posture, and
 *      calling it broken pushes people toward a full-access key.
 *
 * Pure and separately tested, because it is the branch that decides whether a
 * customer-facing operator is told to throw away a working credential.
 */

export type ResendVerdict =
  /** Something that is not Resend answered. The key was never tested. */
  | { kind: "NOT_REACHED"; status: number; detail: string }
  /** Resend says the key is bad. */
  | { kind: "KEY_REJECTED"; message: string }
  /** Valid key, scoped to sending only. Cannot list domains, which is fine. */
  | { kind: "KEY_RESTRICTED"; message: string }
  /** Resend answered with some other error. */
  | { kind: "API_ERROR"; status: number; message: string }
  /** Success, with the domain list. */
  | { kind: "OK"; domains: Array<{ name: string; status: string }> };

export function classifyResendResponse(input: {
  status: number;
  ok: boolean;
  rawBody: string;
}): ResendVerdict {
  let parsed: any = null;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    parsed = null;
  }
  // Only an object counts. A bare JSON string or number in the body is not
  // Resend's error envelope, and treating it as one would reintroduce the bug.
  const fromResend = parsed !== null && typeof parsed === "object";

  if (!input.ok && !fromResend) {
    return {
      kind: "NOT_REACHED",
      status: input.status,
      detail: input.rawBody.slice(0, 120) || "empty body"
    };
  }

  if (input.status === 401) {
    return { kind: "KEY_REJECTED", message: parsed?.message ?? "unauthorized" };
  }

  if (input.status === 403) {
    if (parsed?.name === "restricted_api_key" || /restricted/i.test(parsed?.message ?? "")) {
      return { kind: "KEY_RESTRICTED", message: parsed?.message ?? "restricted key" };
    }
    return { kind: "API_ERROR", status: 403, message: parsed?.message ?? "forbidden" };
  }

  if (!input.ok) {
    return { kind: "API_ERROR", status: input.status, message: parsed?.message ?? "" };
  }

  return { kind: "OK", domains: Array.isArray(parsed?.data) ? parsed.data : [] };
}
