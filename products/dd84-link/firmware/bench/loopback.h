/* DD84 board-only self-test, using S32K344 register definitions from NXP.
 * No CAN pin mux, transceiver enable, normal-mode option or host-supplied TX.
 * This is intentionally separate from the production receive-only adapter. */
#ifndef DD84_LOOPBACK_H
#define DD84_LOOPBACK_H
#include "S32K344_FLEXCAN.h"
#include <stdio.h>

static boolean dd84_wait(volatile const uint32 *reg, uint32 mask, uint32 expected) {
    uint32 previous = OsIf_GetCounter(OSIF_COUNTER_SYSTEM), elapsed = 0;
    uint32 limit = OsIf_MicrosToTicks(100000u, OSIF_COUNTER_SYSTEM);
    do {
        if ((*reg & mask) == expected) return TRUE;
        elapsed += OsIf_GetElapsed(&previous, OSIF_COUNTER_SYSTEM);
    } while (elapsed < limit);
    return FALSE;
}

static void dd84_loopback(void (*send)(const char *)) {
    FLEXCAN_Type *can = IP_CAN_0;
    /* Classic CAN mailbox RAM: four 32-bit words per mailbox, offset 0x80.
     * CAN0 has 96 classic mailboxes on S32K344. */
    volatile uint32 *ram = (volatile uint32 *)(IP_CAN_0_BASE + 0x80u);
    uint32 words[8][2] = {{0}}, stamps[8] = {0};
    unsigned received = 0;
    boolean passed = FALSE, stopped;
    const char *stage = "freeze";
    char line[260];
    Clock_Ip_EnableModuleClock(FLEXCAN0_CLK);
    can->MCR = (can->MCR | FLEXCAN_MCR_FRZ_MASK | FLEXCAN_MCR_HALT_MASK) & ~FLEXCAN_MCR_MDIS_MASK;
    if (!dd84_wait(&can->MCR, FLEXCAN_MCR_FRZACK_MASK, FLEXCAN_MCR_FRZACK_MASK)) goto done;
    stage = "reset";
    can->MCR |= FLEXCAN_MCR_SOFTRST_MASK;
    if (!dd84_wait(&can->MCR, FLEXCAN_MCR_SOFTRST_MASK, 0)) goto done;
    can->MCR |= FLEXCAN_MCR_FRZ_MASK | FLEXCAN_MCR_HALT_MASK;
    if (!dd84_wait(&can->MCR, FLEXCAN_MCR_FRZACK_MASK, FLEXCAN_MCR_FRZACK_MASK)) goto done;
    can->CTRL2 |= FLEXCAN_CTRL2_WRMFRZ_MASK;
    for (unsigned i = 0; i < 96u * 4u; ++i) ram[i] = 0;
    for (unsigned i = 0; i < 96u; ++i) can->RXIMR[i] = 0;
    can->RXMGMASK = 0xffffffffu;
    can->RX14MASK = can->RX15MASK = can->RXFGMASK = 0xffffffffu;
    can->CTRL2 &= ~FLEXCAN_CTRL2_WRMFRZ_MASK;
    can->IMASK1 = can->IMASK2 = can->IMASK3 = 0;
    can->IFLAG1 = can->IFLAG2 = can->IFLAG3 = 0xffffffffu;
    can->CBT = 0;
    can->FDCTRL = 0;
    /* Loopback enabled while frozen, self reception enabled, classic CAN only. */
    can->MCR = FLEXCAN_MCR_FRZ_MASK | FLEXCAN_MCR_HALT_MASK | FLEXCAN_MCR_MAXMB(7u);
    can->CTRL1 = FLEXCAN_CTRL1_LPB_MASK |
        FLEXCAN_CTRL1_PRESDIV(9u) | FLEXCAN_CTRL1_PROPSEG(7u) |
        FLEXCAN_CTRL1_PSEG1(4u) | FLEXCAN_CTRL1_PSEG2(1u) | FLEXCAN_CTRL1_RJW(1u);
    ram[0] = 4u << 24; /* RX EMPTY */
    ram[1] = 0x321u << 18;
    ram[4] = 8u << 24; /* TX INACTIVE */
    stage = "start";
    if (!(can->CTRL1 & FLEXCAN_CTRL1_LPB_MASK) || (can->MCR & FLEXCAN_MCR_SRXDIS_MASK)) goto done;
    can->MCR &= ~FLEXCAN_MCR_HALT_MASK;
    if (!dd84_wait(&can->MCR, FLEXCAN_MCR_FRZACK_MASK | FLEXCAN_MCR_NOTRDY_MASK, 0)) goto done;
    {
        uint32 previous = OsIf_GetCounter(OSIF_COUNTER_SYSTEM), elapsed = 0;
        for (unsigned i = 0; i < 8; ++i) {
            stage = "mode";
            /* Every transmission remains fixed and guarded by hardware readback. */
            if (!(can->CTRL1 & FLEXCAN_CTRL1_LPB_MASK) || (can->MCR & FLEXCAN_MCR_SRXDIS_MASK)) goto done;
            ram[4] = 8u << 24;
            ram[5] = 0x321u << 18;
            ram[6] = 0xdd840000u | i;
            ram[7] = 0x10203040u + i;
            can->IFLAG1 = 3u;
            ram[4] = (12u << 24) | (8u << 16); /* TX DATA, eight fixed bytes */
            stage = "receive";
            if (!dd84_wait(&can->IFLAG1, 3u, 3u)) goto done;
            uint32 cs = ram[0], id = ram[1];
            words[i][0] = ram[2]; words[i][1] = ram[3];
            (void)can->TIMER; /* Unlock RX mailbox. */
            elapsed += OsIf_GetElapsed(&previous, OSIF_COUNTER_SYSTEM);
            stamps[i] = elapsed;
            stage = "compare";
            if (((cs >> 24) & 15u) != 2u || ((cs >> 16) & 15u) != 8u ||
                (cs & ((1u << 21) | (1u << 20))) || id != (0x321u << 18) ||
                words[i][0] != (0xdd840000u | i) || words[i][1] != 0x10203040u + i) goto done;
            ++received;
            ram[0] = 4u << 24;
            can->IFLAG1 = 3u;
        }
    }
    passed = TRUE; stage = "complete";
done:
    can->MCR |= FLEXCAN_MCR_FRZ_MASK | FLEXCAN_MCR_HALT_MASK;
    stopped = dd84_wait(&can->MCR, FLEXCAN_MCR_FRZACK_MASK, FLEXCAN_MCR_FRZACK_MASK);
    can->MCR |= FLEXCAN_MCR_MDIS_MASK;
    stopped = dd84_wait(&can->MCR, FLEXCAN_MCR_LPMACK_MASK, FLEXCAN_MCR_LPMACK_MASK) && stopped;
    Clock_Ip_DisableModuleClock(FLEXCAN0_CLK);
    (void)snprintf(line, sizeof line,
        "{\"type\":\"loopback\",\"source\":\"INTERNAL_CAN_LOOPBACK\",\"passed\":%s,\"canStopped\":%s,\"stage\":\"%s\",\"received\":%u,\"tickHz\":%lu,\"frames\":[",
        passed && stopped ? "true" : "false", stopped ? "true" : "false", stage, received,
        (unsigned long)OsIf_MicrosToTicks(1000000u, OSIF_COUNTER_SYSTEM));
    send(line);
    for (unsigned i = 0; i < received; ++i) {
        (void)snprintf(line, sizeof line,
            "%s{\"sequence\":%u,\"id\":801,\"timestampTicks\":%lu,\"data\":\"%08lx%08lx\"}",
            i ? "," : "", i, (unsigned long)stamps[i], (unsigned long)words[i][0], (unsigned long)words[i][1]);
        send(line);
    }
    send("]}\r\n");
}
#endif
