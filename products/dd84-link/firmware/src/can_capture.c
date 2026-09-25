#include "dd84_can_capture.h"
#include "dd84_app.h"
#include <string.h>

static dd84_can_frame_t ring[DD84_CAN_RING_CAPACITY];
static size_t tail;
static size_t count;
static uint64_t last_timestamp;
static bool have_timestamp;
static dd84_capture_stats_t stats;

static bool valid(const dd84_can_frame_t *f) {
    static const uint8_t fd_lengths[16] = {
        0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64
    };
    if (!f || f->channel >= DD84_CAN_CHANNEL_COUNT || f->remote) return false;
    if (f->id > (f->extended ? 0x1fffffffu : 0x7ffu)) return false;
    if (f->fd) return f->dlc <= 15u && f->length == fd_lengths[f->dlc];
    return !f->brs && f->dlc <= 8u && f->length == f->dlc;
}

void dd84_can_capture_reset(void) {
    memset(ring, 0, sizeof ring);
    memset(&stats, 0, sizeof stats);
    tail = 0;
    count = 0;
    last_timestamp = 0;
    have_timestamp = false;
}

dd84_capture_result_t dd84_can_capture_push(const dd84_can_frame_t *frame) {
    if (!dd84_app_capture_allowed()) {
        ++stats.rejected_not_ready;
        return DD84_CAPTURE_NOT_READY;
    }
    if (!valid(frame)) {
        ++stats.rejected_invalid;
        return DD84_CAPTURE_INVALID;
    }
    if (have_timestamp && frame->timestamp_us < last_timestamp) {
        ++stats.rejected_timestamp;
        return DD84_CAPTURE_OUT_OF_ORDER;
    }
    /* Track valid observations even when full, so draining cannot hide a clock
     * regression. Equal timestamps are allowed at the clock's resolution. */
    have_timestamp = true;
    last_timestamp = frame->timestamp_us;
    if (count == DD84_CAN_RING_CAPACITY) {
        ++stats.dropped_full;
        return DD84_CAPTURE_FULL;
    }
    dd84_can_frame_t *slot = &ring[(tail + count) % DD84_CAN_RING_CAPACITY];
    *slot = *frame;
    /* Do not expose uninitialized adapter bytes beyond the payload length. */
    memset(slot->data + slot->length, 0, DD84_CAN_MAX_DATA - slot->length);
    ++count;
    ++stats.accepted;
    if (count > stats.high_water) stats.high_water = count;
    return DD84_CAPTURE_ACCEPTED;
}

bool dd84_can_capture_pop(dd84_can_frame_t *out) {
    if (!out || count == 0) return false;
    *out = ring[tail];
    memset(&ring[tail], 0, sizeof ring[tail]);
    tail = (tail + 1u) % DD84_CAN_RING_CAPACITY;
    --count;
    ++stats.drained;
    return true;
}

size_t dd84_can_capture_count(void) { return count; }

dd84_capture_stats_t dd84_can_capture_stats(void) {
    dd84_capture_stats_t snapshot = stats;
    snapshot.queued = count;
    return snapshot;
}
