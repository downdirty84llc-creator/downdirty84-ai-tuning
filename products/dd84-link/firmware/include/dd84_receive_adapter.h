#ifndef DD84_RECEIVE_ADAPTER_H
#define DD84_RECEIVE_ADAPTER_H
#include "dd84_can_capture.h"
#include "dd84_wire.h"

typedef enum { DD84_RX_IDLE, DD84_RX_FRAME, DD84_RX_OVERRUN, DD84_RX_ERROR } dd84_rx_result_t;
/* Board-owned functions only; never populated from host commands. Serialized
 * foreground use. Each call must return promptly; no callback may block on USB.
 * configure_listen_only must leave the controller stopped on failure and must
 * never enter normal/loopback mode, even transiently. readback checks actual
 * hardware, including transceiver mode. poll must not generate bus traffic.
 * now_us returns a shared monotonic 64-bit microsecond clock. Timestamps below
 * are observation/service times, NOT hardware CAN arrival timestamps.
 * write returns bytes accepted, 0 for backpressure, -1 for transport failure.
 */
typedef struct {
    bool (*configure_listen_only)(void *context);
    bool (*readback_listen_only)(void *context);
    void (*stop)(void *context);
    dd84_rx_result_t (*poll)(void *context, dd84_can_frame_t *frame);
    uint64_t (*now_us)(void *context);
    int (*write)(void *context, const uint8_t *bytes, size_t length);
    void *context;
} dd84_receive_port_t;

typedef struct {
    dd84_receive_port_t port;
    bool active, fault, have_time, sequence_exhausted;
    uint64_t session, last_time, hardware_overrun_events, transport_failures;
    uint32_t sequence;
    uint8_t pending[DD84_WIRE_SIZE];
    size_t pending_offset, pending_length;
} dd84_receive_adapter_t;

/* Initialize a fresh zeroed adapter only with the peripheral stopped. A new
 * unique session ID is mandatory on reconnect/reboot. Does not fabricate app
 * health evidence, authorize capture, or reset a latched application fault. */
bool dd84_receive_start(dd84_receive_adapter_t *a, const dd84_receive_port_t *port,
                        uint64_t session);
/* At most 32 receive events and one transport write per step. */
void dd84_receive_step(dd84_receive_adapter_t *a);
void dd84_receive_stop(dd84_receive_adapter_t *a);
#endif
