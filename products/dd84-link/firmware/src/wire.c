#include "dd84_wire.h"
#include <string.h>

static void le(uint8_t *out, uint64_t value, size_t bytes) {
    for (size_t i = 0; i < bytes; ++i) { out[i] = (uint8_t)value; value >>= 8; }
}
static void header(uint8_t *out, uint8_t type, uint64_t session,
                   uint32_t sequence, uint64_t timestamp) {
    memset(out, 0, DD84_WIRE_SIZE);
    memcpy(out, "D84W", 4); out[4] = 1; out[5] = type;
    le(out + 6, DD84_WIRE_SIZE, 2); le(out + 8, session, 8);
    le(out + 16, sequence, 4); le(out + 20, timestamp, 8);
}
static size_t finish(uint8_t *out) {
    uint32_t crc = 0xffffffffu;
    for (size_t i = 0; i < 108; ++i) {
        crc ^= out[i];
        for (unsigned bit = 0; bit < 8; ++bit)
            crc = (crc >> 1) ^ ((crc & 1u) ? 0xedb88320u : 0u);
    }
    le(out + 108, crc ^ 0xffffffffu, 4);
    return DD84_WIRE_SIZE;
}
size_t dd84_wire_frame(uint8_t *out, size_t capacity, uint64_t session,
                       uint32_t sequence, const dd84_can_frame_t *f) {
    static const uint8_t lengths[] = {0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64};
    if (!out || capacity < DD84_WIRE_SIZE || !session || !f || f->remote ||
        f->channel >= 2 || f->id > (f->extended ? 0x1fffffffu : 0x7ffu) ||
        (!f->fd && (f->brs || f->dlc > 8)) || f->dlc > 15 ||
        f->length != lengths[f->dlc]) return 0;
    header(out, 1, session, sequence, f->timestamp_us);
    le(out + 28, f->id, 4); out[32] = f->channel;
    out[33] = (uint8_t)((f->extended ? 1 : 0) | (f->fd ? 2 : 0) | (f->brs ? 4 : 0));
    out[34] = f->dlc; out[35] = f->length;
    memcpy(out + 36, f->data, f->length);
    return finish(out);
}
size_t dd84_wire_status(uint8_t *out, size_t capacity, uint64_t session,
                        uint32_t sequence, uint64_t timestamp,
                        const dd84_capture_stats_t *s) {
    if (!out || capacity < DD84_WIRE_SIZE || !session || !s ||
        s->queued > DD84_CAN_RING_CAPACITY || s->high_water > DD84_CAN_RING_CAPACITY ||
        s->queued > s->high_water || s->drained > s->accepted ||
        s->accepted - s->drained != s->queued) return 0;
    header(out, 2, session, sequence, timestamp);
    le(out+28,s->accepted,8); le(out+36,s->drained,8);
    le(out+44,s->dropped_full,8); le(out+52,s->rejected_invalid,8);
    le(out+60,s->rejected_not_ready,8); le(out+68,s->rejected_timestamp,8);
    le(out+76,s->queued,8); le(out+84,s->high_water,8);
    return finish(out);
}
