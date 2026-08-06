/**
 * Outbound email.
 *
 * Until this existed the magic-link token was generated, hashed into the
 * database, and then thrown away: in production the link went nowhere, so no
 * customer could ever log in. Everything downstream — upload, analysis,
 * delivery — was unreachable behind that.
 *
 * Two rules shape this module:
 *
 *   1. A send that did not happen must never read as a send that did. Every
 *      call returns an explicit outcome, and callers surface it. Silence is
 *      the failure mode that let the original bug survive.
 *
 *   2. A failed notification must never undo work that succeeded. A released
 *      calibration stays released even if the email bounces; the owner is told
 *      so they can follow up by hand.
 *
 * Transport is Resend's HTTP API, called with global fetch — no SDK, no
 * dependency, nothing to keep patched. Adding another provider is one more
 * case in `resolveTransport` and one more branch in `deliver`.
 */

export type Transport =
  | { kind: "RESEND"; apiKey: string; from: string }
  /** Development only: prints the message instead of sending it. */
  | { kind: "CONSOLE"; from: string }
  /** Nothing configured and we are in production — refuse rather than pretend. */
  | { kind: "NONE" };

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type SendResult =
  | { ok: true; transport: "RESEND" | "CONSOLE"; id: string | null }
  | { ok: false; transport: Transport["kind"]; error: string };

const DEFAULT_FROM = "Down Dirty 84 <noreply@downdirty84llc.com>";
const SEND_TIMEOUT_MS = 10_000;

/**
 * Decide how mail leaves this process, from configuration alone.
 *
 * Pure and exported so the decision can be tested without sending anything —
 * the branch that matters most (production with nothing configured) is exactly
 * the one you never want to discover by trying it.
 */
export function resolveTransport(env: NodeJS.ProcessEnv = process.env): Transport {
  const from = env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const key = env.RESEND_API_KEY?.trim();

  if (key) return { kind: "RESEND", apiKey: key, from };
  if (env.NODE_ENV === "production") return { kind: "NONE" };
  return { kind: "CONSOLE", from };
}

/** True when real mail can actually be delivered. Used by the boot-time check. */
export function emailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveTransport(env).kind === "RESEND";
}

async function deliver(msg: EmailMessage, transport: Transport): Promise<SendResult> {
  if (transport.kind === "NONE") {
    return {
      ok: false,
      transport: "NONE",
      error: "No email transport is configured; set RESEND_API_KEY."
    };
  }

  if (transport.kind === "CONSOLE") {
    // Development convenience: the magic link has to be reachable somehow, and
    // a terminal is the least surprising place to put it.
    console.log(
      `\n[DD84 email → ${msg.to}]\n  ${msg.subject}\n${msg.text.replace(/^/gm, "  ")}\n`
    );
    return { ok: true, transport: "CONSOLE", id: null };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transport.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: transport.from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text
      }),
      // Without a timeout a hung provider holds an HTTP handler open until the
      // client gives up, and the customer sees a failed release that succeeded.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        transport: "RESEND",
        error: `Resend returned ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`
      };
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, transport: "RESEND", id: json.id ?? null };
  } catch (err) {
    return {
      ok: false,
      transport: "RESEND",
      error: String((err as Error)?.message ?? err)
    };
  }
}

/**
 * Send one message. Never throws: a notification problem is reported, not
 * raised, so it cannot roll back the thing it was announcing.
 *
 * `transport` is injectable so tests can assert on what would be sent without
 * a network call. Production callers omit it.
 */
export async function sendEmail(
  msg: EmailMessage,
  transport: Transport = resolveTransport()
): Promise<SendResult> {
  const to = msg.to?.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, transport: transport.kind, error: `Not a usable address: ${msg.to}` };
  }

  const result = await deliver({ ...msg, to }, transport);
  if (!result.ok) {
    console.error(`[DD84] email to ${to} failed (${result.transport}): ${result.error}`);
  }
  return result;
}
