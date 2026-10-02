/* DD84 FRDM-A-S32K344 bench adapter, using separately licensed NXP RTD 7.0.0.
 * Apply to nxp-appcodehub/dm-uart-button-s32k344 at 7b4fded after generation.
 * No CAN initialization, ECU commands, credentials, or calibration writes. */
#include "Mcal.h"
#include "S32K344_NVIC.h"
#include "Clock_Ip.h"
#include "OsIf.h"
#include "OsIf_Timer_System.h"
#include "Siul2_Dio_Ip.h"
#include "Siul2_Port_Ip.h"
#include "Lpuart_Uart_Ip.h"
#include "Lpuart_Uart_Ip_Irq.h"
#include "console.h"

#define UART_INSTANCE 6u
#define RING_SIZE 1024u
static volatile unsigned head, tail;
static volatile unsigned char ring[RING_SIZE];
static uint8 incoming;
static volatile boolean lost, restartRx;
static Lpuart_Uart_Ip_UserConfigType config;
static dd84_line parser;
static int led;

static void uartEvent(const uint8 instance, const Lpuart_Uart_Ip_EventType event,
                      const void *user) {
    (void)user;
    if (event == LPUART_UART_IP_EVENT_RX_FULL) {
        unsigned next = (head + 1u) % RING_SIZE;
        if (next == tail) lost = TRUE;
        else { ring[head] = incoming; head = next; }
        /* Continue inside the RTD callback, before the driver disables RX. */
        Lpuart_Uart_Ip_SetRxBuffer(instance, &incoming, 1u);
    } else if (event == LPUART_UART_IP_EVENT_ERROR) {
        lost = TRUE;
        restartRx = TRUE;
    }
}

static void sendText(const char *text) {
    (void)Lpuart_Uart_Ip_SyncSend(UART_INSTANCE, (const uint8 *)text,
                                 (uint32)strlen(text), 100000u);
}

int main(void) {
    Clock_Ip_Init(&Clock_Ip_aClockConfig[0]);
    OsIf_Init(NULL_PTR);
    OsIf_Timer_System_Init();
    Siul2_Port_Ip_Init(NUM_OF_CONFIGURED_PINS_PortContainer_0_BOARD_InitPeripherals,
                      g_pin_mux_InitConfigArr_PortContainer_0_BOARD_InitPeripherals);
    Siul2_Dio_Ip_WritePin(LED_GREEN_PORT, LED_GREEN_PIN, 0);
    config = Lpuart_Uart_Ip_xHwConfigPB_6;
    config.Callback = uartEvent;
    Lpuart_Uart_Ip_Init(UART_INSTANCE, &config);
    /* RTD startup copies vectors into RAM. Install the supplied driver ISR. */
    ((void (**)(void))S32_SCB->VTOR)[(unsigned)LPUART6_IRQn + 16u] = LPUART_UART_IP_6_IRQHandler;
    MCAL_DATA_SYNC_BARRIER();
    MCAL_INSTRUCTION_SYNC_BARRIER();
    S32_NVIC->ICPR[(unsigned)LPUART6_IRQn / 32u] = 1u << ((unsigned)LPUART6_IRQn % 32u);
    S32_NVIC->ISER[(unsigned)LPUART6_IRQn / 32u] = 1u << ((unsigned)LPUART6_IRQn % 32u);
    (void)Lpuart_Uart_Ip_AsyncReceive(UART_INSTANCE, &incoming, 1u);
    sendText("DD84 BENCH READY 1\r\n");
    for (;;) {
        unsigned char byte = 0;
        boolean have = FALSE, recovered = FALSE;
        /* Synchronize the ISR-owned queue; no I/O or delays in this section. */
        OsIf_SuspendAllInterrupts();
        if (lost) {
            tail = head;
            parser.used = 0;
            parser.discard = 1;
            lost = FALSE;
            recovered = TRUE;
        }
        if (restartRx) {
            (void)Lpuart_Uart_Ip_AbortReceivingData(UART_INSTANCE);
            restartRx = Lpuart_Uart_Ip_AsyncReceive(UART_INSTANCE, &incoming, 1u)
                        != LPUART_UART_IP_STATUS_SUCCESS;
        }
        if (tail != head) {
            byte = ring[tail];
            tail = (tail + 1u) % RING_SIZE;
            have = TRUE;
        }
        OsIf_ResumeAllInterrupts();
        if (recovered) sendText("ERR RX_LOSS\r\n");
        if (have) {
            int result = dd84_feed(&parser, byte);
            if (result < 0) sendText("ERR LINE\r\n");
            if (result > 0) {
                const char *reply = dd84_reply(parser.line, &led);
                Siul2_Dio_Ip_WritePin(LED_GREEN_PORT, LED_GREEN_PIN, (uint8)led);
                sendText(reply);
            }
        }
    }
}
