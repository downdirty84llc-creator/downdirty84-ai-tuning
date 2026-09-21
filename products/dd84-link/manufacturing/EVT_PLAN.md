# DD84 LINK EVT -> DVT -> PVT plan

## EVT-0: bench prototype
Build 2–3 units from FRDM-A-S32K344, CAN-FD transceiver boards, protected OBD breakout, USB-C, and a fused bench harness. Goal: protocol and recovery proof, not packaging.

## EVT-1: custom PCB
Build 5–10 boards. Validate power tree, CAN SI/EMC pre-scan, USB recovery, QSPI, hardware identity, current draw, thermal behavior and connector strain.

## DVT
Build 20–50 units in the intended enclosure. Add transient, ESD, radiated/conducted emissions/immunity pre-compliance, thermal cycling, vibration/drop appropriate to a service tool, cable life, flash interruption matrix and multi-vehicle bench coverage.

## PVT
Production fixture must: program bootloader, provision unique identity, verify certificates/keys, test both CAN channels, verify VBAT ADC, USB, storage, LEDs/button, run a signed firmware boot and print serialized label/QR.

## Never ship a unit that fails
- device identity verification
- secure boot verification
- CAN loopback / transceiver test
- measured supply/ADC sanity
- recovery mode entry
- calibration signature verification test
