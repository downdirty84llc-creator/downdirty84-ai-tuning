#include "dd84_app.h"

/* Scaffold only. No NXP board adapters are installed. Missing evidence keeps
 * this application faulted. A board port must collect fresh trusted health
 * results and gate its capture driver with dd84_app_capture_allowed().
 */
int main(void) {
    dd84_app_init();
    for (;;) dd84_app_tick(0);
    return 0;
}
