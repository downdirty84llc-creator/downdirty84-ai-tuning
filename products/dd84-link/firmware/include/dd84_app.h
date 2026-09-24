#ifndef DD84_APP_H
#define DD84_APP_H

#include <stdbool.h>

typedef enum {
    DD84_BOOT = 0, DD84_SELF_TEST, DD84_UNPROVISIONED, DD84_READY, DD84_FAULT
} dd84_app_state_t;

typedef enum {
    DD84_CHECK_UNKNOWN = 0, DD84_CHECK_PASS, DD84_CHECK_FAIL
} dd84_check_result_t;

typedef enum {
    DD84_CHECK_CLOCK = 0,
    DD84_CHECK_POWER,
    DD84_CHECK_WATCHDOG,
    DD84_CHECK_VERIFIED_BOOT,
    DD84_CHECK_RECOVERY_STORAGE,
    DD84_CHECK_CAN_RECEIVE_ONLY,
    DD84_CHECK_WIRED_TRANSPORT,
    DD84_CHECK_COUNT
} dd84_check_id_t;

typedef enum {
    DD84_IDENTITY_UNKNOWN = 0, DD84_IDENTITY_VERIFIED,
    DD84_IDENTITY_ABSENT, DD84_IDENTITY_FAILED
} dd84_identity_result_t;

/* Trusted board adapters must supply fresh results, never client input.
 * Zero-initialization means missing evidence. CAN PASS must include hardware
 * receive-only configuration verification. These flags do not implement it.
 */
typedef struct {
    dd84_check_result_t checks[DD84_CHECK_COUNT];
    dd84_identity_result_t identity;
} dd84_health_report_t;

/* Init is for reset/startup only, not a remote fault-clear command. */
void dd84_app_init(void);
void dd84_app_tick(const dd84_health_report_t *report);
dd84_app_state_t dd84_app_state(void);
bool dd84_app_capture_allowed(void);

#endif
