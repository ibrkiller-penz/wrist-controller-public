// BLE HID 장치(NimBLE + esp_hidd) 구현 — 2단계 3번(STEP3)
//
// 뼈대는 IDF v5.5.5 examples/bluetooth/esp_hid_device 의 NimBLE 경로(esp_hid_gap.c, esp_hid_device_main.c)를 따르고,
// 아래만 바꿨다.
//   - 보안: 예제의 DISP_ONLY + 고정 패스키 123456 대신 Just Works(IO 없음) + 본딩 + SC. 본드는 NVS 에 저장
//     (CONFIG_BT_NIMBLE_NVS_PERSIST=y + ble_store_config_init). 연결되면 주변기기 쪽에서 보안을 먼저 요청한다.
//   - 광고: 예제의 180초 제한 대신 연결될 때까지 계속 광고, 끊기면 바로 다시 광고(재연결).
//     장치 이름은 스캔 응답에 넣는다(한글 이름 UTF-8 최대 29바이트가 광고 패킷에 다 안 들어가므로).
//   - 연결 판정: 암호화 완료(ENC_CHANGE 0) 또는 입력 보고서 구독(SUBSCRIBE) 중 먼저 오는 것 = 'ready'.
//     ready 전에 키를 보내면 호스트가 받지 못하므로 코어에는 ready 를 연결로 알린다.
// 실기 확인 필요: Windows/macOS 페어링·재연결, 복합 리포트 맵 인식(2단계 4번).
#include "ble_hid.h"

#include <string.h>

#include "esp_hid_common.h"
#include "esp_hidd.h"
#include "esp_log.h"
#include "host/ble_gap.h"
#include "host/ble_hs.h"
#include "host/ble_store.h"
#include "nimble/nimble_npl.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"

// NimBLE 의 store/config 구현(헤더에 선언이 없는 IDF 버전이 있어 직접 선언 — IDF 예제와 같음)
void ble_store_config_init(void);

static const char* TAG = "wc_ble";

#define WC_HID_UUID16 0x1812
#define WC_APPEARANCE_KEYBOARD 0x03C1
#define WC_ADV_NAME_MAX 29  // 스캔 응답 31바이트 - (길이 1 + 형식 1)

static esp_hidd_dev_t* s_hid_dev = NULL;
static wc_ble_conn_cb_t s_on_conn = NULL;
static volatile wc_ble_status_t s_status = WC_BLE_OFF;
static volatile bool s_ready = false;
static volatile bool s_ever_connected = false;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static char s_name[WC_ADV_NAME_MAX + 1];
// 본드 불일치(암호화 실패) 표시 — 연결이 'ready' 가 되면 지운다(실기 피드백 4)
static volatile bool s_need_repair = false;
static ble_addr_t s_peer_addr;
static bool s_peer_valid = false;
// 광고 시작 실패 재시도(호스트 태스크의 기본 이벤트 큐에서 돈다 — NimBLE API 를 같은 태스크에서 부른다)
#define WC_ADV_RETRY_MS 500
static struct ble_npl_callout s_adv_retry;
static bool s_adv_retry_init = false;
static uint32_t s_adv_fail_count = 0;

static int gap_event(struct ble_gap_event* event, void* arg);
static void advertise(void);

static void adv_retry_cb(struct ble_npl_event* ev) {
  (void)ev;
  if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE) advertise();
}

// 광고가 멈추지 않게: 실패하면 500ms 뒤 다시(무한, 로그는 첫 실패와 20회마다)
static void adv_retry_later(int rc) {
  ++s_adv_fail_count;
  if (s_adv_fail_count == 1 || s_adv_fail_count % 20 == 0) {
    ESP_LOGW(TAG, "광고 시작 실패 rc=%d — %dms 뒤 다시(%lu회째)", rc, WC_ADV_RETRY_MS, (unsigned long)s_adv_fail_count);
  }
  if (!s_adv_retry_init) {
    ble_npl_callout_init(&s_adv_retry, nimble_port_get_dflt_eventq(), adv_retry_cb, NULL);
    s_adv_retry_init = true;
  }
  ble_npl_callout_reset(&s_adv_retry, ble_npl_time_ms_to_ticks32(WC_ADV_RETRY_MS));
}

// UTF-8 글자 중간에서 자르지 않도록 max 바이트 이하의 마지막 글자 경계까지 복사
static void copy_utf8_truncated(char* dst, const char* src, size_t max) {
  size_t n = strlen(src);
  if (n > max) {
    n = max;
    while (n > 0 && (((unsigned char)src[n]) & 0xC0) == 0x80) n--;  // 이어지는 바이트(10xxxxxx)면 뒤로
  }
  memcpy(dst, src, n);
  dst[n] = '\0';
}

