#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DD84_CAN_RING_CAPACITY 256u
#define DD84_CAN_MAX_DATA 64u

typedef struct {
    uint32_t id;
    uint8_t dlc;
    uint8_t data[DD84_CAN_MAX_DATA];
    uint32_t timestamp_us;
    bool fd;
} dd84_can_frame_t;

static dd84_can_frame_t ring[DD84_CAN_RING_CAPACITY];
static size_t head;
static size_t count;

void dd84_can_capture_push(const dd84_can_frame_t *frame) {
    if (!frame) return;
    ring[head] = *frame;
    head = (head + 1u) % DD84_CAN_RING_CAPACITY;
    if (count < DD84_CAN_RING_CAPACITY) ++count;
}

size_t dd84_can_capture_count(void) { return count; }
