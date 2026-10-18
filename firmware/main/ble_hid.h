// BLE HID 장치(NimBLE + esp_hid/esp_hidd) — 2단계 3번(STEP3)
// 근거: docs/research/firmware-stack.md 2장, IDF v5.5.5 examples/bluetooth/esp_hid_device(NimBLE 경로)
//
// 이 모듈은 '보고서 바이트를 보낸다'와 '연결 상태가 바뀌었다'만 안다. 어떤 키를 보낼지는 코어(wc::step)가 정한다.
// 연결 상태 콜백은 NimBLE 호스트 태스크에서 불리므로, 받는 쪽은 큐에 넣고 자기 태스크에서 처리한다.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// 화면 표시용 BLE 상태(값 순서는 바꾸지 않는다 — 뒤에만 붙인다)
typedef enum {
  WC_BLE_OFF = 0,       // 아직 시작 전(호스트 동기화 대기), 또는 광고 시작 실패 후 재시도 대기
  WC_BLE_ADVERTISING,   // 광고 중(처음 켜짐)
  WC_BLE_CONNECTED,     // 연결 + 암호화(또는 보고서 구독) 완료 → 키를 보낼 수 있음
  WC_BLE_DISCONNECTED,  // 연결이 끊겨 다시 광고 중
  WC_BLE_CONNECTING,    // PC 가 붙었고 암호화(페어링) 진행 중
  WC_BLE_NEEDS_REPAIR,  // 암호화 실패(본드 불일치) — 우리 쪽 본드를 지웠다. PC 에서 장치를 지우고 다시 추가해야 한다
} wc_ble_status_t;

// ready=true: 키를 보낼 수 있는 상태가 됨 / false: 연결 끊김. NimBLE 호스트 태스크에서 불린다.
typedef void (*wc_ble_conn_cb_t)(bool ready);

// device_name: UTF-8, 29바이트를 넘으면 글자 경계에서 자른다(스캔 응답 31바이트 - 머리 2바이트).
// report_map: 복합 리포트 맵(hid_report_map.h). NVS 는 호출 전에 nvs_flash_init() 이 끝나 있어야 한다.
esp_err_t wc_ble_hid_init(const char* device_name, const uint8_t* report_map, size_t report_map_len,
                          wc_ble_conn_cb_t on_conn);

wc_ble_status_t wc_ble_hid_status(void);

// 입력 보고서 하나를 보낸다(map 0, report_id). 연결 안 됐으면 ESP_ERR_INVALID_STATE.
esp_err_t wc_ble_hid_send(uint8_t report_id, const uint8_t* data, size_t len);

// 배터리 서비스(BAS 0x180F, Battery Level 0x2A19 read+notify) 값. 바뀌면 구독한 PC 에 notify 된다.
// esp_hidd(NimBLE)가 HID 와 함께 BAS 를 등록하고 리포트 맵에 External Report Reference(0x2907 → 0x2A19)를 단다(HOGP).
esp_err_t wc_ble_hid_battery_set(uint8_t percent);

#ifdef __cplusplus
}
#endif