static void advertise(void) {
  if (s_conn_handle != BLE_HS_CONN_HANDLE_NONE) return;  // 연결 중에는 광고하지 않는다(끊기면 다시)
  struct ble_hs_adv_fields fields;
  memset(&fields, 0, sizeof(fields));
  fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
  fields.appearance = WC_APPEARANCE_KEYBOARD;
  fields.appearance_is_present = 1;
  static const ble_uuid16_t hid_uuid = BLE_UUID16_INIT(WC_HID_UUID16);
  fields.uuids16 = &hid_uuid;
  fields.num_uuids16 = 1;
  fields.uuids16_is_complete = 1;
  int rc = ble_gap_adv_set_fields(&fields);
  if (rc != 0) {
    adv_retry_later(rc);
    return;
  }

  struct ble_hs_adv_fields rsp;
  memset(&rsp, 0, sizeof(rsp));
  rsp.name = (uint8_t*)s_name;
  rsp.name_len = (uint8_t)strlen(s_name);
  rsp.name_is_complete = 1;
  rc = ble_gap_adv_rsp_set_fields(&rsp);
  if (rc != 0) {
    adv_retry_later(rc);
    return;
  }

  struct ble_gap_adv_params params;
  memset(&params, 0, sizeof(params));
  params.conn_mode = BLE_GAP_CONN_MODE_UND;
  params.disc_mode = BLE_GAP_DISC_MODE_GEN;
  params.itvl_min = BLE_GAP_ADV_ITVL_MS(30);  // 예제 권장 30~50ms
  params.itvl_max = BLE_GAP_ADV_ITVL_MS(50);
  rc = ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER, &params, gap_event, NULL);
  if (rc == 0 || rc == BLE_HS_EALREADY) {
    s_status = s_ever_connected ? WC_BLE_DISCONNECTED : WC_BLE_ADVERTISING;
    if (rc == 0) ESP_LOGI(TAG, "광고 시작 '%s'%s", s_name, s_adv_fail_count ? " (재시도 성공)" : "");
    s_adv_fail_count = 0;
  } else {
    // 예: 연결 실패 직후 rc=6 — 링크 정리가 끝나기 전. 멈추지 말고 다시 시도한다(실기 피드백 4)
    s_status = WC_BLE_OFF;
    adv_retry_later(rc);
  }
}

static void mark_ready(void) {
  if (s_ready) return;
  s_ready = true;
  s_ever_connected = true;
  s_need_repair = false;
  s_status = WC_BLE_CONNECTED;
  ESP_LOGI(TAG, "HID 준비 완료(연결)");
  if (s_on_conn) s_on_conn(true);
}

