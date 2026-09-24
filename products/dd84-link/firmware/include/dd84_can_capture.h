#ifndef DD84_CAN_CAPTURE_H
#define DD84_CAN_CAPTURE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DD84_CAN_RING_CAPACITY 256u
#define DD84_CAN_MAX_DATA 64u
#define DD84_CAN_CHANNEL_COUNT 2u

/* Data frames only. dlc is the encoded bus DLC, length is payload bytes.
 * timestamp_us is a shared 64-bit monotonic clock across both channels, since
 * capture reset. Extend a hardware counter's wrap in the board adapter.
 */
typedef struct {
    uint32_t id;
    uint64_t timestamp_us;
    uint8_t channel;
    uint8_t dlc;
    uint8_t length;
    bool extended;
    bool fd;
    bool brs;
    bool remote;
    uint8_t data[DD84_CAN_MAX_DATA];
} dd84_can_frame_t;

typedef enum {
    DD84_CAPTURE_ACCEPTED = 0,
    DD84_CAPTURE_NOT_READY,
    DD84_CAPTURE_INVALID,
    DD84_CAPTURE_OUT_OF_ORDER,
    DD84_CAPTURE_FULL
} dd84_capture_result_t;

typedef struct {
    uint64_t accepted;
    uint64_t drained;
    uint64_t dropped_full;
    uint64_t rejected_invalid;
    uint64_t rejected_not_ready;
    uint64_t rejected_timestamp;
    size_t queued;
    size_t high_water;
} dd84_capture_stats_t;

/* All calls (and app health updates) must be serialized by the board adapter.
 * Not ISR/thread safe. No driver, timestamp source or transmit path is supplied.
 * Reset discards queued data and counters; call only at a new capture session.
 */
void dd84_can_capture_reset(void);
dd84_capture_result_t dd84_can_capture_push(const dd84_can_frame_t *frame);
/* Pop remains available after a fault for diagnostics of already captured data.
 * Returns false for NULL/empty, leaving both queue and output untouched.
 */
bool dd84_can_capture_pop(dd84_can_frame_t *out);
size_t dd84_can_capture_count(void);
dd84_capture_stats_t dd84_can_capture_stats(void);

#endif
