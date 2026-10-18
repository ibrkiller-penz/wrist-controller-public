# main 컴포넌트 — 진입점 + 코어 로직(firmware/logic, 시뮬레이션과 같은 C++17 코드) + 생성 헤더
file(GLOB WC_LOGIC_SRCS "${CMAKE_CURRENT_LIST_DIR}/../logic/src/*.cpp")
# 시계 화면 글꼴·아이콘(생성 파일, 커밋됨) — tools/gen_fonts.py(kr_20/24/28/32·num_128), tools/gen_icons.py(img_lock_28)
file(GLOB WC_FONT_SRCS "${CMAKE_CURRENT_LIST_DIR}/fonts/*.c")

idf_component_register(
  SRCS "main.cpp" "ui.cpp" "display_ui.c" "ble_hid.c" "imu_qmi8658.c" "pmu_axp2101.c" "rtc_pcf85063.c" ${WC_LOGIC_SRCS} ${WC_FONT_SRCS}
  INCLUDE_DIRS "." "generated" "../logic/include"
  # bt·esp_hid = NimBLE + BLE HID 장치(STEP3). 화면 BSP·LVGL 은 idf_component.yml 의존성이 자동으로 붙는다(STEP2)
  REQUIRES nvs_flash esp_timer esp_driver_gpio esp_driver_i2c esp_driver_usb_serial_jtag vfs bt esp_hid
)

# C++ 표준은 IDF 기본값(gnu++2b)을 따른다. 코어 로직은 C++17 이상이면 된다(호스트 테스트는 C++17 로 빌드).

# 펌웨어 버전: firmware/version.txt(CI 가 태그에서 만든다) → IDF PROJECT_VER → 설정 화면 표시용 매크로
idf_build_get_property(WC_PROJECT_VER PROJECT_VER)
target_compile_definitions(${COMPONENT_LIB} PRIVATE WC_FW_VERSION="${WC_PROJECT_VER}")

# generated/keymap_gen.h 는 저장소에 커밋해 둔다(CI 가 --check 로 최신인지 확인). 없으면 바로 멈춘다
if(NOT EXISTS "${CMAKE_CURRENT_LIST_DIR}/generated/strings_gen.h")
  message(FATAL_ERROR "main/generated/strings_gen.h 가 없습니다. 저장소 루트에서 python tools/gen_strings_header.py 를 실행하세요.")
endif()
if(NOT EXISTS "${CMAKE_CURRENT_LIST_DIR}/generated/keymap_gen.h")
  message(FATAL_ERROR "main/generated/keymap_gen.h 가 없습니다. 저장소 루트에서 python tools/gen_keymap_header.py 를 실행하세요.")
endif()
