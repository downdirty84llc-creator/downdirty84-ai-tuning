#include "dd84_app.h"
#include "dd84_link.h"
#include <assert.h>
#include <stdio.h>

static dd84_health_report_t healthy(void) {
    dd84_health_report_t report = {0};
    for (size_t i = 0; i < DD84_CHECK_COUNT; ++i)
        report.checks[i] = DD84_CHECK_PASS;
    report.identity = DD84_IDENTITY_VERIFIED;
    return report;
}

static void start(const dd84_health_report_t *report) {
    dd84_app_init();
    assert(dd84_app_state() == DD84_BOOT);
    assert(!dd84_app_capture_allowed());
    dd84_app_tick(report);
    assert(dd84_app_state() == DD84_SELF_TEST);
    assert(!dd84_app_capture_allowed());
    dd84_app_tick(report);
}

static void assert_latched_fault(void) {
    dd84_health_report_t good = healthy();
    assert(dd84_app_state() == DD84_FAULT);
    assert(!dd84_app_capture_allowed());
    dd84_app_tick(&good);
    assert(dd84_app_state() == DD84_FAULT);
    assert(!dd84_app_capture_allowed());
    assert(!dd84_real_write_allowed());
}

int main(void) {
    dd84_health_report_t good = healthy();
    dd84_health_report_t zero = {0};
    start(0);
    assert_latched_fault();
    start(&zero);
    assert_latched_fault();
    /* Test each missing/failed/invalid dependency at boot and during operation. */
    const dd84_check_result_t bad[] = {
        DD84_CHECK_UNKNOWN, DD84_CHECK_FAIL, (dd84_check_result_t)99
    };
    for (size_t i = 0; i < DD84_CHECK_COUNT; ++i) {
        for (size_t j = 0; j < sizeof bad / sizeof bad[0]; ++j) {
            dd84_health_report_t report = healthy();
            report.checks[i] = bad[j];
            start(&report);
            assert_latched_fault();
            start(&good);
            assert(dd84_app_capture_allowed());
            dd84_app_tick(&report);
            assert_latched_fault();
        }
    }
    const dd84_identity_result_t bad_identity[] = {
        DD84_IDENTITY_UNKNOWN, DD84_IDENTITY_FAILED, (dd84_identity_result_t)99
    };
    for (size_t i = 0; i < sizeof bad_identity / sizeof bad_identity[0]; ++i) {
        dd84_health_report_t report = healthy();
        report.identity = bad_identity[i];
        start(&report);
        assert_latched_fault();
        start(&good);
        dd84_app_tick(&report);
        assert_latched_fault();
    }
    dd84_health_report_t unprovisioned = healthy();
    unprovisioned.identity = DD84_IDENTITY_ABSENT;
    start(&unprovisioned);
    assert(dd84_app_state() == DD84_UNPROVISIONED);
    assert(!dd84_app_capture_allowed());
    dd84_app_tick(&unprovisioned);
    assert(dd84_app_state() == DD84_UNPROVISIONED);
    dd84_app_tick(&good);
    assert(dd84_app_state() == DD84_READY);
    assert(dd84_app_capture_allowed());
    assert(!dd84_real_write_allowed());
    dd84_app_tick(&unprovisioned);
    assert_latched_fault();
    start(&good);
    dd84_app_tick(0);
    assert_latched_fault();
    puts("startup host tests passed (no hardware validation)");
    return 0;
}
