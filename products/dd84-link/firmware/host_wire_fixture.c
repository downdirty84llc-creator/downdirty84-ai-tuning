/* Host-only synthetic source. Never link these PASS fixtures into board builds. */
#include "dd84_wire.h"
#include "dd84_app.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
    uint8_t out[DD84_WIRE_SIZE], before[DD84_WIRE_SIZE];
    dd84_can_frame_t f = {0}, drained;
    static const uint8_t lengths[] = {0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64};
    assert(argc == 2);
    memset(out, 0xa5, sizeof out); memcpy(before,out,sizeof out);
    assert(!dd84_wire_frame(out,sizeof out,0,0,&f));
    assert(!dd84_wire_frame(out,sizeof out-1,1,0,&f));
    assert(!dd84_wire_frame(NULL,sizeof out,1,0,&f));
    assert(!dd84_wire_frame(out,sizeof out,1,0,NULL));
    f.dlc = 255; assert(!dd84_wire_frame(out,sizeof out,1,0,&f));
    f.dlc = 0; f.remote = true; assert(!dd84_wire_frame(out,sizeof out,1,0,&f));
    f.remote = false; f.channel = 2; assert(!dd84_wire_frame(out,sizeof out,1,0,&f));
    f.channel = 0; f.id = 0x800; assert(!dd84_wire_frame(out,sizeof out,1,0,&f));
    f.id = 0; f.brs = true; assert(!dd84_wire_frame(out,sizeof out,1,0,&f));
    assert(memcmp(before,out,sizeof out) == 0);
    dd84_capture_stats_t invalid = {0}; invalid.accepted = 1;
    assert(!dd84_wire_status(out,sizeof out,1,0,0,&invalid));
    assert(memcmp(before,out,sizeof out) == 0);
    dd84_health_report_t health = {0};
    for (size_t i=0;i<DD84_CHECK_COUNT;i++) health.checks[i]=DD84_CHECK_PASS;
    health.identity=DD84_IDENTITY_VERIFIED;
    dd84_app_init(); dd84_can_capture_reset();
    dd84_app_tick(&health); dd84_app_tick(&health);
    FILE *file = fopen(argv[1],"wb"); assert(file);
    for (uint32_t i=0;i<10000;i++) {
        memset(&f,0,sizeof f);
        f.fd = (i % 2) != 0; f.extended = (i % 3) == 0;
        f.brs = f.fd && (i % 4 == 1); f.channel = (uint8_t)((i / 2) % 2);
        f.dlc = (uint8_t)(f.fd ? (i/2)%16 : (i/2)%9);
        f.length = lengths[f.dlc]; f.id = f.extended ? 0x1fffffffu : 0x7ffu;
        f.timestamp_us = UINT64_C(9007199254740993) + i;
        for (uint8_t j=0;j<f.length;j++) f.data[j]=(uint8_t)(i+j);
        assert(dd84_can_capture_push(&f)==DD84_CAPTURE_ACCEPTED);
        assert(dd84_can_capture_pop(&drained));
        assert(dd84_wire_frame(out,sizeof out,UINT64_C(0x0102030405060708),i,&drained)==sizeof out);
        assert(fwrite(out,1,sizeof out,file)==sizeof out);
    }
    dd84_capture_stats_t stats = dd84_can_capture_stats();
    assert(dd84_wire_status(out,sizeof out,UINT64_C(0x0102030405060708),10000,
        UINT64_C(9007199254750993),&stats)==sizeof out);
    assert(fwrite(out,1,sizeof out,file)==sizeof out);
    assert(fclose(file)==0);
    return 0;
}
