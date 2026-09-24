#include "include/dd84_link.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>

int main(void) {
    dd84_vehicle_state_t state = {0};
    dd84_calibration_binding_t binding = {0};
    dd84_flash_checks_t checks = {0};
    assert(!dd84_real_write_allowed());
    assert(!dd84_preflash_evaluate(&state, &binding, &checks));
    state.signature_verified = true;
    state.version_compatible = true;
    binding.simulation_only = true;
    strcpy(state.device_serial, "DD84-TEST");
    strcpy(binding.device_serial, "DD84-TEST");
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
    state.engine_running = false;
    binding.simulation_only = false;
    assert(!dd84_preflash_evaluate(&state, &binding, &checks));
    binding.simulation_only = true;
    state.signature_verified = false;
    assert(!dd84_preflash_evaluate(&state, &binding, &checks));
    state.signature_verified = true;
    state.version_compatible = false;
    assert(!dd84_preflash_evaluate(&state, &binding, &checks));
    assert(!dd84_real_write_allowed());
    puts("flash_guard host test passed");
    return 0;
}
