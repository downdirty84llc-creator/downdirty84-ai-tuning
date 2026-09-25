#include "dd84_can_capture.h"
#include "dd84_app.h"
#include "dd84_link.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static dd84_health_report_t ready(void) {
    dd84_health_report_t r = {0};
    for (size_t i = 0; i < DD84_CHECK_COUNT; ++i) r.checks[i] = DD84_CHECK_PASS;
    r.identity = DD84_IDENTITY_VERIFIED;
    dd84_app_init();
    dd84_app_tick(&r);
    dd84_app_tick(&r);
    assert(dd84_app_capture_allowed());
    return r;
}

static dd84_can_frame_t frame(uint64_t time) {
    dd84_can_frame_t f = {0};
    f.id = 0x123;
    f.timestamp_us = time;
    f.dlc = 8;
    f.length = 8;
    memset(f.data, 0xa5, sizeof f.data);
    return f;
}

static void invalid(dd84_can_frame_t f) {
    size_t before = dd84_can_capture_count();
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_INVALID);
    assert(dd84_can_capture_count() == before);
}

int main(void) {
    dd84_can_frame_t f = frame(0), out = frame(999);
    dd84_can_capture_reset();
    dd84_app_init();
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_NOT_READY);
    assert(dd84_can_capture_stats().rejected_not_ready == 1);
    dd84_health_report_t health = ready();
    dd84_app_init();
    health.identity = DD84_IDENTITY_ABSENT;
    dd84_app_tick(&health);
    dd84_app_tick(&health);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_NOT_READY);
    health = ready();
    assert(dd84_can_capture_push(0) == DD84_CAPTURE_INVALID);
    f.id = 0x800; invalid(f);
    f.extended = true; f.id = 0x20000000; invalid(f);
    f = frame(0); f.channel = 2; invalid(f);
    f = frame(0); f.remote = true; invalid(f);
    f = frame(0); f.brs = true; invalid(f);
    f = frame(0); f.dlc = 9; invalid(f);
    f = frame(0); f.length = 7; invalid(f);
    f = frame(0); f.fd = true; f.dlc = 16; invalid(f);
    f = frame(0); f.fd = true; f.dlc = 9; f.length = 9; invalid(f);
    assert(dd84_can_capture_stats().rejected_invalid == 10);

    f = frame(0);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    f.data[0] = 0; f.id = 0;
    assert(dd84_can_capture_pop(&out));
    assert(out.data[0] == 0xa5 && out.id == 0x123);

    static const uint8_t lengths[] = {0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64};
    for (size_t i = 0; i < 16; ++i) {
        f = frame(i); f.fd = true; f.brs = true; f.extended = true;
        f.id = 0x1fffffff; f.channel = i % 2; f.dlc = (uint8_t)i; f.length = lengths[i];
        assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
        assert(dd84_can_capture_pop(&out));
        assert(out.id == f.id && out.channel == f.channel && out.fd && out.brs && out.extended);
        assert(out.timestamp_us == f.timestamp_us && out.dlc == f.dlc && out.length == f.length);
        for (size_t j = 0; j < 64; ++j) assert(out.data[j] == (j < f.length ? 0xa5 : 0));
    }
    dd84_can_capture_reset();
    for (size_t i = 0; i <= 8; ++i) {
        f = frame(i); f.id = 0x7ff; f.dlc = (uint8_t)i; f.length = (uint8_t)i;
        assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
        assert(dd84_can_capture_pop(&out));
        assert(out.length == i && !out.fd);
    }

    /* FIFO and wraparound: retain old data on overflow, then reuse freed slots. */
    dd84_can_capture_reset();
    for (uint32_t i = 0; i < 256; ++i) {
        f = frame(i); f.id = i;
        assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    }
    f = frame(300);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_FULL);
    assert(dd84_can_capture_count() == 256);
    assert(!dd84_can_capture_pop(0));
    for (uint32_t i = 0; i < 128; ++i) {
        assert(dd84_can_capture_pop(&out)); assert(out.id == i && out.timestamp_us == i);
    }
    f = frame(299);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_OUT_OF_ORDER);
    for (uint32_t i = 0; i < 128; ++i) {
        f = frame(300 + i); f.id = 256 + i;
        assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    }
    for (uint32_t i = 128; i < 384; ++i) {
        assert(dd84_can_capture_pop(&out)); assert(out.id == i);
    }
    out = frame(999);
    assert(!dd84_can_capture_pop(&out)); assert(out.timestamp_us == 999);
    dd84_capture_stats_t s = dd84_can_capture_stats();
    assert(s.accepted == 384 && s.drained == 384 && s.queued == 0);
    assert(s.dropped_full == 1 && s.high_water == 256 && s.rejected_timestamp == 1);

    /* Clock extension survives a 32-bit hardware wrap; backwards time is rejected. */
    dd84_can_capture_reset();
    f = frame(UINT64_C(0xffffffff));
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    f.timestamp_us++;
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    f.timestamp_us = 0;
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_OUT_OF_ORDER);
    health.checks[DD84_CHECK_CAN_RECEIVE_ONLY] = DD84_CHECK_FAIL;
    dd84_app_tick(&health);
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_NOT_READY);
    assert(dd84_can_capture_pop(&out)); /* Diagnostic drain after health fault. */
    assert(!dd84_real_write_allowed());
    dd84_can_capture_reset();
    s = dd84_can_capture_stats();
    assert(s.accepted == 0 && s.drained == 0 && s.queued == 0 && s.high_water == 0);
    assert(s.dropped_full == 0 && s.rejected_invalid == 0 && s.rejected_not_ready == 0 && s.rejected_timestamp == 0);
    assert(!dd84_can_capture_pop(&out));
    ready();
    assert(dd84_can_capture_push(&f) == DD84_CAPTURE_ACCEPTED);
    puts("CAN capture host tests passed (no physical CAN validation)");
    return 0;
}
