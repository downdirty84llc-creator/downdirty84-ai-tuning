import { useEffect, useMemo, useState } from "react";
import {
  getCatalog,
  startCheckout,
  formatMoney,
  type Catalog,
  type CatalogService,
  type CatalogAddon
} from "./catalog";

/**
 * The customer-facing buy page.
 *
 * Two rules shape it, both learned from bugs already fixed in this codebase:
 *
 *  1. **Never show a price Stripe will not charge.** Every amount here comes
 *     live from the Stripe account. When it cannot be confirmed the card says
 *     so and the button still works — Stripe shows the real price on the next
 *     screen. An advertised price that has drifted is a chargeback; a missing
 *     one is a mild annoyance.
 *
 *  2. **Ask what the car is, here.** Fuel and induction pick the safety
 *     thresholds the log is judged against. Collected at the moment of sale
 *     they cost the customer two dropdowns; collected later they cost an email
 *     round trip, and left blank they force the cautious profile and a warning
 *     on the report. "Not sure" stays a first-class answer, because a guess
 *     entered to get past a form is worse than a blank.
 */

const SERVICE_BLURB: Record<CatalogService["service"], string> = {
  LOG_REVIEW: "Send a datalog. You get a written review with findings, evidence and a change list.",
  PRIORITY_LOG_REVIEW: "Same as Log Review, moved to the front of the queue with same-day turnaround.",
  STAGE1_NA: "Full Stage 1 calibration for a naturally aspirated build.",
  STAGE1_BOOST: "Full Stage 1 calibration for a turbocharged or supercharged build."
};

function Price({ amount, currency }: { amount: number | null; currency: string }) {
  const text = formatMoney(amount, currency);
  if (text === null) {
    // Deliberately not "$0" and not blank — the customer needs to know the
    // number exists and will be shown, not that it is missing or free.
    return <span className="small" style={{ opacity: 0.75 }}>Price shown at checkout</span>;
  }
  return <span style={{ fontSize: 26, fontWeight: 700 }}>{text}</span>;
}

