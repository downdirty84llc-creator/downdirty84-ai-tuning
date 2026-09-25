# Ads Manager copy

Paste-ready text for the creative in `video/`. Same sourcing rule as the video:
every claim traces to `stripe_catalog.ts`, `brand_profile.ts`, `Buy.tsx` or
`docs/ANALYSIS-ENGINE.md`. Do not add a horsepower number, a customer count, a
testimonial or a turnaround promise that is not sold in Stripe.

## Primary text

> Your tuner's calendar shouldn't decide when your car runs right.
>
> Send us a datalog instead. We read it — knock retard, wideband AFR, fuel
> trims, MAF, temps, fuel pressure — and send back written findings with the
> evidence, plus a CSV change list. Every one reviewed before it's released.
>
> Log Review $39. Need it today? Priority is $99.
>
> Down Dirty 84 — Performance ECM Tuning, Jefferson GA. Remote and in-person.

**Headline:** Datalog In. Change List Out.

**Description:** Log Review $39 · Same-day Priority $99

**CTA button:** Learn More

**Destination:** `/buy`. It already collects fuel and induction, which is the
qualifying you want happening before anyone contacts you — and per `Buy.tsx`,
a job without those is judged against the strictest thresholds and reported as
unconfirmed. Sending traffic anywhere else costs you that.

## Primary text — variant B (objection-led)

> No appointment. No dyno day. No shipping your ECU across the country.
>
> You log the car. We read the log. You get a written change list with the
> evidence behind every finding.
>
> $39 to start. $99 if you need it back the same day.

## Primary text — variant C (process-led)

> Most "remote tunes" are a file and a shrug.
>
> You get findings with the evidence window they came from, a CSV of proposed
> changes, and a human release gate before any of it reaches you. HP Tuners and
> Holley logs.
>
> Log Review, $39.

## Targeting to start

- 18–45, United States. North-east Georgia and the Atlanta metro get a
  separate ad set — the shop is in Jefferson, GA and "Jefferson, GA" on the
  end card is an asset within driving distance, dead weight elsewhere.
- Interests: HP Tuners, Holley EFI, LS swap, Coyote swap, drag racing,
  ECU tuning, Pontiac G8 / Chevrolet SS owners.
- Placements: Reels and Stories get the 9:16, Feed gets the 4:5. Turn off
  Advantage+ placements or it will crop across ratios.

## What to test first

1. **Length.** 15s vs 23.8s, same audience. Short usually wins cost-per-click,
   long usually wins lead quality. Judge on completed checkouts, not clicks.
2. **Hook.** "STILL WAITING ON YOUR TUNER?" vs an objection-led open. This is
   the first 2.8s and it decides the rest.
3. **Price framing.** Leading with $39 vs leading with the process. $39 is a
   low enough entry point that it may carry the whole ad on its own.

Change one at a time. Three variables at once tells you nothing.

## Keep this in sync

The video and this file both hard-code $39 and $99. Stripe is the source of
truth (`stripe_catalog.ts` mirrors it, `catalog_drift.ts` checks it). A price
change in Stripe makes both stale — re-render the video and edit this file.
