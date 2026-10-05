/* DD84 bench console. Original application code; no vehicle transport. */
#ifndef DD84_BENCH_CONSOLE_H
#define DD84_BENCH_CONSOLE_H
#include <stddef.h>
#include <string.h>

#define DD84_LINE_CAPACITY 96u
typedef struct {
    char line[DD84_LINE_CAPACITY];
    size_t used;
    int discard;
} dd84_line;

/* Returns 1 for a complete line, -1 for a rejected line, otherwise 0.
 * A malformed/oversize line is discarded through its delimiter, never executed. */
static int dd84_feed(dd84_line *s, unsigned char byte) {
    if (byte == '\r' || byte == '\n') {
        int result = s->discard ? -1 : (s->used ? 1 : 0);
        if (s->used) s->line[s->used] = 0;
        s->used = 0;
        s->discard = 0;
        return result;
    }
    if (s->discard) return 0;
    if (byte < 32 || byte > 126 || s->used == DD84_LINE_CAPACITY - 1) {
        s->discard = 1;
        s->used = 0;
    } else s->line[s->used++] = (char)byte;
    return 0;
}

static const char *dd84_reply(const char *line, int *led) {
    if (!strcmp(line, "DD84 HELLO 1"))
        return "{\"protocol\":\"DD84-BENCH/1\",\"board\":\"FRDM-A-S32K344\",\"firmware\":\"0.2.0\",\"mode\":\"bench\",\"capabilities\":[\"ping\",\"led\",\"status\",\"can-loopback\"],\"vehicleAccess\":false}\r\n";
    if (!strncmp(line, "DD84 HELLO", 10)) return "ERR VERSION\r\n";
    if (!strcmp(line, "ping")) return "PONG\r\n";
    if (!strcmp(line, "led on")) { *led = 1; return "OK LED ON\r\n"; }
    if (!strcmp(line, "led off")) { *led = 0; return "OK LED OFF\r\n"; }
    if (!strcmp(line, "status")) return *led ? "LED ON\r\n" : "LED OFF\r\n";
    return "ERR COMMAND\r\n";
}
#endif
