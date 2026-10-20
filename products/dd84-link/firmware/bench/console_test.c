#include "console.h"
#include <assert.h>
#include <stdio.h>
static int feed(dd84_line *s, const char *bytes) {
    int count = 0;
    while (*bytes) { if (dd84_feed(s, (unsigned char)*bytes++) == 1) ++count; }
    return count;
}
int main(void) {
    dd84_line s = {{0},0,0}; int led = 0;
    assert(feed(&s,"DD84 HEL") == 0);
    assert(feed(&s,"LO 1\r\n") == 1);
    assert(strstr(dd84_reply(s.line,&led),"DD84-BENCH/1"));
    assert(feed(&s,"ping\nstatus\n") == 2);
    for (int i=0;i<200;++i) assert(dd84_feed(&s,'x')==0);
    assert(dd84_feed(&s,'\n')==-1);
    assert(feed(&s,"ping\n")==1);
    assert(!strcmp(dd84_reply(s.line,&led),"PONG\r\n"));
    assert(feed(&s,"led ")==0); assert(dd84_feed(&s,0)==0);
    assert(feed(&s,"on")==0); assert(dd84_feed(&s,'\n')==-1); assert(!led);
    assert(!strcmp(dd84_reply("DD84 HELLO 2",&led),"ERR VERSION\r\n"));
    dd84_reply("led on",&led); assert(led);
    assert(!strcmp(dd84_reply("status",&led),"LED ON\r\n"));
    dd84_reply("led off",&led); assert(!led);
    assert(!strcmp(dd84_reply("flash",&led),"ERR COMMAND\r\n"));
    puts("PASS: fragmented/batched lines, CRLF, overflow, invalid bytes, version, LED and unsupported commands");
}
