// 시계 화면 v2 구현(LVGL 9) — design/v2/README.md P0-1~P0-6. 좌표표 wc/layout.h, 색은 design/tokens.css(1.1절 565 스냅 값).
//
// 원칙(README 0장)
//   - 배경 #000000, 면은 dim 까지만. 알파 합성·transform_scale·그림자·그라데이션·페이드는 쓰지 않는다.
//     "투명도"는 검정 위에 미리 섞은 불투명 색(kModeColors dim/dimBorder)으로 그린다. 투명한 것은 배경 없는 틀(frame)뿐.
//   - 위젯은 터치를 받지 않는다(CLICKABLE 끔). 판정은 wc::TouchGesture + 코어 hitTest(시뮬레이터와 같음).
//   - render() 는 바뀐 속성만 건드린다(같은 값을 다시 넣어도 LVGL 은 다시 그리므로 비교 후 설정 → SPI 전송 최소화).
//   - 움직임은 계단식이다: tick(50ms)마다 경과 시간으로 단계를 골라 색·위치만 바꾼다. 동시에 2개 이하.
//     발표 넘김 플래시 3단계 260ms, 시트 열기 3단계 200ms, 배너 등장 2단계 120ms, 이름 칩 반전 600ms.
//   - 글자는 Pretendard 서브셋(kr_20/24/28/32·num_128), 문구는 wc::str(shared/strings.ko.json). 코드에 한글을 쓰지 않는다
//     (tools/check_strings.py 가 CI 에서 검사).
#include "ui.h"

#include <algorithm>
#include <cstdarg>
#include <cstdio>
#include <cstring>

#include "ble_hid.h"
#include "esp_log.h"
#include "esp_lvgl_port.h"
#include "fonts/wc_fonts.h"
#include "lvgl.h"
#include "strings_gen.h"

