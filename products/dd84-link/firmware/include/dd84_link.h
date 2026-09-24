#ifndef DD84_LINK_H
#define DD84_LINK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DD84_WRITE_STRATEGY_SIMULATION_ONLY 1u

#define DD84_PROTOCOL_VERSION 0x0001u
#define DD84_MIN_FLASH_MV 12200u
#define DD84_SERIAL_MAX 32u
#define DD84_CONTROLLER_ID_MAX 32u

typedef struct {
    bool signature_verified; /* Set only by trusted crypto adapter. */
    bool version_compatible;
    char device_serial[DD84_SERIAL_MAX];
    uint16_t battery_mv;
    bool engine_running;
    uint16_t vehicle_speed_d10_kph;
    bool backup_created;
    bool transport_stable;
    char controller_id[DD84_CONTROLLER_ID_MAX];
    uint8_t vin_hash[32];
} dd84_vehicle_state_t;

typedef struct {
    bool simulation_only;
    char device_serial[DD84_SERIAL_MAX];
    char controller_id[DD84_CONTROLLER_ID_MAX];
    uint8_t vin_hash[32];
} dd84_calibration_binding_t;

typedef struct {
    bool signature_ok;
    bool version_ok;
    bool device_match;
    bool simulation_only;
    bool voltage_ok;
    bool engine_off;
    bool stationary;
    bool controller_match;
    bool vin_match;
    bool backup_created;
    bool transport_stable;
} dd84_flash_checks_t;

/* Rev-A cannot authorize a physical ECU write under any conditions. */
bool dd84_real_write_allowed(void);

bool dd84_preflash_evaluate(const dd84_vehicle_state_t *state,
                            const dd84_calibration_binding_t *binding,
                            dd84_flash_checks_t *checks);

#endif
