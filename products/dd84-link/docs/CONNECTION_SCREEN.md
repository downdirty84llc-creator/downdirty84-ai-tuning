# Connection screen rehearsal

Sign in and open /dd84-link. The simulated-device panel appears only after the
existing authenticated overview loads. Connect demo, start simulated capture,
then stop and download a JSON report. No enrolled device is required for the demo.

This is a browser-only interaction rehearsal using synthetic counters. It does
not exercise the C wire codec, connect to USB/Bluetooth, upload raw frames, or
measure actual vehicle traffic. The separate wired-rehearsal command tests the
C-to-host representation. Neither establishes physical hardware support.

Each scheduled tick generates 100 received frames; missed-frame injection adds
up to 5 generated but missed frames. Generated = received + missed. Captures stop
at 10,000 generated frames, on user stop, simulated disconnect/fault or page hiding.
Browser scheduling can throttle ticks; counters are not a throughput benchmark.
Reconnect creates no capture until explicitly started. New captures get fresh
identifiers and counters. History retains the newest 20 completed summaries in
memory only; reload/navigation loses history. Download before leaving.

Reports identify BROWSER_SIMULATION, DD84-DEMO, SIMULATION_ONLY, and physical
validation NOT_RUN. Hardware overruns are unknown (null). They contain no vehicle
data or raw frames and must not be submitted to the numeric telemetry endpoint.
Existing enrolled-device, session, calibration and audit workflows are unchanged.

Validation: npm run test:link-capture exercises state guards, faults, reconnects,
loss accounting, report labels, page hiding, limits and bounded history. npm run
build checks frontend types and production bundling.
