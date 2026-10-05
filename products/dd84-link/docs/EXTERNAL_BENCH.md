# External CAN bench preparation

Status, 2026-10-05: internal loopback and Studio 0.12 save workflow verified.
External CAN firmware, physical wiring and electrical acceptance remain pending.
Keep Bench 0.2.0 USB-only. The tools below never transmit messages or open hardware.

## Equipment

Use two active CAN interfaces on the same isolated bench bus, plus DD84 in
listen-only mode. One active interface generates traffic; the other receives and
acknowledges it. DD84 must not provide the acknowledgement. A single generator
and a silent receiver do not provide a normal acknowledged CAN bus.

Recommended: one PEAK PCAN-USB Pro FD, IPEH-004061, providing two independent CAN
channels and LIN for later development. Physically connect both CAN channels to
the same test bus. Channel 2 operates in normal receive mode with application TX
disabled; it still supplies hardware ACK. Disable any bridge or echo application.

Purchase references checked 2026-10-05; displayed prices are not checkout quotes:

| Qty | Item | Listed price | Purpose |
| --- | --- | --- | --- |
| 1 | [PCAN-USB Pro FD, IPEH-004061](https://www.gridconnect.com/products/can-usb-pro-fd-adapter-2-channels-can-lin) | $751 | Generator and ACK/reference receiver; Windows tools included |
| 2 | [Grid Connect GC-CAN-TERM-SWITCH](https://www.gridconnect.com/products/switchable-can-120-ohm-resister-terminator-db9) | $19 each | Inline switchable 120-ohm termination; vendor specifies up to 1 Mbit/s, suitable for initial classic CAN only |
| 2 | [Adafruit 4510 DE-9 female spring-terminal breakout](https://www.adafruit.com/product/4510) | $6.25 each | Wire the two male DE-9 CAN ports without soldering |
| 1 short length | [Belden 3106A CAN/RS-485 cable](https://www.belden.com/products/cable/electronic-wire-cable/multi-pair-cable/3106a) | Not quoted | Twisted pair for CAN-H/L and separate signal ground; buy cut length, not a reel |
| 1 if absent | [Klein MM400 multimeter](https://www.kleintools.com/catalog/multimeters/digital-multimeter-auto-ranging-600v) or equivalent | Not quoted | DC voltage, resistance and continuity |
| Pending | Board J15 mating lead and strain relief | Not quoted | Confirm connector family, pitch, orientation and board revision from actual board/BOM before ordering |

Priced subtotal: $801.50, excluding cable, board lead, meter, tax and shipping.
Alternative: two [PCAN-USB FD IPEH-004022](https://www.gridconnect.com/products/can-usb-fd-adapter-pcan-usb-fd)
at the observed $368 each ($736 pair). The Pro FD costs $15 more than that pair
and adds LIN in one enclosure. Buy either configuration, not both.

Borrow or use a suitable oscilloscope and probes for electrical/silent-mode
acceptance; a [Rigol DHO804](https://www.rigol.com/intl/products/oscilloscope/DHO800.html)
(four channels, 70 MHz) is a candidate for the initial classic-CAN bench.
Confirm included probes and measurement grounding before purchase/use; no price
is included in the subtotal. A multimeter and successful frame comparison cannot prove absence
of ACK/error pulses from DD84. Probe MCU CAN TX and bus activity using the board's
verified schematic/test points; do not connect logic-level analyzers directly
to CAN-H/L. This is a separate measurement step before vehicle testing.

## Wiring and power prerequisites

The user's original 20261005_071730.jpg shows CAN0_OUT as the right-hand small
four-position socket along the edge beside SW3 USER1, with LIN_OUT immediately
to its left and Ethernet above. This establishes connector location only.
The earlier generated yellow-box and red-arrow illustrations were incorrect;
neither is an assembly or pin-number reference. Connector pitch, contact fit,
pin-1 orientation and exact PCB revision still require measurement/BOM checks.

NXP UM12406 rev 2.0 documents J15: 1 CAN-H, 2 CAN-L, 3 ground, 4 NC.
This is a documentation mapping, not yet verified against the user's PCB revision.
PEAK CAN DE-9: 7 CAN-H, 2 CAN-L, 3 CAN ground. Do not connect the remaining DE-9
pins (including LIN and power) to DD84 for this test. Never supply power on J15.

Place one 120-ohm termination at each end of the trunk; DD84 is a short middle
tap. Account for any fitted onboard/adapter termination before adding resistors.
With all devices unpowered, target approximately 60 ohms between H and L across
the completed two-terminator bus. Confirm no shorts and match connector pin 1
from the silkscreen/drawing, not from a photograph's left/right orientation.

The board already has a TJA1043 transceiver. NXP documents USB-C/default power
and an FS26 boost supply, so do not buy or wire an arbitrary 12 V supply yet.
Verify actual VCC, VIO, VBAT/VSUP and jumper configuration against the correct
revision before enabling the transceiver. USB PD higher voltages need negotiation;
merely using a PD charger does not implement that negotiation.

Sources:
- [NXP board documentation and latest manual](https://www.nxp.com/design/design-center/development-boards-and-designs/FRDM-A-S32K344)
- [NXP UM12406 rev 2.0 distributor copy](https://www.mouser.com/pdfDocs/FRDM-A-S32K344-UM.pdf), sections 4 and 8
- [PEAK specifications, pinout and downloads](https://www.peak-system.com/products/hardware/external-pc-interfaces/pcan-usb-pro-fd/)

## OBD-II harness preparation (not released for vehicle use)

For a vehicle with standard high-speed CAN on OBD-II pins 6 and 14, the proposed
harness is a male J1962 OBD plug to a three-wire board lead. It does not support
every OBD protocol or provide ECU-specific calibration access.

| OBD-II pin | Function | J15 pin |
| --- | --- | --- |
| 6 | CAN-H | 1 |
| 14 | CAN-L | 2 |
| 5 | Signal ground | 3 |
| All others, including 16 | Unused in this USB-powered prototype | No connection |

Leave J15 pin 4 unwired. OBD pin 16 is battery power; individually insulate it
and every unused pigtail wire. Do not connect OBD battery power to any J15 pin.
This is a signal mapping, not a left-to-right connector drawing. Confirm pin 1
physically and use molded OBD pin numbers plus continuity checks before assembly.
Source for OBD signals: [OBD Solutions STN1110 datasheet, figure 8](https://cdn.sparkfun.com/datasheets/Widgets/stn1110-ds.pdf).

Candidate cable: [Yason/OBDWIRE J1962 male to open-end pigtail](https://www.yasoncable.com/products/16pin-obd2-male-to-open-end-pigtail-cable),
30 cm, all 16 pins wired, advertised 20 AWG; displayed price $4.80 on 2026-10-05,
shipping/tax additional. This is an unterminated cable component, not a tested
DD84 harness. Vendor does not establish twisted-pair construction or CAN-FD
signal integrity on that listing; qualify it in the initial classic-CAN bench.

If measurement confirms 2.54 mm pitch, a four-position section of
[Pololu 2664 male breakaway header](https://www.pololu.com/product/2664)
($1.09 displayed) is a candidate soldered bench plug. Verify pin thickness and
insertion depth against the actual socket as well as pitch. Solder only with the
plug removed from the unpowered board, insulate each joint separately and provide
strain relief. An unlatched header is a temporary bench connection, not a finished
vehicle connector. A housing/contact assembly with appropriate wire-size ratings
or a purpose-built breakout is preferable for repeated use. Do not force the
cable's 20 AWG wires into contacts rated only for thinner jumper wires.

Before connecting to a vehicle: finish external bench acceptance, review the
vehicle-specific CAN access and interface protection, and check onboard termination.
The two bench terminators are for the isolated test bus; do not add them to an
already terminated vehicle bus. Current Bench 0.2.0 remains USB-only.

## Offline acceptance preparation

From products/dd84-link:

```text
npm run bench:acceptance -- plan test-plan.json 1000
npm run bench:acceptance -- compare capture.bin 42 deadbeef 1000 comparison.json
```

The example session/tag above are placeholders. Use the actual capture session
and the generated plan's runTag. A plan contains ordered classic CAN frames:
alternating standard 0x321 and extended 0x18FF8432, eight-byte payload with a random
32-bit run tag followed by a big-endian 32-bit index. Initial target is 500 kbit/s,
10 frames/second. This JSON is our test specification, not a PCAN-View import file.
Generator integration is pending; do not send this traffic to a vehicle.

Capture comparison expects the existing 112-byte D84W binary stream, channel 0,
with a fresh session beginning at record sequence 0. Bench 0.2.0 JSON loopback
reports are not D84W captures and are not accepted as substitutes. Future bench
firmware must explicitly distinguish bench source from production readiness.

The comparator rejects missing/extra/reordered frames, wrong IDs/flags/payloads,
CRC errors, stream gaps, stale/wrong-session records, timestamp regression,
truncation and nonzero reported queue rejection/drop counters. It saves a SHA-256
fingerprint of the input. Output creation refuses to overwrite existing files.
Count is bounded to 10000, input to 16 MiB, issue details to 20 with full counts.

`comparisonPassed` means only that supplied bytes match the plan. Input provenance,
silent operation, physical timing and hardware loss are not established. Reports
always state externalCanValidated:false, silentModeValidated:false,
hardwareLossMeasured:false, vehicleData:false and learningEligible:false.
Missing hardware diagnostics cannot be interpreted as zero hardware loss.

## Work remaining before external test

1. Confirm physical board revision, J15 connector and supply measurements.
2. Generate/verify CAN0 pins and transceiver controls using the matching SDK.
3. Implement separate bench receive-only firmware with fresh hardware mode
   readback, bounded capture, stop behavior and explicit loss diagnostics.
4. Validate silent TX behavior electrically, then capture the known pattern.
5. Run disconnect, wrong-bitrate, overflow and reconnect cases. Keep source
   generator/reference traces with each DD84 capture and comparison result.

No physical CAN or vehicle-readiness claim follows from the offline tests.

## Preparation verification, 2026-10-05

- All 15 DD84 LINK tests passed, including five new acceptance tests.
- CLI creation, overwrite refusal, and failed-comparison report/exit-code checks passed.
- Existing Bench 0.2.0 on COM8 completed another 10 internal loopback runs: 80/80
  frames verified, CAN stopped after every run. No external wiring was tested.