export default function Buy() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [chosen, setChosen] = useState<CatalogService["service"] | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    email: "",
    vehicle: "",
    platform: "",
    fuel: "",
    induction: ""
  });

  useEffect(() => {
    (async () => {
      try {
        setCatalog(await getCatalog());
      } catch (e) {
        setError(`Could not load the service list: ${(e as Error).message}`);
      }
    })();
  }, []);

  const selected = useMemo(
    () => catalog?.services.find((s) => s.service === chosen) ?? null,
    [catalog, chosen]
  );

  // Only meaningful when every part is known. A running total that silently
  // omits an unconfirmed price would understate what the customer pays.
  const total = useMemo(() => {
    if (!catalog || !selected) return null;
    const parts = [selected, ...catalog.addons.filter((a) => addons.includes(a.addon))];
    if (parts.some((p) => p.unitAmount === null)) return null;
    return parts.reduce((sum, p) => sum + (p.unitAmount ?? 0), 0);
  }, [catalog, selected, addons]);

  function toggleAddon(a: CatalogAddon) {
    setAddons((prev) =>
      prev.includes(a.addon) ? prev.filter((x) => x !== a.addon) : [...prev, a.addon]
    );
  }

  async function onCheckout() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const r = await startCheckout({
        service: chosen,
        addons,
        email: form.email.trim() || undefined,
        vehicle: form.vehicle.trim() || undefined,
        platform: form.platform || undefined,
        fuel: form.fuel || undefined,
        induction: form.induction || undefined
      });
      // Stripe hosts the card form. Nothing sensitive touches this app.
      window.location.href = r.checkoutUrl;
    } catch (e) {
      const m = (e as Error).message;
      setError(
        m.includes("503")
          ? "Payments are not switched on yet. Email Downdirty84llc@gmail.com and we will sort it out."
          : m
      );
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="nav">
        <div className="brand">Down Dirty 84</div>
        <button className="secondary" onClick={() => (window.location.href = "/login")}>
          Sign in
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ marginTop: 0 }}>Book a tune or a log review</h2>
        <p className="small">
          Pay, upload your datalog, and get a reviewed change list back. Every calibration change
          is checked by a person before it reaches you.
        </p>
        {catalog && !catalog.pricesLive && (
          <p className="small" style={{ color: "#fbbf24" }}>
            Live prices are temporarily unavailable — the exact amount is shown on the payment
            page before you are charged.
          </p>
        )}
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p className="small">{error}</p>
        </div>
      )}

      {!catalog && !error && <p className="small">Loading…</p>}

      {/* ── 1. What you want ─────────────────────────────────────────── */}
      {catalog && (
        <>
          <h3>1. Choose a service</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
              marginBottom: 20
            }}
          >
            {catalog.services.map((s) => {
              const active = chosen === s.service;
              return (
                <button
                  key={s.priceId}
                  onClick={() => setChosen(s.service)}
                  className={active ? "" : "secondary"}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    borderRadius: 12,
                    display: "block",
                    height: "100%"
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
                  <Price amount={s.unitAmount} currency={s.currency} />
                  <div className="small" style={{ marginTop: 8, opacity: 0.85 }}>
                    {SERVICE_BLURB[s.service]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── 2. Add-ons ─────────────────────────────────────────────── */}
          {chosen && catalog.addons.length > 0 && (
            <>
              <h3>2. Add-ons (optional)</h3>
              <div className="card" style={{ marginBottom: 20 }}>
                {catalog.addons.map((a) => {
                  const price = formatMoney(a.unitAmount, a.currency);
                  return (
                    <label
                      key={a.priceId}
                      className="row"
                      style={{ alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 6 }}
                    >
                      <input
                        type="checkbox"
                        checked={addons.includes(a.addon)}
                        onChange={() => toggleAddon(a)}
                      />
                      <span style={{ flex: 1 }}>{a.label}</span>
                      <span className="small">{price ?? "shown at checkout"}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {/* ── 3. The car ─────────────────────────────────────────────── */}
          {chosen && (
            <>
              <h3>3. Tell us about the vehicle</h3>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="row">
                  <label className="small" style={{ minWidth: 150 }}>Email</label>
                  <input
                    style={{ flex: 1 }}
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <p className="small" style={{ opacity: 0.7, marginTop: 0 }}>
                  Where your change list goes. If you leave it blank, Stripe will ask for it.
                </p>

                <div className="row">
                  <label className="small" style={{ minWidth: 150 }}>Vehicle</label>
                  <input
                    style={{ flex: 1 }}
                    placeholder="2008 Silverado 2500 6.0"
                    value={form.vehicle}
                    onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                  />
                </div>

                <div className="row">
                  <label className="small" style={{ minWidth: 150 }}>Platform</label>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  >
                    <option value="">Not sure</option>
                    <option value="GM">GM</option>
                    <option value="FORD">Ford</option>
                    <option value="DODGE">Dodge</option>
                  </select>
                </div>

                <div className="row">
                  <label className="small" style={{ minWidth: 150 }}>Fuel</label>
                  <select
                    value={form.fuel}
                    onChange={(e) => setForm({ ...form, fuel: e.target.value })}
                  >
                    <option value="">Not sure</option>
                    <option value="GASOLINE">Gasoline</option>
                    <option value="E85">E85</option>
                  </select>
                </div>

                <div className="row">
                  <label className="small" style={{ minWidth: 150 }}>Induction</label>
                  <select
                    value={form.induction}
                    onChange={(e) => setForm({ ...form, induction: e.target.value })}
                  >
                    <option value="">Not sure</option>
                    <option value="NA">Naturally aspirated</option>
                    <option value="FORCED">Turbo / supercharged</option>
                  </select>
                </div>

                <p className="small" style={{ opacity: 0.7 }}>
                  Fuel and induction decide which safety limits your log is judged against — a
                  boosted E85 build is held to different numbers than a naturally aspirated one.
                  Leave either on <b>Not sure</b> if you do not know: we then use the most
                  cautious limits and say so on your report. A guess is worse than a blank.
                </p>
              </div>

              {/* ── 4. Pay ───────────────────────────────────────────────── */}
              <h3>4. Pay</h3>
              <div className="card">
                <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div className="small" style={{ opacity: 0.7 }}>Total</div>
                    <div style={{ fontSize: 26, fontWeight: 700 }}>
                      {total !== null
                        ? formatMoney(total, selected?.currency ?? "usd")
                        : "Shown at checkout"}
                    </div>
                  </div>
                  <button onClick={onCheckout} disabled={busy}>
                    {busy ? "Opening Stripe…" : "Continue to payment"}
                  </button>
                </div>
                <p className="small" style={{ opacity: 0.7, marginBottom: 0 }}>
                  Payment is handled by Stripe. Card details never touch our servers. After paying
                  you will be sent a sign-in link to upload your log.
                </p>
              </div>
            </>
          )}
        </>
      )}

      <p className="small" style={{ opacity: 0.6, marginTop: 24 }}>
        Off-road / motorsports use only where permitted. Calibration changes can damage an engine.
        Every change list is reviewed by a person before release, and nothing is applied to your
        vehicle automatically.
      </p>
    </div>
  );
}
