#include "include/dd84_link.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>

int main(void) {
    dd84_vehicle_state_t state = {0};
    dd84_calibration_binding_t binding = {0};
    dd84_flash_checks_t checks = {0};
    state.battery_mv = 13500;
    state.engine_running = false;
    state.vehicle_speed_d10_kph = 0;
    state.backup_created = true;
    state.transport_stable = true;
    strcpy(state.controller_id, "SIM-ECM-01");
    strcpy(binding.controller_id, "SIM-ECM-01");
    memset(state.vin_hash, 0xA5, sizeof state.vin_hash);
    memset(binding.vin_hash, 0xA5, sizeof binding.vin_hash);
    assert(dd84_preflash_evaluate(&state, &binding, &checks));
    state.engine_running = true;
    assert(!dd84_preflash_evaluate(&state, &binding, &checks));
    assert(!checks.engine_off);
    puts("flash_guard host test passed");
    return 0;
}
