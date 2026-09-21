#include "dd84_link.h"
#include <string.h>

static bool hash_equal(const uint8_t a[32], const uint8_t b[32]) {
    uint8_t diff = 0u;
    for (size_t i = 0; i < 32u; ++i) diff |= (uint8_t)(a[i] ^ b[i]);
    return diff == 0u;
}

bool dd84_preflash_evaluate(const dd84_vehicle_state_t *state,
                            const dd84_calibration_binding_t *binding,
                            dd84_flash_checks_t *checks) {
    if (!state || !binding || !checks) return false;
    checks->voltage_ok = state->battery_mv >= DD84_MIN_FLASH_MV;
    checks->engine_off = !state->engine_running;
    checks->stationary = state->vehicle_speed_d10_kph == 0u;
    checks->controller_match = strncmp(state->controller_id, binding->controller_id,
                                       DD84_CONTROLLER_ID_MAX) == 0;
    checks->vin_match = hash_equal(state->vin_hash, binding->vin_hash);
    checks->backup_created = state->backup_created;
    checks->transport_stable = state->transport_stable;
    return checks->voltage_ok && checks->engine_off && checks->stationary &&
           checks->controller_match && checks->vin_match &&
           checks->backup_created && checks->transport_stable;
}
