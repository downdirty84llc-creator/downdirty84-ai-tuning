#include "dd84_app.h"
#include <stddef.h>

static dd84_app_state_t state = DD84_BOOT;

void dd84_app_init(void) { state = DD84_BOOT; }
dd84_app_state_t dd84_app_state(void) { return state; }
bool dd84_app_capture_allowed(void) { return state == DD84_READY; }

void dd84_app_tick(const dd84_health_report_t *report) {
    if (state == DD84_FAULT) return;
    if (state == DD84_BOOT) {
        state = DD84_SELF_TEST;
        return;
    }
    if (!report) {
        state = DD84_FAULT;
        return;
    }
    for (size_t i = 0; i < DD84_CHECK_COUNT; ++i) {
        if (report->checks[i] != DD84_CHECK_PASS) {
            state = DD84_FAULT;
            return;
        }
    }
    switch (report->identity) {
        case DD84_IDENTITY_VERIFIED:
            state = DD84_READY;
            break;
        case DD84_IDENTITY_ABSENT:
            /* Losing a previously verified identity is a runtime fault. */
            state = state == DD84_READY ? DD84_FAULT : DD84_UNPROVISIONED;
            break;
        default:
            state = DD84_FAULT;
            break;
    }
}
