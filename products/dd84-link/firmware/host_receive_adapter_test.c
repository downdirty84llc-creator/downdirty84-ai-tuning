#include "dd84_receive_adapter.h"
#include "dd84_app.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
typedef struct {
    bool configured, silent, fail_config, flip;
    unsigned frames, polls, stops, overruns;
    int max_write;
    uint64_t now;
    uint8_t output[DD84_WIRE_SIZE * 400]; size_t used;
} mock;
static bool configure(void *p) { mock *m=p; m->configured=true; return !m->fail_config; }
static bool readback(void *p) { return ((mock *)p)->silent; }
static void stop(void *p) { ++((mock *)p)->stops; }
static uint64_t now(void *p) { return ((mock *)p)->now++; }
static dd84_rx_result_t poll(void *p, dd84_can_frame_t *f) {
    mock *m=p; ++m->polls;
    if(m->flip)m->silent=false;
    if(m->overruns){--m->overruns;return DD84_RX_OVERRUN;}
    if(!m->frames)return DD84_RX_IDLE;
    --m->frames; f->id=0x123; f->length=f->dlc=1; f->data[0]=0x84;
    return DD84_RX_FRAME;
}
static int write_bytes(void *p,const uint8_t *b,size_t n) {
    mock *m=p; if(m->max_write<0)return -1;
    if(n>(size_t)m->max_write)n=(size_t)m->max_write;
    assert(m->used+n<=sizeof m->output);memcpy(m->output+m->used,b,n);m->used+=n;return (int)n;
}
static dd84_receive_port_t port(mock *m) {
    dd84_receive_port_t p={configure,readback,stop,poll,now,write_bytes,m};return p;
}
static void ready(void) {
    dd84_health_report_t h={0};
    for(unsigned i=0;i<DD84_CHECK_COUNT;i++)h.checks[i]=DD84_CHECK_PASS;
    h.identity=DD84_IDENTITY_VERIFIED;dd84_app_init();dd84_app_tick(&h);dd84_app_tick(&h);
}
int main(void) {
    mock m={0};m.silent=true;m.max_write=7;
    dd84_receive_port_t p=port(&m);dd84_receive_adapter_t a={0};
    dd84_app_init();assert(!dd84_receive_start(&a,&p,1));assert(!m.configured);
    ready();assert(!dd84_receive_start(&a,&p,0));
    assert(dd84_receive_start(&a,&p,1));assert(!dd84_receive_start(&a,&p,2));
    m.frames=2;
    for(unsigned i=0;i<40;i++)dd84_receive_step(&a);
    assert(m.used==2*DD84_WIRE_SIZE);assert(!memcmp(m.output,"D84W",4));
    assert(m.output[16]==0 && m.output[DD84_WIRE_SIZE+16]==1);
    assert(m.output[36]==0x84);assert(!a.pending_length);
    m.frames=400;m.max_write=0;
    unsigned before=m.polls;dd84_receive_step(&a);assert(m.polls-before==32);
    for(unsigned i=0;i<20;i++)dd84_receive_step(&a);
    assert(dd84_can_capture_stats().dropped_full>0);assert(a.pending_length==112);
    size_t offset=a.pending_offset;dd84_receive_step(&a);assert(a.pending_offset==offset);
    m.overruns=2;dd84_receive_step(&a);assert(a.hardware_overrun_events==2);
    m.silent=false;dd84_receive_step(&a);assert(a.fault && m.stops==1);
    m.silent=true;before=m.polls;dd84_receive_step(&a);assert(m.polls==before);
    a=(dd84_receive_adapter_t){0};m=(mock){0};p=port(&m);ready();
    assert(!dd84_receive_start(&a,&p,2));assert(m.stops==1 && a.fault);
    a=(dd84_receive_adapter_t){0};m.silent=true;m.stops=0;m.flip=true;
    assert(dd84_receive_start(&a,&p,3));dd84_receive_step(&a);assert(a.fault && !dd84_can_capture_count());
    a=(dd84_receive_adapter_t){0};m.flip=false;m.silent=true;m.frames=1;m.now=100;m.max_write=112;
    assert(dd84_receive_start(&a,&p,4));dd84_receive_step(&a);
    m.now=0;m.frames=1;dd84_receive_step(&a);assert(a.fault);
    a=(dd84_receive_adapter_t){0};m.now=100;m.frames=1;m.max_write=-1;
    assert(dd84_receive_start(&a,&p,5));dd84_receive_step(&a);assert(a.fault && a.transport_failures==1);
    a=(dd84_receive_adapter_t){0};m.frames=1;m.max_write=112;
    assert(dd84_receive_start(&a,&p,6));a.sequence=UINT32_MAX;
    dd84_receive_step(&a);assert(a.sequence_exhausted);dd84_receive_step(&a);assert(a.fault);
    a=(dd84_receive_adapter_t){0};m.fail_config=true;m.configured=false;m.stops=0;
    assert(!dd84_receive_start(&a,&p,7));assert(m.configured && m.stops==1);
    a=(dd84_receive_adapter_t){0};m.fail_config=false;m.frames=1;m.now=UINT64_C(0x100000010);
    assert(dd84_receive_start(&a,&p,8));dd84_receive_step(&a);
    assert(a.last_time==UINT64_C(0x100000010));
    dd84_app_tick(0);before=m.polls;dd84_receive_step(&a);assert(a.fault && m.polls==before);
    ready();a=(dd84_receive_adapter_t){0};assert(dd84_receive_start(&a,&p,9));
    dd84_receive_stop(&a);before=m.polls;dd84_receive_step(&a);assert(m.polls==before);
    assert(!dd84_receive_start(&a,&p,10));
    puts("PASS: health/readback gates, partial writes, bounded polling, backpressure, overruns, timestamps, transport and sequence faults");
}