static int gap_event(struct ble_gap_event* event, void* arg) {
  (void)arg;
  struct ble_gap_conn_desc desc;
  int rc;
  switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
      ESP_LOGI(TAG, "연결 %s status=%d", event->connect.status == 0 ? "성공" : "실패", event->connect.status);
      if (event->connect.status == 0) {
        s_conn_handle = event->connect.conn_handle;
        s_status = WC_BLE_CONNECTING;
        s_peer_valid = ble_gap_conn_find(event->connect.conn_handle, &desc) == 0;
        if (s_peer_valid) s_peer_addr = desc.peer_id_addr;
        // 주변기기 쪽에서 보안 요청 → 처음이면 페어링(Just Works)+본딩, 본드가 있으면 저장된 키로 암호화
        rc = ble_gap_security_initiate(event->connect.conn_handle);
        if (rc == BLE_HS_EALREADY) {
          ESP_LOGD(TAG, "보안 요청: PC 가 이미 시작함(rc=%d, 무해)", rc);
        } else if (rc != 0) {
          ESP_LOGW(TAG, "보안 요청 실패 rc=%d", rc);
        }
      } else {
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        advertise();  // 실패해도 adv_retry_later 가 다시 시도한다
      }
      return 0;

    case BLE_GAP_EVENT_DISCONNECT:
      ESP_LOGI(TAG, "연결 끊김 reason=0x%x", event->disconnect.reason);
      s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
      {
        const bool wasReady = s_ready;
        s_ready = false;
        s_status = WC_BLE_DISCONNECTED;
        if (wasReady && s_on_conn) s_on_conn(false);
      }
      advertise();  // 재연결 대기
      return 0;

    case BLE_GAP_EVENT_ENC_CHANGE:
      ESP_LOGI(TAG, "암호화 변경 status=%d", event->enc_change.status);
      if (event->enc_change.status == 0) {
        if (ble_gap_conn_find(event->enc_change.conn_handle, &desc) == 0) {
          ESP_LOGI(TAG, "암호화=%d 인증=%d 본딩=%d", desc.sec_state.encrypted, desc.sec_state.authenticated,
                   desc.sec_state.bonded);
        }
        mark_ready();
      } else {
        // 암호화 실패 = 본드 불일치(PC 는 옛 키, 시계는 키 없음/다른 키). 우리 쪽 그 PC 본드를 지우고
        // 화면에 'PC 에서 이 장치를 제거하고 다시 추가하세요' 를 띄운다(실기 피드백 4)
        // 링크가 끊겨 실패한 경우(ENOTCONN — 거리 등)는 맞는 본드일 수 있어 지우지 않는다(표시만)
        if (s_peer_valid && event->enc_change.status != BLE_HS_ENOTCONN) {
          const int drc = ble_store_util_delete_peer(&s_peer_addr);
          ESP_LOGW(TAG, "암호화 실패 status=%d — 이 PC 본드 삭제 rc=%d. PC 에서 장치를 제거하고 다시 추가해야 한다",
                   event->enc_change.status, drc);
        } else {
          ESP_LOGW(TAG, "암호화 실패 status=%d — PC 에서 장치를 제거하고 다시 추가해야 한다", event->enc_change.status);
        }
        s_need_repair = true;
      }
      return 0;

    case BLE_GAP_EVENT_SUBSCRIBE:
      ESP_LOGI(TAG, "구독 attr=%d notify %d→%d", event->subscribe.attr_handle, event->subscribe.prev_notify,
               event->subscribe.cur_notify);
      if (event->subscribe.cur_notify) mark_ready();
      return 0;

    case BLE_GAP_EVENT_REPEAT_PAIRING:
      // 호스트가 본드를 지우고 다시 페어링하려는 경우: 우리 쪽 옛 본드를 지우고 새로 받는다(IDF 예제와 같음)
      if (ble_gap_conn_find(event->repeat_pairing.conn_handle, &desc) == 0) {
        ble_store_util_delete_peer(&desc.peer_id_addr);
      }
      return BLE_GAP_REPEAT_PAIRING_RETRY;

    case BLE_GAP_EVENT_PASSKEY_ACTION: {
      // IO 없음(Just Works)이라 보통 오지 않는다. 숫자 비교가 오면 수락만 한다.
      struct ble_sm_io pkey;
      memset(&pkey, 0, sizeof(pkey));
      pkey.action = event->passkey.params.action;
      if (pkey.action == BLE_SM_IOACT_NUMCMP) {
        pkey.numcmp_accept = 1;
        ble_sm_inject_io(event->passkey.conn_handle, &pkey);
      }
      ESP_LOGI(TAG, "패스키 동작 %d", pkey.action);
      return 0;
    }

    case BLE_GAP_EVENT_ADV_COMPLETE:
      ESP_LOGI(TAG, "광고 끝 reason=%d", event->adv_complete.reason);
      if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE) advertise();
      return 0;

    case BLE_GAP_EVENT_MTU:
      ESP_LOGI(TAG, "MTU %d", event->mtu.value);
      return 0;

    default:
      return 0;
  }
}

static void hidd_event(void* handler_args, esp_event_base_t base, int32_t id, void* event_data) {
  (void)handler_args;
  (void)base;
  (void)event_data;
  switch ((esp_hidd_event_t)id) {
    case ESP_HIDD_START_EVENT:
      // 호스트 동기화 완료 → 광고
      ESP_LOGI(TAG, "HID 시작");
      advertise();
      break;
    case ESP_HIDD_CONNECT_EVENT:
      ESP_LOGI(TAG, "HID 연결");
      break;
    case ESP_HIDD_DISCONNECT_EVENT:
      // 재광고는 gap_event(BLE_GAP_EVENT_DISCONNECT)에서 한다
      ESP_LOGI(TAG, "HID 끊김");
      break;
    case ESP_HIDD_PROTOCOL_MODE_EVENT: {
      esp_hidd_event_data_t* p = (esp_hidd_event_data_t*)event_data;
      ESP_LOGI(TAG, "프로토콜 모드 %s", p->protocol_mode.protocol_mode ? "REPORT" : "BOOT");
      break;
    }
    case ESP_HIDD_OUTPUT_EVENT: {
      // 키보드 LED(Num/Caps Lock) 출력 보고서 — 지금은 기록만
      esp_hidd_event_data_t* p = (esp_hidd_event_data_t*)event_data;
      ESP_LOGD(TAG, "출력 보고서 id=%u len=%u", p->output.report_id, (unsigned)p->output.length);
      break;
    }
    default:
      break;
  }
}

