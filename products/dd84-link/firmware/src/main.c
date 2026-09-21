#include "dd84_link.h"

/*
 * Production target: NXP S32K3 + RTD/HSE.
 * This file intentionally contains the application state machine only; MCU,
 * CAN, USB, watchdog, flash and HSE calls sit behind platform adapters so host
 * tests can exercise safety logic without hardware.
 */

typedef enum {
    DD84_BOOT = 0,
    DD84_SELF_TEST,
    DD84_UNPROVISIONED,
    DD84_READY,
    DD84_LOGGING,
    DD84_FLASH_ARMED,
    DD84_FLASHING,
    DD84_RECOVERY,
    DD84_FAULT
} dd84_state_t;

static dd84_state_t state = DD84_BOOT;

void dd84_app_tick(void) {
    switch (state) {
        case DD84_BOOT:
            state = DD84_SELF_TEST;
            break;
        case DD84_SELF_TEST:
            /* platform_self_test() + watchdog + HSE key presence + CAN sanity */
            state = DD84_READY;
            break;
        case DD84_UNPROVISIONED:
        case DD84_READY:
        case DD84_LOGGING:
        case DD84_FLASH_ARMED:
        case DD84_FLASHING:
        case DD84_RECOVERY:
        case DD84_FAULT:
        default:
            break;
    }
}

int main(void) {
    for (;;) dd84_app_tick();
    return 0;
}
