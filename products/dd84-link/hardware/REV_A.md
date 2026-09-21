# DD84 LINK Rev-A hardware specification

## Purpose
Rev-A is an engineering-validation interface for DD84 remote tuning workflows. It must identify itself cryptographically, capture CAN/CAN-FD traffic, support diagnostic request/response transports, stream or store logs, and provide a fail-closed path for future controller programming.

## Architecture
- **MCU:** NXP S32K344 class automotive MCU. Use the FRDM-A-S32K344 for EVT before a custom PCB.
- **Vehicle networks:** two independent CAN/CAN-FD channels through automotive-qualified transceivers. TJA1462 is the current preferred candidate because it is interoperable with classical CAN and CAN FD and supports CAN SIC.
- **Security:** S32K3 HSE as the primary root of trust. ATECC608B is optional as a second hardware identity element if manufacturing/provisioning workflow benefits justify it.
- **Host path:** USB-C first. Wireless is a Rev-A.2 feature after the wired protocol is stable.
- **Wireless candidate:** Murata Type 2EL / NXP IW612 class module. Do not route a custom RF design in EVT-1.
- **Storage:** external QSPI NOR, sized for firmware A/B images, recovery metadata and buffered logs.
- **Power:** OBD pin 16 input with fuse, reverse-polarity protection, load-dump/TVS stage, automotive buck, supervisor, and measured VBAT input to ADC.
- **Vehicle connector:** replaceable SAE J1962 cable, not a board-mounted plug, for early field serviceability.

## Mandatory electrical protections
1. Reverse battery.
2. Load dump and surge clamping.
3. ESD on OBD data lines and USB.
4. CAN bus fault tolerance appropriate to 12 V light-vehicle use.
5. Brownout reset and independent watchdog.
6. VBAT measurement independent of firmware-estimated voltage.
7. Hardware boot/recovery strap inaccessible during normal use.

## PCB partitions
1. OBD/power protection zone.
2. CAN transceiver zone adjacent to connector.
3. MCU/HSE/QSPI core.
4. USB/service interface.
5. Optional certified wireless module with keepout and antenna clearance.

## EVT gates before custom PCB
- USB authentication stable for 24 hours of reconnect cycles.
- CAN 500 kbit/s capture with no dropped frames at target utilization.
- CAN-FD bench capture at representative arbitration/data rates.
- Power interruption during simulated flash always returns to recovery-capable state.
- Wrong VIN/controller/signature never arms programming.
- Unit survives repeated 9–16 V supply cycling on bench before transient certification testing.

## Explicitly out of scope for EVT-1
- OEM security bypass.
- Emissions defeat functionality.
- Production J2534 certification claims.
- Arbitrary controller write algorithms.
- Wireless flashing before USB flashing/recovery is validated.
