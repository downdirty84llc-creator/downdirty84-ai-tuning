#ifndef DD84_LINK_H
#define DD84_LINK_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DD84_PROTOCOL_VERSION 0x0001u
#define DD84_MIN_FLASH_MV 12200u
#define DD84_SERIAL_MAX 32u
#define DD84_CONTROLLER_ID_MAX 32u

typedef struct {
    uint16_t battery_mv;
    bool engine_running;
    uint16_t vehicle_speed_d10_kph;
    bool backup_created;
    bool transport_stable;
    char controller_id[DD84_CONTROLLER_ID_MAX];
    uint8_t vin_hash[32];
} dd84_vehicle_state_t;

typedef struct {
    char controller_id[DD84_CONTROLLER_ID_MAX];
    uint8_t vin_hash[32];
} dd84_calibration_binding_t;

typedef struct {
    bool voltage_ok;
    bool engine_off;
    bool stationary;
    bool controller_match;
    bool vin_match;
    bool backup_created;
    bool transport_stable;
} dd84_flash_checks_t;

bool dd84_preflash_evaluate(const dd84_vehicle_state_t *state,
                            const dd84_calibration_binding_t *binding,
                            dd84_flash_checks_t *checks);

#endif
