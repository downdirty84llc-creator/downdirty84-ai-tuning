/**
 * The three messages this business actually needs to send.
 *
 * Each one closes a gap where the pipeline used to stop and wait for someone
 * to notice something:
 *
 *   signInEmail       the customer could not log in at all — the link was
 *                     generated and discarded
 *   reportReadyEmail  after the owner released, nothing told the customer;
 *                     the owner had to write that email by hand, every job
 *   reviewWaitingEmail the owner had to remember to check the queue
 *
 * The bodies are plain text on purpose. Plain text renders identically in
 * every client, never lands in a promotions tab for looking like a newsletter,
 * and cannot leak a broken layout to a customer. The disclaimer is the brand's
 * own, not a paraphrase.
 */

import { getBrandProfile } from "../brand/brand_profile.js";
import { sendEmail, type EmailMessage, type SendResult, type Transport } from "./email.js";

function appBase(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Magic-link sign-in. Without this nobody can reach the product. */
export function signInEmail(to: string, url: string, ttlMinutes: number): EmailMessage {
  const brand = getBrandProfile();
  return {
    to,
    subject: `Your ${brand.brandName} sign-in link`,
    text: [
      `Here is your sign-in link for ${brand.brandName}:`,
      "",
      url,
      "",
      `It works once and expires in ${ttlMinutes} minutes.`,
      "",
      "If you did not request it, you can ignore this email — the link is",
      "useless without this inbox.",
      "",
      `— ${brand.brandName}`,
      brand.website
    ].join("\n")
  };
}

/**
 * Payment received — and the link that lets them act on it.
 *
 * Without this a customer paid and heard nothing: no receipt from us, no way
 * into the app, and no idea what to do next. Bundling the sign-in link into
 * the confirmation removes the step where they have to go and request one,
 * which is the step people abandon.
 */
export function paymentReceivedEmail(args: {
  to: string;
  serviceLabel: string;
  amountCents: number;
  currency: string;
  signInUrl: string;
  ttlMinutes: number;
}): EmailMessage {
  const brand = getBrandProfile();
  const money = `$${(args.amountCents / 100).toFixed(2)} ${args.currency.toUpperCase()}`;

  return {
    to: args.to,
    subject: `${brand.brandName} — payment received for ${args.serviceLabel}`,
    text: [
      `Thanks — we have your payment of ${money} for ${args.serviceLabel}.`,
      "",
      "Next step is yours: upload your datalog. This link signs you in and takes",
      "you straight to the upload page.",
      "",
      args.signInUrl,
      "",
      `It works once and expires in ${args.ttlMinutes} minutes. If it lapses, request`,
      `a new one from the sign-in page — your job is already waiting on your account.`,
      "",
      "What happens after you upload:",
      "  1. Your log is parsed and checked against safety and drivability rules",
      "  2. Suggested changes are calculated with a confidence per correction",
      "  3. A person reviews and releases them — this never happens automatically",
      "  4. You get an email with the change list and a CSV",
      "",
      `Questions: ${brand.supportEmail}`,
      "",
      `— ${brand.brandName}`,
      brand.website
    ].join("\n")
  };
}

/**
 * The customer's change list is released.
 *
 * Carries the short disclaimer, because this is the message that precedes
 * someone flashing a calibration.
 */
export function reportReadyEmail(args: {
  to: string;
  vehicle: string | null;
  itemCount: number;
  largestChangePct: number;
  diffSetId: string;
}): EmailMessage {
  const brand = getBrandProfile();
  const vehicle = args.vehicle?.trim() || "your vehicle";

  return {
    to: args.to,
    subject: `${brand.brandName} — your change list for ${vehicle} is ready`,
    text: [
      `Your log has been reviewed and the change list for ${vehicle} is released.`,
      "",
      `  Changes:        ${args.itemCount}`,
      `  Largest change: ${args.largestChangePct.toFixed(1)}%`,
      "",
      "Open it here — the summary and the CSV are both on that page:",
      `${appBase()}/diffsets/${args.diffSetId}`,
      "",
      "Before you flash:",
      brand.disclaimer.short.replace(/\. /g, ".\n"),
      "",
      `Questions: ${brand.supportEmail}`,
      "",
      `— ${brand.brandName}`,
      brand.website
    ].join("\n")
  };
}

/**
 * A job is waiting on the owner.
 *
 * Everything needed to judge it is in the message, so most jobs can be decided
 * from a phone without opening the queue. Attention flags are listed in full —
 * a summarised warning is a warning that gets skimmed.
 */
export function reviewWaitingEmail(args: {
  to: string;
  vehicle: string | null;
  customerEmail: string;
  itemCount: number;
  largestChangePct: number;
  lowestConfidence: number;
  blockers: number;
  warnings: number;
  attention: string[];
  diffSetId: string;
}): EmailMessage {
  const brand = getBrandProfile();
  const vehicle = args.vehicle?.trim() || "unspecified vehicle";

  const lines = [
    `A change list is waiting for your release.`,
    "",
    `  Vehicle:        ${vehicle}`,
    `  Customer:       ${args.customerEmail}`,
    `  Changes:        ${args.itemCount}`,
    `  Largest change: ${args.largestChangePct.toFixed(1)}%`,
    `  Lowest conf.:   ${args.lowestConfidence.toFixed(2)}`,
    `  Safety:         ${args.blockers} blocker(s), ${args.warnings} warning(s)`,
    ""
  ];

  if (args.attention.length > 0) {
    lines.push("Worth a look before you approve:");
    for (const flag of args.attention) lines.push(`  • ${flag}`);
    lines.push("");
  }

  lines.push(
    "Review and decide:",
    `${appBase()}/admin/queue`,
    "",
    `DiffSet ${args.diffSetId}`,
    "",
    `— ${brand.brandName}`
  );

  return {
    to: args.to,
    subject: `${brand.brandName} — ${vehicle} waiting for release`,
    text: lines.join("\n")
  };
}

/** Everyone configured to release calibrations. Env-only, same as admin rights. */
export function adminRecipients(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

/**
 * Send without letting a failure propagate into the caller's transaction.
 *
 * The result is returned rather than swallowed, so a route can tell the owner
 * "released, but the customer was not emailed" instead of quietly implying it
 * went out.
 */
export async function notify(
  msg: EmailMessage,
  transport?: Transport
): Promise<SendResult> {
  try {
    return await sendEmail(msg, transport);
  } catch (err) {
    const error = String((err as Error)?.message ?? err);
    console.error(`[DD84] notification to ${msg.to} threw: ${error}`);
    return { ok: false, transport: "NONE", error };
  }
}