namespace ui {
namespace {

namespace S = wc::str;
const char* TAG = "wc_ui";

// ---- 색(design/tokens.css · design/v2/README.md 1.1, RGB565 스냅 값)
constexpr uint32_t C_BG = 0x000000, C_S1 = 0x181818, C_S2 = 0x212121, C_S3 = 0x2A2A2A, C_BORDER = 0x393939;
constexpr uint32_t C_T1 = 0xEEEEEE, C_T2 = 0xA6A6A6, C_T3 = 0x8C8C8C, C_TDIS = 0x4D4D4D, C_ON_ACCENT = 0x000000;
constexpr uint32_t C_OK = 0x31CE7B, C_WAIT = 0x8C8A8C, C_WARN = 0xFFD23A, C_DANGER = 0xFF4D5A, C_DANGER_DIM = 0x310C10;
constexpr uint32_t C_LOCK = 0xA58AF7;
constexpr uint32_t C_SAT = 0x3A8AFF, C_SAT_BORDER = 0x193963, C_SUN = 0xFF4D5A, C_SUN_BORDER = 0x632029;

struct ModeColors {
  uint32_t accent, strong, dim, dimBorder;
};
// ModeId 값 순서(Present, Launch, Meeting, Clock)
constexpr ModeColors kModeColors[4] = {
    {0xFF8A21, 0xFFA552, 0x311808, 0x633908},  // 발표
    {0x3A8AFF, 0x6EA8FF, 0x081831, 0x193963},  // 실행
    {0x31CE7B, 0x5EDD98, 0x082419, 0x105531},  // 회의
    {0xD6CEB5, 0xEDE5D0, 0x292421, 0x5A514A},  // 시계(모래색)
};
const ModeColors& mc(wc::ModeId m) { return kModeColors[static_cast<int>(m)]; }

// ---- 문구 도우미(%d·%s 자리 표시 — strings.ko.json)
std::string fmt(const char* f, ...) {
  char b[96];
  va_list ap;
  va_start(ap, f);
  std::vsnprintf(b, sizeof(b), f, ap);
  va_end(ap);
  return b;
}

// 키 표기는 코어 formatChord(sim keymap.ts 와 같은 표기: 'Ctrl+Alt+1', PERIOD → '.', ESCAPE → 'Esc')
std::string chordText(const std::optional<wc::Chord>& c, wc::OsId os) { return wc::formatChord(c, os); }

// 바인딩 힌트: 키 조합 = 'Win+1', 매크로 = 첫 단계 + ' …'
std::string bindingHint(const std::optional<wc::Binding>& b, wc::OsId os) {
  if (!b) return "";
  if (!b->macro) return chordText(b->chord, os);
  std::string first;
  int n = 0;
  for (const auto& st : b->steps) {
    if (st.kind == wc::MacroStepKind::Wait) continue;
    if (n++ == 0) {
      first = st.kind == wc::MacroStepKind::Chord  ? chordText(st.chord, os)
              : st.kind == wc::MacroStepKind::Text ? st.text
                                                    : st.consumerName;
    }
  }
  return n > 1 ? first + " \xE2\x80\xA6" : first;  // U+2026
}

// ---- 작은 도우미(같은 값이면 건드리지 않는다)
lv_obj_t* box(lv_obj_t* parent, int x, int y, int w, int h, uint32_t bg, int radius, uint32_t border = 0, int bw = 0) {
  lv_obj_t* o = lv_obj_create(parent);
  lv_obj_remove_style_all(o);
  lv_obj_set_pos(o, x, y);
  lv_obj_set_size(o, w, h);
  lv_obj_set_style_bg_color(o, lv_color_hex(bg), 0);
  lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(o, radius, 0);
  lv_obj_set_style_border_color(o, lv_color_hex(border), 0);
  lv_obj_set_style_border_width(o, bw, 0);
  lv_obj_remove_flag(o, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE);
  return o;
}

// 배경 없는 틀(묶음·위치 이동용). 알파 합성 없음 — 아무것도 그리지 않는다
lv_obj_t* frame(lv_obj_t* parent, int x, int y, int w, int h) {
  lv_obj_t* o = box(parent, x, y, w, h, C_BG, 0);
  lv_obj_set_style_bg_opa(o, LV_OPA_TRANSP, 0);
  return o;
}

// 한 줄 글자. (x, y, w, h) 칸 안에서 세로 가운데. 넘치면 '…'
lv_obj_t* text(lv_obj_t* parent, const lv_font_t* font, uint32_t color, int x, int y, int w, int h,
               lv_text_align_t align, const char* s = "") {
  lv_obj_t* l = lv_label_create(parent);
  const int lh = font->line_height;
  lv_obj_set_style_text_font(l, font, 0);
  lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
  lv_obj_set_style_text_align(l, align, 0);
  lv_obj_set_pos(l, x, y + (h - lh) / 2);
  lv_obj_set_size(l, w, lh);
  lv_label_set_long_mode(l, LV_LABEL_LONG_DOT);
  lv_label_set_text(l, s);
  lv_obj_remove_flag(l, LV_OBJ_FLAG_CLICKABLE);
  return l;
}

void setText(lv_obj_t* l, const char* s) {
  if (std::strcmp(lv_label_get_text(l), s) != 0) lv_label_set_text(l, s);
}
void setText(lv_obj_t* l, const std::string& s) { setText(l, s.c_str()); }
void setHidden(lv_obj_t* o, bool hidden) {
  if (lv_obj_has_flag(o, LV_OBJ_FLAG_HIDDEN) != hidden) {
    if (hidden) lv_obj_add_flag(o, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_remove_flag(o, LV_OBJ_FLAG_HIDDEN);
  }
}
void setTextColor(lv_obj_t* o, uint32_t c) {
  const lv_color_t v = lv_color_hex(c);
  if (!lv_color_eq(lv_obj_get_style_text_color(o, LV_PART_MAIN), v)) lv_obj_set_style_text_color(o, v, 0);
}
void setBg(lv_obj_t* o, uint32_t c) {
  const lv_color_t v = lv_color_hex(c);
  if (!lv_color_eq(lv_obj_get_style_bg_color(o, LV_PART_MAIN), v)) lv_obj_set_style_bg_color(o, v, 0);
}
void setBgOpa(lv_obj_t* o, bool cover) {
  const lv_opa_t v = cover ? LV_OPA_COVER : LV_OPA_TRANSP;
  if (lv_obj_get_style_bg_opa(o, LV_PART_MAIN) != v) lv_obj_set_style_bg_opa(o, v, 0);
}
void setBorder(lv_obj_t* o, uint32_t c, int w) {
  const lv_color_t v = lv_color_hex(c);
  if (!lv_color_eq(lv_obj_get_style_border_color(o, LV_PART_MAIN), v)) lv_obj_set_style_border_color(o, v, 0);
  if (lv_obj_get_style_border_width(o, LV_PART_MAIN) != w) lv_obj_set_style_border_width(o, w, 0);
}
void setRadius(lv_obj_t* o, int r) {
  if (lv_obj_get_style_radius(o, LV_PART_MAIN) != r) lv_obj_set_style_radius(o, r, 0);
}
void setPos(lv_obj_t* o, int x, int y) {
  if (lv_obj_get_x(o) != x || lv_obj_get_y(o) != y) lv_obj_set_pos(o, x, y);
}
void setX(lv_obj_t* o, int x) {
  if (lv_obj_get_x(o) != x) lv_obj_set_x(o, x);
}
void setW(lv_obj_t* o, int w) {
  if (lv_obj_get_width(o) != w) lv_obj_set_width(o, w);
}
void setAlign(lv_obj_t* o, lv_text_align_t a) {
  if (lv_obj_get_style_text_align(o, LV_PART_MAIN) != a) lv_obj_set_style_text_align(o, a, 0);
}
void setImgColor(lv_obj_t* img, uint32_t c) {
  const lv_color_t v = lv_color_hex(c);
  if (!lv_color_eq(lv_obj_get_style_image_recolor(img, LV_PART_MAIN), v)) lv_obj_set_style_image_recolor(img, v, 0);
}

lv_obj_t* lockImage(lv_obj_t* parent, int x, int y) {
  lv_obj_t* img = lv_image_create(parent);
  lv_image_set_src(img, &img_lock_28);
  lv_obj_set_pos(img, x, y);
  lv_obj_set_style_image_recolor(img, lv_color_hex(C_LOCK), 0);
  lv_obj_set_style_image_recolor_opa(img, LV_OPA_COVER, 0);
  lv_obj_remove_flag(img, LV_OBJ_FLAG_CLICKABLE);
  return img;
}

// ---- 큰 숫자 5칸(num_128, 시계·발표 공용 — layout.h DIGIT_*). 글자 기준선 y 268(README 3.1)
struct Digits {
  lv_obj_t* c[5];
};
void buildDigits(Digits& d, lv_obj_t* parent, int yOff) {
  const int lh = num_128.line_height;
  const int top = 268 - (lh - num_128.base_line) - yOff;
  for (int i = 0; i < 5; ++i) {
    // 칸보다 4px 넓게 잡아 넓은 글자 가장자리가 잘리지 않게(가운데 정렬이라 위치는 같다)
    d.c[i] = text(parent, &num_128, C_T1, wc::DIGIT_X[i] - 4, top, wc::DIGIT_W[i] + 8, lh, LV_TEXT_ALIGN_CENTER, "-");
    lv_label_set_long_mode(d.c[i], LV_LABEL_LONG_CLIP);
  }
  setText(d.c[2], ":");
}
// s = 'HH:MM' 5글자. 바뀐 칸만 다시 그린다
void setDigits(Digits& d, const char* s, uint32_t digitColor, uint32_t colonColor) {
  for (int i = 0; i < 5; ++i) {
    const char one[2] = {s[i], 0};
    setText(d.c[i], one);
    setTextColor(d.c[i], i == 2 ? colonColor : digitColor);
  }
}

std::string fmtElapsed(double ms) {
  int sec = static_cast<int>(ms / 1000.0);
  int mm = sec / 60, ss = sec % 60;
  if (mm > 99) {  // 99:59 에서 멈춘다(README 3.2)
    mm = 99;
    ss = 59;
  }
  char b[24];
  std::snprintf(b, sizeof(b), "%02d:%02d", mm, ss);
  return b;
}

// 레일 칸 i(0 시계, 1 발표, 2 실행, 3 회의)의 모드
wc::ModeId railMode(int i) {
  static constexpr wc::ModeId k[4] = {wc::ModeId::Clock, wc::ModeId::Present, wc::ModeId::Launch, wc::ModeId::Meeting};
  return k[i];
}

// ---- 객체
bool g_built = false;
lv_obj_t* scr = nullptr;
// 상태줄(sbRoot 를 시계 모드에서 분마다 ±2px 옮긴다)
lv_obj_t *sbRoot, *sbChip, *sbMode, *sbTime, *sbLock, *sbBle, *sbBatt, *sbPct, *sbRail[4];
// 발표
lv_obj_t *pRoot, *pFlash[2], *pDot, *pState, *pLockImg, *pLockTxt, *pEdge[2], *pStartHint, *pBlack, *pBlackTxt, *pHint[3],
    *pArrow[2], *pAirRing, *pAirDot, *pAirLabel, *pAirHelp;
Digits pDig;
// 실행
lv_obj_t *cRoot, *cTile[6], *cLabel[6], *cHint[6], *cTabs, *cTab[2], *cTabLine;
// 시계
lv_obj_t *kFace, *kDateRow, *kDate, *kDow, *kDowTxt;
Digits kDig;
// 회의
lv_obj_t *mRoot, *mChip[3], *mChipTxt[3], *mTile[3], *mIcon[3], *mTitle[3], *mState[3], *mMicHint, *mMicBadge, *mMicSub;
// 시트(발표). 위 모서리를 화면 밖으로 빼서 아래 모서리만 둥글게 보이게 한다(shRoot y = -28)
constexpr int SHEET_TOP_PAD = 28;
lv_obj_t *shRoot, *shTitle, *shTime, *shBtn[2], *shBtnTxt[2], *shBtnKey[2], *shSet, *shSetTitle, *shSetSub;
// 연결 대기(페어링)
lv_obj_t *wRoot, *wGuide, *wRepair, *wName, *wChip, *wChipTxt, *wDot[3];
// 끊김 배너(lv_layer_top — 모든 화면 공유)
lv_obj_t *bnRoot, *bnIcon, *bnOkDot, *bnTitle;
// 전원 끄기 확인(lv_layer_top, 배너보다 위 — 화면 전체 불투명 검정)
lv_obj_t *pcRoot, *pcTitle, *pcHint, *pcBtn[2], *pcKeys, *pcBye;
// 설정
lv_obj_t *sRoot, *sRow[SETTINGS_ROWS], *sKey[SETTINGS_ROWS], *sVal[SETTINGS_ROWS], *sClose;

// ---- 움직임 상태(계단식 — render 가 경과 시간으로 단계를 고른다)
bool g_modeKnown = false;
wc::ModeId g_lastMode = wc::ModeId::Clock;
double g_chipUntil = 0;       // 이름 칩 반전 끝
bool g_sheetShown = false;    // 지금 시트를 그리고 있나
double g_sheetOpenAt = -1e9;  // 열기 시작 시각
double g_sheetCloseAt = -1e9; // 닫기 시작 시각
bool g_wasLost = false;
double g_reconnUntil = 0;     // '연결됨' 표시 끝
double g_bannerAt = -1e9;     // 배너 등장 시작
uint32_t g_actSeq = 0;
double g_actAt = -1e9;
wc::ActionId g_act = wc::ActionId::Next;
bool g_actSent = false;

void buildStatusBar() {
  sbRoot = frame(scr, 0, 0, 410, 56);
  sbChip = box(sbRoot, 32, 9, 72, 34, kModeColors[3].accent, LV_RADIUS_CIRCLE);
  setHidden(sbChip, true);
  sbMode = text(sbRoot, &kr_24, kModeColors[3].accent, 36, 11, 64, 30, LV_TEXT_ALIGN_CENTER, "");
  sbTime = text(sbRoot, &kr_20, C_T1, 116, 13, 70, 26, LV_TEXT_ALIGN_CENTER, "--:--");
  sbLock = lockImage(sbRoot, 218, 12);
  sbBle = text(sbRoot, &lv_font_montserrat_20, C_T2, 252, 12, 28, 28, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_BLUETOOTH);
  sbBatt = text(sbRoot, &lv_font_montserrat_20, C_T2, 288, 12, 28, 28, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_BATTERY_EMPTY);
  sbPct = text(sbRoot, &kr_20, C_T2, 318, 13, 52, 26, LV_TEXT_ALIGN_RIGHT, "--%");
  for (int i = 0; i < 4; ++i)
    sbRail[i] = box(sbRoot, wc::RAIL_X0 + i * wc::RAIL_PITCH, wc::RAIL_Y, wc::RAIL_W, wc::RAIL_H, C_BORDER, 2);
}

void buildPresent() {
  pRoot = frame(scr, 0, 0, 410, 502);
  const ModeColors& c = kModeColors[0];
  // 넘김 플래시(영역 0,64,120×422 / 290,64,120×422) — 맨 아래에 깐다
  pFlash[0] = box(pRoot, 0, 64, 120, 422, c.dimBorder, 0);
  pFlash[1] = box(pRoot, 290, 64, 120, 422, c.dimBorder, 0);
  pDot = box(pRoot, 40, 120, 12, 12, C_BG, LV_RADIUS_CIRCLE, C_T3, 2);
  pState = text(pRoot, &kr_24, C_T2, 62, 111, 200, 30, LV_TEXT_ALIGN_LEFT, S::PRESENT_PRE);
  pLockImg = lockImage(pRoot, 300, 112);
  pLockTxt = text(pRoot, &kr_24, C_LOCK, 332, 111, 50, 30, LV_TEXT_ALIGN_LEFT, S::PRESENT_LOCKED);
  buildDigits(pDig, pRoot, 0);
  pEdge[0] = box(pRoot, 8, 162, 4, 120, C_TDIS, 2);
  pEdge[1] = box(pRoot, 398, 162, 4, 120, C_TDIS, 2);
  pStartHint = text(pRoot, &kr_20, C_T3, 0, 308, 410, 30, LV_TEXT_ALIGN_CENTER, S::PRESENT_START_HINT);
  pBlack = box(pRoot, 123, 336, 164, 52, c.accent, 12);
  pBlackTxt = text(pBlack, &kr_28, C_ON_ACCENT, 0, 0, 164, 52, LV_TEXT_ALIGN_CENTER, S::PRESENT_BLACK_CHIP);
  pHint[0] = text(pRoot, &kr_20, C_T3, 0, 412, 120, 28, LV_TEXT_ALIGN_CENTER, "");
  pHint[1] = text(pRoot, &kr_20, C_T3, 120, 412, 170, 28, LV_TEXT_ALIGN_CENTER, "");
  pHint[2] = text(pRoot, &kr_20, C_T3, 290, 412, 120, 28, LV_TEXT_ALIGN_CENTER, "");
  pArrow[0] = text(pRoot, &lv_font_montserrat_48, c.strong, 36, 328, 48, 48, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_LEFT);
  pArrow[1] = text(pRoot, &lv_font_montserrat_48, c.strong, 326, 328, 48, 48, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_RIGHT);
  // 에어마우스(README 3.2): 링 125,180,160×160 3px, 점 199,254,12, 라벨 0,352, 안내 0,388
  pAirRing = box(pRoot, 125, 180, 160, 160, C_BG, LV_RADIUS_CIRCLE, c.accent, 3);
  lv_obj_set_style_bg_opa(pAirRing, LV_OPA_TRANSP, 0);
  pAirDot = box(pRoot, 199, 254, 12, 12, c.accent, LV_RADIUS_CIRCLE);
  pAirLabel = text(pRoot, &kr_24, C_T2, 0, 352, 410, 30, LV_TEXT_ALIGN_CENTER, S::PRESENT_AIR_LABEL);
  pAirHelp = text(pRoot, &kr_20, C_T3, 0, 388, 410, 26, LV_TEXT_ALIGN_CENTER, S::PRESENT_AIR_HELP);
  for (lv_obj_t* o : {pFlash[0], pFlash[1], pArrow[0], pArrow[1], pAirRing, pAirDot, pAirLabel, pAirHelp, pBlack})
    setHidden(o, true);
}

// 실행 모드 2×3 타일(쪽마다 6개) — 라벨은 keymap 라벨(한글), 힌트는 'Win+1' 등. 타일 v2 구조(색 띠·배지)는 P1-1
void buildLaunch() {
  cRoot = frame(scr, 0, 0, 410, 502);
  for (int i = 0; i < wc::LAUNCH_TILES_PER_PAGE; ++i) {
    const wc::Rect& r = wc::LAUNCH_TILES[i];
    const int w = r.x1 - r.x0;
    cTile[i] = box(cRoot, r.x0, r.y0, w, r.y1 - r.y0, C_S1, 20, C_BORDER, 1);
    cLabel[i] = text(cTile[i], &kr_28, C_T1, 8, 24, w - 18, 40, LV_TEXT_ALIGN_CENTER, "");
    cHint[i] = text(cTile[i], &kr_20, C_T3, 8, 70, w - 18, 28, LV_TEXT_ALIGN_CENTER, "");
  }
  // 쪽 탭 '앱 | 업무'(터치 영역 LAUNCH_DOTS 전체 = 다음 쪽). 밑줄 28×3 at y 492
  cTabs = frame(cRoot, 0, 462, 410, 40);
  cTab[0] = text(cTabs, &kr_20, C_T1, 115, 4, 60, 26, LV_TEXT_ALIGN_CENTER, S::LAUNCH_TAB_APPS);
  cTab[1] = text(cTabs, &kr_20, C_TDIS, 225, 4, 60, 26, LV_TEXT_ALIGN_CENTER, S::LAUNCH_TAB_WORK);
  cTabLine = box(cTabs, 131, 30, 28, 3, kModeColors[1].accent, 1);
}

// 시계 모드(README 3.1) — kFace(410×446 @ 0,56)를 분마다 8점 궤도(±8px)로 옮긴다
void buildClock() {
  kFace = frame(scr, 0, 56, 410, 446);
  buildDigits(kDig, kFace, 56);
  kDateRow = frame(kFace, 0, 300 - 56, 410, 40);
  lv_obj_set_flex_flow(kDateRow, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(kDateRow, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_column(kDateRow, 14, 0);
  kDate = lv_label_create(kDateRow);
  lv_obj_set_style_text_font(kDate, &kr_28, 0);
  lv_obj_set_style_text_color(kDate, lv_color_hex(C_T2), 0);
  lv_label_set_text(kDate, "");
  lv_obj_remove_flag(kDate, LV_OBJ_FLAG_CLICKABLE);
  kDow = box(kDateRow, 0, 0, 52, 40, C_BG, 20, C_BORDER, 2);
  kDowTxt = text(kDow, &kr_28, C_T2, 0, 0, 48, 36, LV_TEXT_ALIGN_CENTER, "");
}

void buildMeeting() {
  mRoot = frame(scr, 0, 0, 410, 502);
  // 칩은 y 64, 높이 48 로 그린다(터치 영역 MEETING_CHIPS 는 y 40~118)
  for (int i = 0; i < 3; ++i) {
    const wc::Rect& r = wc::MEETING_CHIPS[i];
    mChip[i] = box(mRoot, r.x0, 64, r.x1 - r.x0, 48, C_S1, LV_RADIUS_CIRCLE, C_BORDER, 1);
    mChipTxt[i] = text(mChip[i], &kr_24, C_T2, 0, 0, r.x1 - r.x0 - 2, 46, LV_TEXT_ALIGN_CENTER, "");
  }
  for (int a = 0; a < 3; ++a) {
    const wc::Rect& r = wc::MEETING_TILES[a];
    const int w = r.x1 - r.x0, h = r.y1 - r.y0;
    mTile[a] = box(mRoot, r.x0, r.y0, w, h, C_S1, a == 0 ? 28 : 20, C_BORDER, 1);
    if (a == 0) {
      // 마이크 큰 타일 378×220(README 3.4): 힌트 +20,+18 · 배지 끝 +358,+14 · 기호 +141,+30 · 상태 +0,+132 · 보조 +0,+174
      mMicHint = text(mTile[a], &kr_20, C_T3, 20, 18, 200, 26, LV_TEXT_ALIGN_LEFT, "");
      mMicBadge = text(mTile[a], &kr_24, C_T2, 238, 14, 120, 30, LV_TEXT_ALIGN_RIGHT, "");
      mIcon[a] = text(mTile[a], &lv_font_montserrat_48, C_T2, 141, 40, 96, 64, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_AUDIO);
      mTitle[a] = text(mTile[a], &kr_32, C_T1, 0, 128, w - 2, 40, LV_TEXT_ALIGN_CENTER, "");
      mMicSub = text(mTile[a], &kr_24, C_T2, 0, 172, w - 2, 30, LV_TEXT_ALIGN_CENTER, "");
      mState[a] = nullptr;
    } else {
      // 작은 타일 183×130: 기호 +18,+12 · 라벨 +18,+60 kr_32 · 상태 +18,+96 kr_20
      mIcon[a] = text(mTile[a], &lv_font_montserrat_48, C_T2, 18, 6, 60, 52, LV_TEXT_ALIGN_LEFT, LV_SYMBOL_VIDEO);
      mTitle[a] = text(mTile[a], &kr_32, C_T1, 18, 56, 147, 40, LV_TEXT_ALIGN_LEFT, "");
      mState[a] = text(mTile[a], &kr_20, C_T2, 18, 96, 147, 26, LV_TEXT_ALIGN_LEFT, "");
    }
  }
}

// 발표 쇼 시트(README 2.4 변형 A, H 344, 덮개 없음). 시트 좌표 = 화면 좌표(+SHEET_TOP_PAD)
void buildSheet() {
  shRoot = box(scr, 0, -SHEET_TOP_PAD, 410, wc::SHEET_HEIGHT + SHEET_TOP_PAD, C_S2, 28);
  const int o = SHEET_TOP_PAD;
  shTitle = text(shRoot, &kr_28, C_T1, 28, 28 + o, 220, 40, LV_TEXT_ALIGN_LEFT, S::SHEET_TITLE);
  shTime = text(shRoot, &kr_28, C_T2, 250, 28 + o, 132, 40, LV_TEXT_ALIGN_RIGHT, "00:00");
  const wc::Rect rs[2] = {wc::SHEET_SHOW_START, wc::SHEET_SHOW_END};
  for (int i = 0; i < 2; ++i) {
    const int w = rs[i].x1 - rs[i].x0;
    shBtn[i] = box(shRoot, rs[i].x0, rs[i].y0 + o, w, rs[i].y1 - rs[i].y0, C_S1, 20, C_BORDER, 1);
    shBtnTxt[i] = text(shBtn[i], &kr_28, C_T1, 0, 28, w - 2, 40, LV_TEXT_ALIGN_CENTER, "");
    shBtnKey[i] = text(shBtn[i], &kr_20, C_T3, 0, 70, w - 2, 26, LV_TEXT_ALIGN_CENTER, "");
  }
  const wc::Rect& sr = wc::SHEET_SETTINGS_ROW;
  shSet = box(shRoot, sr.x0, sr.y0 + o, sr.x1 - sr.x0, sr.y1 - sr.y0, C_S1, 20, C_BORDER, 1);
  shSetTitle = text(shSet, &kr_28, C_T1, 24, 8, 250, 36, LV_TEXT_ALIGN_LEFT, S::SHEET_SETTINGS);
  shSetSub = text(shSet, &kr_24, C_T2, 24, 48, 330, 30, LV_TEXT_ALIGN_LEFT, S::SHEET_SETTINGS_SUB);
  box(shRoot, 185, 332 + o, 40, 4, C_BORDER, 2);  // 손잡이
  setHidden(shRoot, true);
}

// 연결 대기(페어링) 화면(README 3.5). 화면 전체를 덮고, 상태줄은 그 위에 그린다
void buildWait() {
  wRoot = box(scr, 0, 0, 410, 502, C_BG, 0);
  text(wRoot, &lv_font_montserrat_48, C_T2, 161, 72, 88, 56, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_BLUETOOTH);
  // 안내 줄은 BLE 상태를 보여 준다: 광고 중 = 이름 찾기 안내 / 연결 중 / 다시 켜는 중 / 본드 불일치(kr_20 경고색)
  wGuide = text(wRoot, &kr_24, C_T2, 20, 136, 370, 30, LV_TEXT_ALIGN_CENTER, S::PAIR_GUIDE);
  wRepair = text(wRoot, &kr_20, C_WARN, 20, 136, 370, 30, LV_TEXT_ALIGN_CENTER, S::PAIR_REPAIR);
  setHidden(wRepair, true);
  wName = text(wRoot, &kr_32, C_T1, 20, 176, 370, 40, LV_TEXT_ALIGN_CENTER, "");
  wChip = box(wRoot, 105, 232, 200, 72, C_S1, 20, C_BORDER, 1);
  wChipTxt = text(wChip, &lv_font_montserrat_48, C_T1, 0, 0, 198, 70, LV_TEXT_ALIGN_CENTER, "");
  lv_obj_set_style_text_letter_space(wChipTxt, 8, 0);
  const char* steps[3] = {S::PAIR_STEP1, S::PAIR_STEP2, S::PAIR_STEP3};
  static const char* const nums[3] = {"1", "2", "3"};
  for (int i = 0; i < 3; ++i) {
    const int y = 324 + i * 30;
    lv_obj_t* circle = box(wRoot, 56, y + 3, 24, 24, C_S3, LV_RADIUS_CIRCLE);
    text(circle, &kr_20, C_T1, 0, 0, 24, 24, LV_TEXT_ALIGN_CENTER, nums[i]);
    text(wRoot, &kr_24, C_T2, 88, y, 300, 30, LV_TEXT_ALIGN_LEFT, steps[i]);
  }
  text(wRoot, &kr_20, C_T3, 20, 428, 370, 26, LV_TEXT_ALIGN_CENTER, S::PAIR_TIP);
  for (int i = 0; i < 3; ++i) wDot[i] = box(wRoot, 175 + i * 24, 460, 12, 12, C_S3, LV_RADIUS_CIRCLE);
}

// 끊김 배너(README 2.2, 실기 피드백 3) — lv_layer_top 에 하나. 한 줄 16,438,378×48 '연결 끊김 · 12초'.
// 시계 모드에서는 띄우지 않는다(상태줄의 빨간 BLE 점멸만). 설정 화면에서는 보인다
constexpr int BANNER_Y = 438, BANNER_H = 48;
void buildPowerConfirm();
void buildBanner() {
  bnRoot = box(lv_layer_top(), 16, BANNER_Y, 378, BANNER_H, C_DANGER_DIM, 16, C_DANGER, 2);
  bnIcon = text(bnRoot, &lv_font_montserrat_20, C_DANGER, 10, 0, 28, BANNER_H - 4, LV_TEXT_ALIGN_CENTER, LV_SYMBOL_BLUETOOTH);
  bnOkDot = box(bnRoot, 19, (BANNER_H - 4 - 10) / 2, 10, 10, C_OK, LV_RADIUS_CIRCLE);
  bnTitle = text(bnRoot, &kr_24, C_T1, 46, 0, 318, BANNER_H - 4, LV_TEXT_ALIGN_LEFT, S::BANNER_LOST);
  setHidden(bnOkDot, true);
  setHidden(bnRoot, true);
}

// 전원 끄기 확인(실기 피드백 11) — 덮개 없이 화면 전체를 불투명 검정으로. [끄기]·[취소] 183×112(wc/layout.h)
void buildPowerConfirm() {
  pcRoot = box(lv_layer_top(), 0, 0, 410, 502, C_BG, 0);
  pcTitle = text(pcRoot, &kr_32, C_T1, 20, 112, 370, 44, LV_TEXT_ALIGN_CENTER, S::POWER_TITLE);
  pcHint = text(pcRoot, &kr_24, C_T2, 20, 176, 370, 32, LV_TEXT_ALIGN_CENTER, "");
  const wc::Rect rs[2] = {wc::POWER_OFF_BTN, wc::POWER_CANCEL_BTN};
  static const char* const labels[2] = {S::POWER_OFF, S::POWER_CANCEL};
  for (int i = 0; i < 2; ++i) {
    const int w = rs[i].x1 - rs[i].x0, h = rs[i].y1 - rs[i].y0;
    pcBtn[i] = box(pcRoot, rs[i].x0, rs[i].y0, w, h, i == 0 ? C_DANGER_DIM : C_S1, 20, i == 0 ? C_DANGER : C_BORDER, 2);
    text(pcBtn[i], &kr_32, i == 0 ? C_DANGER : C_T1, 0, 0, w - 4, h - 4, LV_TEXT_ALIGN_CENTER, labels[i]);
  }
  pcKeys = text(pcRoot, &kr_20, C_T3, 20, 432, 370, 26, LV_TEXT_ALIGN_CENTER, S::POWER_KEYS);
  pcBye = text(pcRoot, &kr_32, C_T1, 20, 230, 370, 44, LV_TEXT_ALIGN_CENTER, S::POWER_SHUTTING_DOWN);
  setHidden(pcBye, true);
  setHidden(pcRoot, true);
}

// 설정 화면(구조는 그대로 — 88px 스크롤 목록은 P1-3). 상태줄 '설정' 아래 y 56 부터
void buildSettings() {
  sRoot = box(scr, 0, 56, 410, 446, C_BG, 0);
  static const char* const keys[SETTINGS_ROWS] = {S::SETTINGS_FLICK, S::SETTINGS_AIR, S::SETTINGS_SENS, S::SETTINGS_OS,     S::SETTINGS_RAISE,
                                                  S::SETTINGS_IMU, S::SETTINGS_NAME, S::SETTINGS_VERSION};
  for (int i = 0; i < SETTINGS_ROWS; ++i) {
    sRow[i] = box(sRoot, 16, SETTINGS_ROW_Y0 - 56 + i * SETTINGS_ROW_H, 378, SETTINGS_ROW_H - 6, C_S1, 14, C_BORDER, 1);
    sKey[i] = text(sRow[i], &kr_24, C_T2, 16, 0, 170, SETTINGS_ROW_H - 8, LV_TEXT_ALIGN_LEFT, keys[i]);
    sVal[i] = text(sRow[i], &kr_24, C_T1, 160, 0, 200, SETTINGS_ROW_H - 8, LV_TEXT_ALIGN_RIGHT, "");
  }
  // 닫기(탭 영역 16,384,378×88). 위로 쓸기·오른쪽 스와이프·BOOT·PWR 짧게·30초 무입력으로도 닫힌다
  sClose = box(sRoot, 16, SETTINGS_CLOSE_Y0 - 56 + 8, 378, SETTINGS_CLOSE_H - 16, C_S2, 20, C_BORDER, 1);
  text(sClose, &kr_28, C_T1, 0, 0, 376, SETTINGS_CLOSE_H - 18, LV_TEXT_ALIGN_CENTER, S::SETTINGS_CLOSE);
}

// 마지막 동작 이벤트 경과(ms). 새 동작이면 시각을 기록
double actAge(const Model& m) {
  if (m.actSeq != g_actSeq) {
    g_actSeq = m.actSeq;
    g_actAt = m.actAt;
    g_act = m.actAction;
    g_actSent = m.actSent;
  }
  return m.now - g_actAt;
}

}  // namespace

bool built() { return g_built; }

int settingsRowAt(int y) {
  if (y >= SETTINGS_CLOSE_Y0 && y < SETTINGS_CLOSE_Y0 + SETTINGS_CLOSE_H) return kRowClose;
  if (y < SETTINGS_ROW_Y0) return -1;
  const int r = (y - SETTINGS_ROW_Y0) / SETTINGS_ROW_H;
  return r < SETTINGS_ROWS ? r : -1;
}

void build(const wc::Keymap& km) {
  (void)km;
  if (!lvgl_port_lock(0)) return;
  scr = lv_screen_active();
  lv_obj_clean(scr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(C_BG), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);
  lv_obj_remove_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  // 그리는 순서 = 겹침 순서(아래 → 위). 시트는 상태줄·레일을 가린다(README 05 6.1)
  buildPresent();
  buildClock();
  buildLaunch();
  buildMeeting();
  buildWait();
  buildSettings();
  buildStatusBar();
  buildSheet();
  buildBanner();
  buildPowerConfirm();
  lvgl_port_unlock();
  g_built = true;
  ESP_LOGI(TAG, "screen objects built (v2)");
}

void render(const Model& m, const wc::Keymap& km) {
  if (!g_built) return;
  if (!lvgl_port_lock(100)) return;
  const wc::CoreState& s = m.s;
  const ModeColors& c = mc(s.mode);
  const bool waiting = !s.connected && !s.everConnected;
  const bool lost = !s.connected && s.everConnected;
  const bool nonMode = waiting || m.settingsOpen;
  const double age = actAge(m);

  // 모드가 바뀌면 이름 칩을 600ms 반전(중앙 큰 제목 대신 — README 2.1)
  if (!g_modeKnown || s.mode != g_lastMode) {
    if (g_modeKnown) g_chipUntil = m.now + 600;
    g_modeKnown = true;
    g_lastMode = s.mode;
  }

  // ---------------------------------------------------------------- 상태줄(README 2.1)
  {
    const bool chip = !nonMode && m.now < g_chipUntil;
    setHidden(sbChip, !chip);
    setBg(sbChip, c.accent);
    const char* name = m.settingsOpen ? S::SCREEN_SETTINGS
                       : waiting      ? S::SCREEN_WAITING
                                      : km.modes[wc::idx(s.mode)].name.c_str();
    setText(sbMode, name);
    setW(sbMode, nonMode ? 150 : 64);
    setAlign(sbMode, nonMode ? LV_TEXT_ALIGN_LEFT : LV_TEXT_ALIGN_CENTER);
    setTextColor(sbMode, chip ? C_ON_ACCENT : m.settingsOpen ? c.accent : waiting ? C_T2 : lost ? C_T3 : c.accent);
    char b[24];
    if (m.timeValid) std::snprintf(b, sizeof(b), "%02d:%02d", m.hour, m.minute);
    else std::snprintf(b, sizeof(b), "--:--");
    setText(sbTime, b);
    setHidden(sbTime, nonMode || s.mode == wc::ModeId::Clock);  // 시계 모드는 큰 숫자가 시각이다
    setHidden(sbLock, !s.locked);
    // BLE: 연결 text-2 / 끊김 danger 500ms 점멸 / 첫 연결 대기 waiting
    const bool blinkOff = lost && (static_cast<int64_t>(m.now / 500.0) % 2 == 1);
    // 본드 불일치 = 경고색(PC 에서 다시 추가 필요), 연결 중(암호화) = text-1, 광고 재시도 대기 = 비활성
    const uint32_t bleCol = s.connected                       ? C_T2
                            : m.ble == WC_BLE_NEEDS_REPAIR    ? C_WARN
                            : m.ble == WC_BLE_CONNECTING      ? C_T1
                            : m.ble == WC_BLE_OFF             ? C_TDIS
                            : waiting                         ? C_WAIT
                                                              : C_DANGER;
    setTextColor(sbBle, bleCol);
    setHidden(sbBle, blinkOff);
    const int p = m.batteryPct;
    const char* sym = m.charging ? LV_SYMBOL_CHARGE
                      : p < 0    ? LV_SYMBOL_BATTERY_EMPTY
                      : p > 80   ? LV_SYMBOL_BATTERY_FULL
                      : p > 55   ? LV_SYMBOL_BATTERY_3
                      : p > 30   ? LV_SYMBOL_BATTERY_2
                      : p > 10   ? LV_SYMBOL_BATTERY_1
                                 : LV_SYMBOL_BATTERY_EMPTY;
    setText(sbBatt, sym);
    const uint32_t bc = m.charging ? C_OK : p >= 0 && p <= 10 ? C_DANGER : p >= 0 && p <= 20 ? C_WARN : C_T2;
    setTextColor(sbBatt, bc);
    if (p < 0) std::snprintf(b, sizeof(b), "--%%");
    else std::snprintf(b, sizeof(b), "%d%%", p);
    setText(sbPct, b);
    setTextColor(sbPct, bc == C_OK ? C_T2 : bc);
    for (int i = 0; i < 4; ++i) {
      const wc::ModeId rm = railMode(i);
      uint32_t col = C_BORDER;
      if (!nonMode && rm == s.mode) col = lost ? C_T3 : c.accent;
      else if (rm == wc::ModeId::Present && s.show.running && !nonMode) col = kModeColors[0].dimBorder;  // 쇼 진행 중
      setBg(sbRail[i], col);
    }
    // 번인: 시계 모드에서만 분마다 (0,0)→(2,1)→(−2,2)→(1,−1)
    static constexpr int kSbOrbit[4][2] = {{0, 0}, {2, 1}, {-2, 2}, {1, -1}};
    const int oi = (!nonMode && s.mode == wc::ModeId::Clock && m.timeValid) ? m.minute % 4 : 0;
    setPos(sbRoot, kSbOrbit[oi][0], kSbOrbit[oi][1]);
  }

  // ---------------------------------------------------------------- 본문 보이기
  setHidden(pRoot, s.mode != wc::ModeId::Present || nonMode);
  setHidden(cRoot, s.mode != wc::ModeId::Launch || nonMode);
  setHidden(kFace, s.mode != wc::ModeId::Clock || nonMode);
  setHidden(mRoot, s.mode != wc::ModeId::Meeting || nonMode);
  setHidden(wRoot, !waiting || m.settingsOpen);
  setHidden(sRoot, !m.settingsOpen);

  // ---------------------------------------------------------------- 발표(README 3.2)
  if (s.mode == wc::ModeId::Present && !nonMode) {
    const bool ended = !s.show.running && s.show.startedAt.has_value();
    const bool air = s.air.active;
    const uint32_t tSub = lost ? C_T3 : C_T2;
    // 상태 점: 시작 전 링 / 진행 중 원 / 끝남 사각
    if (s.show.running) {
      setBgOpa(pDot, true);
      setBg(pDot, lost ? C_T3 : c.accent);
      setBorder(pDot, C_BG, 0);
      setRadius(pDot, LV_RADIUS_CIRCLE);
    } else if (ended) {
      setBgOpa(pDot, true);
      setBg(pDot, C_T2);
      setBorder(pDot, C_BG, 0);
      setRadius(pDot, 0);
    } else {
      setBgOpa(pDot, false);
      setBorder(pDot, C_T3, 2);
      setRadius(pDot, LV_RADIUS_CIRCLE);
    }
    setText(pState, s.show.running ? S::PRESENT_RUN : ended ? S::PRESENT_ENDED : S::PRESENT_PRE);
    setTextColor(pState, tSub);
    setHidden(pLockImg, !s.locked);
    setHidden(pLockTxt, !s.locked);
    // 경과 숫자: 쇼 중 콜론 500ms 점멸, 암전이면 text-2
    const std::string el = fmtElapsed(m.showElapsedMs);
    const uint32_t dcol = lost ? C_T3 : s.show.blackout ? C_T2 : C_T1;
    const bool colonDim = s.show.running && (static_cast<int64_t>(m.now / 500.0) % 2 == 1);
    setDigits(pDig, el.c_str(), dcol, colonDim ? C_TDIS : dcol);
    for (auto* d : pDig.c) setHidden(d, air);
    setHidden(pStartHint, air || s.show.running || ended);
    setHidden(pBlack, air || !s.show.blackout);
    setBg(pBlack, lost ? C_T3 : c.accent);
    // 힌트(keymap 라벨: 이전·다음·암전)
    const wc::AppId app = s.apps.present;
    const wc::KeymapAction* aPrev = wc::findAction(km, wc::ModeId::Present, app, wc::ActionId::Prev);
    const wc::KeymapAction* aNext = wc::findAction(km, wc::ModeId::Present, app, wc::ActionId::Next);
    const wc::KeymapAction* aBlack = wc::findAction(km, wc::ModeId::Present, app, wc::ActionId::Blackout);
    setText(pHint[0], aPrev ? fmt(S::PRESENT_HINT_PREV, aPrev->label.c_str()) : std::string());
    setText(pHint[2], aNext ? fmt(S::PRESENT_HINT_NEXT, aNext->label.c_str()) : std::string());
    setText(pHint[1], s.show.blackout ? std::string(S::PRESENT_HINT_RESUME)
                      : aBlack        ? fmt(S::PRESENT_HINT_HOLD, aBlack->label.c_str())
                                      : std::string());
    for (auto* h : pHint) setHidden(h, air);
    // 넘김 플래시 3단계(0ms dim-border → 130ms dim → 260ms 끝) + 가장자리 레일 strong→accent + 큰 화살표
    int side = -1;
    if (g_actSent && age >= 0 && age < 260) {
      if (g_act == wc::ActionId::Prev) side = 0;
      else if (g_act == wc::ActionId::Next) side = 1;
    }
    const bool early = age < 130;
    for (int i = 0; i < 2; ++i) {
      const bool on = side == i && !air;
      setHidden(pFlash[i], !on);
      if (on) setBg(pFlash[i], early ? c.dimBorder : c.dim);
      setHidden(pArrow[i], !on);
      if (on) setTextColor(pArrow[i], c.strong);
      setBg(pEdge[i], on ? (early ? c.strong : c.accent) : C_TDIS);
      setHidden(pEdge[i], air);
    }
    // 에어마우스
    setHidden(pAirRing, !air);
    setHidden(pAirDot, !air);
    setHidden(pAirLabel, !air);
    setHidden(pAirHelp, !air);
  }

  // ---------------------------------------------------------------- 실행(구조 유지, 한글 라벨)
  if (s.mode == wc::ModeId::Launch && !nonMode) {
    const wc::KeymapApp* app = wc::findApp(km, wc::ModeId::Launch, s.apps.launch);
    const size_t n = app ? app->actions.size() : 0;
    const int pages = static_cast<int>(std::max<size_t>(1, (n + 5) / 6));
    for (int i = 0; i < wc::LAUNCH_TILES_PER_PAGE; ++i) {
      const size_t ai = static_cast<size_t>(s.launchPage * wc::LAUNCH_TILES_PER_PAGE + i);
      const bool has = ai < n;
      const wc::KeymapAction* act = has ? &app->actions[ai] : nullptr;
      const auto b = act ? wc::bindingOf(*act, s.os) : std::nullopt;
      setHidden(cTile[i], !has);
      if (!has) continue;
      setText(cLabel[i], act->label);
      // 비활성 이유: 포털 주소 없음 / Mac 미지원 / 키 없음
      const char* why = act->hasUrl && act->url.empty() ? S::LAUNCH_NEED_URL
                        : s.os == wc::OsId::Mac         ? S::LAUNCH_NO_MAC
                                                        : S::LAUNCH_NO_KEY;
      setText(cHint[i], b ? bindingHint(b, s.os) : std::string(why));
      const bool pressed = m.press.kind == wc::HitKind::LaunchTile && m.press.index == i;
      const bool ok = g_actSent && age >= 0 && age < 400 && act->id == g_act;  // 탭 확정: 테두리 400ms
      setBg(cTile[i], !b ? C_BG : pressed ? c.dim : C_S1);
      setBorder(cTile[i], pressed || ok ? c.accent : C_BORDER, pressed || ok ? 2 : 1);
      setTextColor(cLabel[i], lost || !b ? C_TDIS : C_T1);
      setTextColor(cHint[i], C_T3);
    }
    setHidden(cTabs, pages < 2);
    setTextColor(cTab[0], s.launchPage == 0 ? C_T1 : C_TDIS);
    setTextColor(cTab[1], s.launchPage == 1 ? C_T1 : C_TDIS);
    setX(cTabLine, s.launchPage == 0 ? 131 : 241);
    setBg(cTabLine, lost ? C_T3 : c.accent);
  }

  // ---------------------------------------------------------------- 시계(README 3.1)
  if (s.mode == wc::ModeId::Clock && !nonMode) {
    static const char* const kDowNames[7] = {S::CLOCK_DOW0, S::CLOCK_DOW1, S::CLOCK_DOW2, S::CLOCK_DOW3,
                                        S::CLOCK_DOW4, S::CLOCK_DOW5, S::CLOCK_DOW6};
    if (m.timeValid) {
      char b[24];
      std::snprintf(b, sizeof(b), "%02d:%02d", m.hour, m.minute);
      setDigits(kDig, b, kModeColors[3].accent, C_T2);  // 콜론 점멸 없음
      setText(kDate, fmt(S::CLOCK_DATE, m.month + 1, m.mday));
      setHidden(kDow, false);
      setText(kDowTxt, kDowNames[m.wday % 7]);
      const bool sat = m.wday == 6, sun = m.wday == 0;
      setTextColor(kDowTxt, sat ? C_SAT : sun ? C_SUN : C_T2);
      setBorder(kDow, sat ? C_SAT_BORDER : sun ? C_SUN_BORDER : C_BORDER, 2);
      // 번인: 분마다 8점 궤도 ±8px(숫자를 다시 그리는 분 경계와 같이 처리)
      static constexpr int kOrbit[8][2] = {{0, 0}, {8, 0}, {8, 8}, {0, 8}, {-8, 8}, {-8, 0}, {-8, -8}, {0, -8}};
      const int oi = (m.hour * 60 + m.minute) % 8;
      setPos(kFace, kOrbit[oi][0], 56 + kOrbit[oi][1]);
    } else {
      setDigits(kDig, "--:--", C_TDIS, C_TDIS);
      setText(kDate, S::CLOCK_UNSYNCED);
      setHidden(kDow, true);
      setPos(kFace, 0, 56);
    }
  }

  // ---------------------------------------------------------------- 회의(구조 유지, 한글)
  if (s.mode == wc::ModeId::Meeting && !nonMode) {
    const auto& md = km.modes[wc::idx(wc::ModeId::Meeting)];
    for (int i = 0; i < 3; ++i) {
      const bool has = static_cast<size_t>(i) < md.appOrder.size();
      const wc::AppId id = has ? md.appOrder[static_cast<size_t>(i)] : wc::AppId::Zoom;
      const wc::KeymapApp* app = has ? wc::findApp(km, wc::ModeId::Meeting, id) : nullptr;
      setHidden(mChip[i], !app);
      setText(mChipTxt[i], app ? app->name : std::string());
      const bool sel = has && id == s.apps.meeting;
      const bool pressed = m.press.kind == wc::HitKind::MeetingChip && m.press.index == i;
      setBg(mChip[i], sel ? c.dim : pressed ? C_S3 : C_S1);
      setBorder(mChip[i], sel || pressed ? c.accent : C_BORDER, sel || pressed ? 2 : 1);
      setTextColor(mChipTxt[i], sel ? c.strong : C_T2);
    }
    const auto ma = wc::toMeetingApp(s.apps.meeting);
    const wc::MeetingEstimate est = ma ? s.meeting[static_cast<size_t>(wc::idx(*ma))] : wc::MeetingEstimate{};
    static constexpr wc::ActionId kAct[3] = {wc::ActionId::Mic, wc::ActionId::Camera, wc::ActionId::Hand};
    for (int a = 0; a < 3; ++a) {
      const wc::KeymapAction* act = wc::findAction(km, wc::ModeId::Meeting, s.apps.meeting, kAct[a]);
      const bool hasKey = act && wc::bindingOf(*act, s.os).has_value();
      const std::string label = act ? act->label : std::string();
      const bool known = a == 2 || (a == 0 ? est.mic : est.camera) != wc::Estimate::Unknown;
      const bool on = a == 0 ? est.mic == wc::Estimate::On : a == 1 ? est.camera == wc::Estimate::On : est.hand == wc::Hand::Up;
      const bool off = a == 0 ? est.mic == wc::Estimate::Off : a == 1 ? est.camera == wc::Estimate::Off : false;
      const bool muted = a == 0 && off;  // 마이크 꺼짐 = 위험색
      const char* state = !hasKey ? S::MEETING_NO_KEY
                          : a == 2 ? (on ? S::MEETING_UP : S::MEETING_DOWN)
                          : !known ? S::MEETING_UNKNOWN
                          : on     ? S::MEETING_ON
                                   : S::MEETING_OFF;
      // 기호(색만으로 알리지 않는다): 마이크 켜짐/꺼짐/모름, 카메라, 손
      const char* icon = a == 0 ? (!known ? "?" : on ? LV_SYMBOL_AUDIO : LV_SYMBOL_MUTE)
                         : a == 1 ? (!known ? "?" : on ? LV_SYMBOL_VIDEO : LV_SYMBOL_CLOSE)
                                  : (on ? LV_SYMBOL_UP : LV_SYMBOL_DOWN);
      setText(mIcon[a], icon);
      const bool pressed = m.press.kind == wc::HitKind::MeetingTile && m.press.index == a;
      // 탭 확정 플래시: 테두리 strong → accent → 원래 색(133ms 2단계)
      const bool flash = g_actSent && age >= 0 && age < 266 && g_act == kAct[a];
      uint32_t bg = muted ? C_DANGER_DIM : on ? c.dim : C_S1;
      uint32_t bd = muted ? C_DANGER : on ? c.dimBorder : C_BORDER;
      int bw = 1;
      if (pressed) {
        bg = C_S3;
        bd = c.accent;
        bw = 2;
      } else if (flash) {
        bd = age < 133 ? c.strong : c.accent;
        bw = 2;
      }
      setBg(mTile[a], bg);
      setBorder(mTile[a], bd, bw);
      const uint32_t stCol = lost || !hasKey ? C_T3 : muted ? C_DANGER : on ? c.strong : C_T2;
      setTextColor(mIcon[a], stCol);
      setTextColor(mTitle[a], lost ? C_T3 : muted ? C_DANGER : C_T1);
      if (a == 0) {
        setText(mTitle[a], known && hasKey ? fmt(S::MEETING_LABEL_STATE, label.c_str(), state) : label);
        setText(mMicBadge, known ? S::MEETING_ESTIMATED : S::MEETING_UNKNOWN);
        setText(mMicSub, !hasKey ? S::MEETING_NO_KEY : known ? S::MEETING_SYNC_HINT : S::MEETING_UNKNOWN_HINT);
        setText(mMicHint,
                chordText(wc::resolveChord(km, wc::ModeId::Meeting, s.apps.meeting, wc::ActionId::Mic, s.os), s.os));
      } else {
        setText(mTitle[a], label);
        setText(mState[a], state);
        setTextColor(mState[a], stCol);
      }
    }
  }

  // ---------------------------------------------------------------- 시트(발표, README 2.4) — 3단계 열기·2단계 닫기
  {
    const bool want = s.sheet.open && s.mode == wc::ModeId::Present && !nonMode;
    if (want && !g_sheetShown && m.now - g_sheetOpenAt > 200) g_sheetOpenAt = m.now;
    if (want) g_sheetShown = true;
    if (!want && g_sheetShown) {
      g_sheetShown = false;
      g_sheetCloseAt = m.now;
    }
    double p = 0;  // 내려온 비율
    if (want) {
      const double t = m.now - g_sheetOpenAt;
      p = t < 67 ? 0.6 : t < 133 ? 0.9 : 1.0;
    } else {
      const double t = m.now - g_sheetCloseAt;
      p = t < 67 ? 0.6 : t < 133 ? 0.2 : 0.0;
      if (s.mode != wc::ModeId::Present || nonMode) p = 0;
    }
    setHidden(shRoot, p <= 0);
    if (p > 0) {
      setPos(shRoot, 0, -SHEET_TOP_PAD - static_cast<int>(wc::SHEET_HEIGHT * (1.0 - p)));
      setText(shTime, fmtElapsed(m.showElapsedMs));
      static constexpr wc::ActionId kBtn[2] = {wc::ActionId::ShowStart, wc::ActionId::ShowEnd};
      for (int i = 0; i < 2; ++i) {
        const wc::KeymapAction* act = wc::findAction(km, wc::ModeId::Present, s.apps.present, kBtn[i]);
        const auto b = act ? wc::bindingOf(*act, s.os) : std::nullopt;
        setText(shBtnTxt[i], act ? act->label : std::string());
        setText(shBtnKey[i], bindingHint(b, s.os));
        const bool rec = (i == 0) != s.show.running;  // 권장: 쇼 전이면 시작, 진행 중이면 종료
        const bool pressed = m.press.kind == wc::HitKind::SheetButton && m.press.index == i;
        setBg(shBtn[i], pressed ? C_S3 : rec ? c.dim : C_S1);
        setBorder(shBtn[i], pressed ? c.accent : rec ? c.dimBorder : C_BORDER, pressed ? 2 : 1);
        setTextColor(shBtnTxt[i], s.connected && b ? C_T1 : C_TDIS);
      }
      setBg(shSet, m.press.sheetSettings ? C_S3 : C_S1);
      setBorder(shSet, m.press.sheetSettings ? c.accent : C_BORDER, m.press.sheetSettings ? 2 : 1);
    }
  }

  // ---------------------------------------------------------------- 연결 대기(페어링, README 3.5)
  if (waiting && !m.settingsOpen) {
    // 광고 이름 = '본체 끝4자리'(예 '손목 컨트롤러 D7C0') → 본체는 kr_32, 끝자리는 큰 칩
    std::string base = m.deviceName, tail;
    const size_t n = base.size();
    if (n > 5 && base[n - 5] == ' ' &&
        std::all_of(base.end() - 4, base.end(), [](char ch) { return (ch >= '0' && ch <= '9') || (ch >= 'A' && ch <= 'F'); })) {
      tail = base.substr(n - 4);
      base = base.substr(0, n - 5);
    }
    setText(wName, base);
    setHidden(wChip, tail.empty());
    setText(wChipTxt, tail);
    const bool repair = m.ble == WC_BLE_NEEDS_REPAIR;
    setHidden(wGuide, repair);
    setHidden(wRepair, !repair);
    setText(wGuide, m.ble == WC_BLE_CONNECTING ? S::PAIR_CONNECTING
                    : m.ble == WC_BLE_OFF      ? S::PAIR_RESTARTING
                                               : S::PAIR_GUIDE);
    setTextColor(wGuide, m.ble == WC_BLE_CONNECTING ? C_T1 : C_T2);
    // 대기 점: 500ms 마다 한 칸(멈춰 보이지 않게). 연결 중이면 250ms, 본드 불일치면 경고색
    const double step = m.ble == WC_BLE_CONNECTING ? 250.0 : 500.0;
    const int active = static_cast<int>(static_cast<int64_t>(m.now / step) % 3);
    for (int i = 0; i < 3; ++i) setBg(wDot[i], i == active ? (repair ? C_WARN : C_T1) : C_S3);
  }

  // ---------------------------------------------------------------- 끊김 배너(README 2.2)
  {
    if (lost && !g_wasLost) g_bannerAt = m.now;
    if (!lost && g_wasLost) g_reconnUntil = m.now + 1600;  // 재연결: '연결됨' 1.6초 뒤 즉시 숨김
    g_wasLost = lost;
    const bool reconn = !lost && m.now < g_reconnUntil;
    const bool clockFace = s.mode == wc::ModeId::Clock && !m.settingsOpen;  // 시계 모드: 배너 없음(상태줄 표시만)
    setHidden(bnRoot, (!lost && !reconn) || clockFace);
    if ((lost || reconn) && !clockFace) {
      const double up = m.now - g_bannerAt;  // 등장 2단계: y 486 → 462 → 438
      int x = 16;
      const bool dropped = lost && !g_actSent && age >= 0 && age < 800;  // 끊긴 채 입력 → 버렸다고 알림
      if (dropped && age < 400) {
        static constexpr int kShake[5] = {10, 22, 10, 22, 16};
        x = kShake[std::min(4, static_cast<int>(age / 80))];
      }
      setPos(bnRoot, x, lost && up < 60 ? 462 : BANNER_Y);
      setBg(bnRoot, reconn ? C_S2 : C_DANGER_DIM);
      setBorder(bnRoot, reconn ? C_OK : C_DANGER, 2);
      setHidden(bnIcon, reconn || (lost && static_cast<int64_t>(m.now / 500.0) % 2 == 1 &&
                                   !(s.disconnectedAt && m.now - *s.disconnectedAt > 60000)));
      setHidden(bnOkDot, !reconn);
      std::string line = S::BANNER_RECONNECTED;
      if (lost) {
        const double since = s.disconnectedAt ? (m.now - *s.disconnectedAt) / 1000.0 : 0.0;
        line = dropped                        ? std::string(S::BANNER_LOST_NOT_SENT)
               : m.ble == WC_BLE_NEEDS_REPAIR ? std::string(S::BANNER_REPAIR)
               : since > 60.0                 ? std::string(S::BANNER_LOST_CHECK)
                              : fmt(S::BANNER_LOST_SECS, static_cast<int>(std::max(0.0, since)));
      }
      setText(bnTitle, line);
    }
  }

  // ---------------------------------------------------------------- 전원 끄기 확인 / 끄는 중
  {
    const bool confirm = s.powerConfirmSince.has_value();
    setHidden(pcRoot, !confirm && !m.poweringOff);
    if (confirm || m.poweringOff) {
      for (lv_obj_t* o : {pcTitle, pcHint, pcBtn[0], pcBtn[1], pcKeys}) setHidden(o, m.poweringOff);
      setHidden(pcBye, !m.poweringOff);
      const int on = m.powerOnMs;
      const char* sec = on < 0 ? "2\xEC\xB4\x88" : on <= 128 ? "0.1\xEC\xB4\x88" : on <= 512 ? "0.5\xEC\xB4\x88"
                        : on <= 1000 ? "1\xEC\xB4\x88" : "2\xEC\xB4\x88";  // 'N초'(U+CD08)
      setText(pcHint, fmt(S::POWER_ON_HINT, sec));
    }
  }

  // ---------------------------------------------------------------- 설정
  if (m.settingsOpen) {
    const std::string vals[SETTINGS_ROWS] = {
        m.flick ? S::SETTINGS_ON : S::SETTINGS_OFF,
        m.airMouse ? S::SETTINGS_ON : S::SETTINGS_OFF,
        m.sensName,
        s.os == wc::OsId::Mac ? "macOS" : "Windows",
        m.raiseClock ? S::SETTINGS_ON : S::SETTINGS_OFF,
        m.imuRecording ? S::SETTINGS_RECORDING : S::SETTINGS_STOPPED,
        m.deviceName,
        m.fwVersion,
    };
    for (int i = 0; i < SETTINGS_ROWS; ++i) {
      setText(sVal[i], vals[i]);
      const bool sel = i == m.settingsRow;
      setBg(sRow[i], sel ? C_S2 : C_S1);
      setBorder(sRow[i], sel ? c.accent : C_BORDER, sel ? 2 : 1);
      // 감도는 에어마우스가 켜졌을 때만 의미가 있다 → 꺼져 있으면 흐리게
      const bool dim = i == kRowSens && !m.airMouse;
      setTextColor(sKey[i], dim ? C_TDIS : C_T2);
      setTextColor(sVal[i], dim ? C_TDIS : i == kRowImu && m.imuRecording ? C_DANGER : C_T1);
    }
    const bool closeSel = m.settingsRow == kRowClose;
    setBg(sClose, closeSel ? C_S3 : C_S2);
    setBorder(sClose, closeSel ? c.accent : C_BORDER, closeSel ? 2 : 1);
  }
  lvgl_port_unlock();
}

}  // namespace ui
