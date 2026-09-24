# DD84 LINK implementation status

The supplied Rev-A MVP has been imported into `products/dd84-link/` and integrated into the canonical `downdirty84llc-creator/downdirty84-ai-tuning` application.

- Existing Express API: persistent enrollment/ownership, expiring challenge authentication, vehicle sessions, validated log ingestion, admin-only Ed25519 simulation package release, preflash verification, A/B simulation, known-good recovery, and transactional audits.
- Existing React UI: `/dd84-link` customer status/session/log/calibration workflow and admin enrollment/release controls.
- Existing PostgreSQL migrations: `006_dd84_link.sql`; original Supabase schema is retained only as source reference.
- Firmware: fail-closed host guard with an unconditional physical-write prohibition; board adapters, signed boot verification and real controller support remain unimplemented.
- Hardware/BOM and EVT source documents preserved; DVT/PVT verification gates added.
- EVT-0 preparation: compact product brief and host-tested startup gate added. Missing or failed health evidence cannot reach READY; runtime failures latch FAULT. No physical board/capture results are claimed.

Validation commands and limitations are documented in [README](README.md). Automated CI executes existing application checks plus LINK API integration, original simulator tests and the C host guard.

No real ECU writes, OEM security-access routines, production PKI/HSM integration, custom PCB manufacturing files, wireless flashing, or bench-certified recovery are claimed. These require separate hardware/controller validation.
