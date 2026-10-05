#include "dd84_receive_adapter.h"
#include "dd84_app.h"
#include <string.h>

static void fault(dd84_receive_adapter_t *a) {
    a->fault = true;
    a->active = false;
    a->port.stop(a->port.context);
}
bool dd84_receive_start(dd84_receive_adapter_t *a, const dd84_receive_port_t *p,
                        uint64_t session) {
    if (!a || !p || !session || a->active || a->fault || a->session ||
        !p->configure_listen_only || !p->readback_listen_only || !p->stop ||
        !p->poll || !p->now_us || !p->write || !dd84_app_capture_allowed()) return false;
    a->port = *p;
    a->session = session;
    if (!p->configure_listen_only(p->context) || !p->readback_listen_only(p->context)) {
        fault(a);
        return false;
    }
    dd84_can_capture_reset();
    a->active = true;
    return true;
}
void dd84_receive_stop(dd84_receive_adapter_t *a) {
    if (!a || !a->session) return;
    a->active = false;
    a->port.stop(a->port.context);
}
void dd84_receive_step(dd84_receive_adapter_t *a) {
    if (!a || !a->session || a->fault || !a->active) return;
    if (!dd84_app_capture_allowed() || !a->port.readback_listen_only(a->port.context)) {
        fault(a); return;
    }
    for (unsigned i = 0; i < 32; ++i) {
        dd84_can_frame_t f = {0};
        dd84_rx_result_t result = a->port.poll(a->port.context, &f);
        /* A driver call must not silently change the controller out of silent mode. */
        if (!a->port.readback_listen_only(a->port.context)) { fault(a); return; }
        if (result == DD84_RX_IDLE) break;
        if (result == DD84_RX_OVERRUN) { ++a->hardware_overrun_events; continue; }
        if (result != DD84_RX_FRAME) { fault(a); return; }
        uint64_t now = a->port.now_us(a->port.context);
        if (a->have_time && now < a->last_time) { fault(a); return; }
        a->have_time = true; a->last_time = now;
        f.timestamp_us = now;
        (void)dd84_can_capture_push(&f);
    }
    if (!a->pending_length) {
        dd84_can_frame_t f;
        if (a->sequence_exhausted) { fault(a); return; }
        if (!dd84_can_capture_pop(&f)) return;
        a->pending_length = dd84_wire_frame(a->pending, sizeof a->pending,
                                            a->session, a->sequence, &f);
        if (!a->pending_length) { fault(a); return; }
        a->pending_offset = 0;
        if (a->sequence == UINT32_MAX) a->sequence_exhausted = true;
        else ++a->sequence;
    }
    size_t remaining = a->pending_length - a->pending_offset;
    int written = a->port.write(a->port.context, a->pending + a->pending_offset, remaining);
    if (written < 0 || (size_t)written > remaining) {
        ++a->transport_failures; fault(a); return;
    }
    a->pending_offset += (size_t)written;
    if (a->pending_offset == a->pending_length) {
        a->pending_length = a->pending_offset = 0;
    }
}
