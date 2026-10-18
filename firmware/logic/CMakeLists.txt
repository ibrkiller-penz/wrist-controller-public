# 손목 컨트롤러 코어 로직(C++17, 하드웨어 의존 없음) — 호스트 테스트용 정적 라이브러리.
# 시계 펌웨어(ESP-IDF)는 이 CMakeLists 를 쓰지 않고 main/CMakeLists.txt 가 src/*.cpp 를 직접 묶는다.
cmake_minimum_required(VERSION 3.16)

add_library(wc_logic STATIC
  src/names.cpp
  src/imu.cpp
  src/airmouse.cpp
  src/gesture.cpp
  src/keymap.cpp
  src/layout.cpp
  src/mode_machine.cpp
  src/touch_gesture.cpp
)
target_include_directories(wc_logic PUBLIC ${CMAKE_CURRENT_LIST_DIR}/include)
target_compile_features(wc_logic PUBLIC cxx_std_17)
if(MSVC)
  target_compile_options(wc_logic PRIVATE /W4 /utf-8)
else()
  target_compile_options(wc_logic PRIVATE -Wall -Wextra -Wpedantic)
endif()