static void host_task(void* param) {
  (void)param;
  ESP_LOGI(TAG, "NimBLE 호스트 태스크 시작");
  nimble_port_run();  // nimble_port_stop() 전까지 돌아오지 않는다
  nimble_port_freertos_deinit();
}

esp_err_t wc_ble_hid_init(const char* device_name, const uint8_t* report_map, size_t report_map_len,
                          wc_ble_conn_cb_t on_conn) {
  s_on_conn = on_conn;
  copy_utf8_truncated(s_name, device_name ? device_name : "wrist-controller", WC_ADV_NAME_MAX);

  // 컨트롤러 + 호스트 초기화(IDF 5.x 는 nimble_port_init 이 컨트롤러 초기화·활성화까지 한다)
  esp_err_t err = nimble_port_init();
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "nimble_port_init 실패 %s", esp_err_to_name(err));
    return err;
  }

  // 보안: Just Works(IO 없음) + 본딩 + Secure Connections. 키 분배는 예제와 같다(ENC|ID).
  ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
  ble_hs_cfg.sm_bonding = 1;
  ble_hs_cfg.sm_mitm = 0;
  ble_hs_cfg.sm_sc = 1;
  ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
  ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
  ble_hs_cfg.store_status_cb = ble_store_util_status_rr;

  // 맵 하나·HID 서비스 하나(hid_report_map.h 머리말: macOS 가 서비스 여러 개를 장치 여러 개로 쪼개는 문제 회피)
  static esp_hid_raw_report_map_t maps[1];
  maps[0].data = report_map;
  maps[0].len = (uint16_t)report_map_len;
  static esp_hid_device_config_t cfg;
  memset(&cfg, 0, sizeof(cfg));
  // TODO(v1.0 전): VID/PID 는 IDF 예제 값(0x16C0/0x05DF). 배포 전에 정할 것
  cfg.vendor_id = 0x16C0;
  cfg.product_id = 0x05DF;
  cfg.version = 0x0100;
  cfg.device_name = s_name;
  cfg.manufacturer_name = "wrist-controller";
  cfg.serial_number = "0001";
  cfg.report_maps = maps;
  cfg.report_maps_len = 1;
  err = esp_hidd_dev_init(&cfg, ESP_HID_TRANSPORT_BLE, hidd_event, &s_hid_dev);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "esp_hidd_dev_init 실패 %s", esp_err_to_name(err));
    return err;
  }

  // GAP 장치 이름 특성(연결 후 PC 가 읽는 이름). esp_hidd 가 ble_svc_gap_init() 을 부른 뒤라야 한다.
  int rc = ble_svc_gap_device_name_set(s_name);
  if (rc != 0) ESP_LOGW(TAG, "GAP 이름 설정 실패 rc=%d", rc);

  // 배터리 서비스 초기값: 아직 PMU 를 읽기 전이라 50(0 이면 Windows 가 '배터리 없음/부족' 으로 경고한다)
  esp_hidd_dev_battery_set(s_hid_dev, 50);

  ble_store_config_init();  // 본드를 NVS 에 저장(CONFIG_BT_NIMBLE_NVS_PERSIST)
  nimble_port_freertos_init(host_task);
  ESP_LOGI(TAG, "BLE HID 초기화 완료(맵 %u바이트)", (unsigned)report_map_len);
  return ESP_OK;
}

wc_ble_status_t wc_ble_hid_status(void) {
  if (s_ready) return WC_BLE_CONNECTED;
  if (s_need_repair) return WC_BLE_NEEDS_REPAIR;
  return s_status;
}

esp_err_t wc_ble_hid_battery_set(uint8_t percent) {
  if (!s_hid_dev) return ESP_ERR_INVALID_STATE;
  if (percent > 100) percent = 100;
  return esp_hidd_dev_battery_set(s_hid_dev, percent);
}

esp_err_t wc_ble_hid_send(uint8_t report_id, const uint8_t* data, size_t len) {
  if (!s_hid_dev || !s_ready) return ESP_ERR_INVALID_STATE;
  return esp_hidd_dev_input_set(s_hid_dev, 0, report_id, (uint8_t*)data, len);
}
