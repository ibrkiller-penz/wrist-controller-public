// 시계 화면 글꼴·아이콘 선언 — 생성 파일(tools/gen_fonts.py, tools/gen_icons.py). design/v2/README.md 1.2
//   kr_20  Pretendard Medium 20  (4bpp 압축)   힌트·키 표기·상태줄 시각·배터리 %
//   kr_24  Pretendard SemiBold 24 (압축)       상태줄 모드 이름·상태 줄·칩·배지·보조 줄
//   kr_28  Pretendard Bold 28    (압축)        타일 라벨·날짜·요일 칩·암전 칩·시트 제목·행 제목·배너 제목
//   kr_32  Pretendard Bold 32    (압축)        회의 마이크 상태·작은 타일 라벨·페어링 이름
//   num_128 Pretendard SemiBold 128 (비압축, '0-9 : -')  시계 HH:MM·발표 MM:SS
//   kr_* 의 fallback = lv_font_montserrat_20(LV_SYMBOL_* 기호). 큰 기호·끝자리 칩은 lv_font_montserrat_48.
//   img_lock_28  A8 자물쇠 28×28(LVGL 기호에 자물쇠가 없다) — style image_recolor 색으로 그린다
#pragma once

#include "lvgl.h"

#ifdef __cplusplus
extern "C" {
#endif

extern const lv_font_t kr_20;
extern const lv_font_t kr_24;
extern const lv_font_t kr_28;
extern const lv_font_t kr_32;
extern const lv_font_t num_128;
extern const lv_image_dsc_t img_lock_28;

#ifdef __cplusplus
}
#endif
