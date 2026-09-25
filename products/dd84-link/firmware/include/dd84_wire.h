#ifndef DD84_WIRE_H
#define DD84_WIRE_H
#include "dd84_can_capture.h"
#define DD84_WIRE_SIZE 112u
/* Stateless serialization only: no driver, authentication, or TX commands.
 * Caller owns nonzero session identity and sequence allocation; never wrap a
 * sequence within a session. Invalid input leaves output unchanged. */
size_t dd84_wire_frame(uint8_t *out, size_t capacity, uint64_t session,
                       uint32_t sequence, const dd84_can_frame_t *frame);
size_t dd84_wire_status(uint8_t *out, size_t capacity, uint64_t session,
                        uint32_t sequence, uint64_t timestamp_us,
                        const dd84_capture_stats_t *stats);
#endif
