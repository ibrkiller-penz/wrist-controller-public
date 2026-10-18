# 펌웨어 로직 호스트 테스트 (PC 에서 빌드·실행, 하드웨어 불필요)
#
#   cmake -S firmware/test -B build/fwtest -DCMAKE_BUILD_TYPE=Debug
#   cmake --build build/fwtest
#   ctest --test-dir build/fwtest --output-on-failure
#
# /shared/test-vectors/*.json 을 firmware/logic(C++17)에 돌려 sim(TS)과 같은 출력을 내는지 확인한다.
# JSON 은 nlohmann/json 단일 헤더를 FetchContent 로 받아 쓴다(테스트 전용 — 시계 펌웨어에는 들어가지 않는다).
cmake_minimum_required(VERSION 3.16)
project(wrist_controller_logic_tests LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
# 버전 고정. 이미 받아 둔 사본이 있으면 -DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=<경로> 로 넘긴다(오프라인 빌드).
FetchContent_Declare(
  nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  # TODO(확인 필요): 첫 CI 실행 로그에서 받은 파일의 SHA256 을 확인한 뒤 URL_HASH SHA256=<값> 을 더해 고정한다.
)
FetchContent_MakeAvailable(nlohmann_json)

set(WC_ROOT ${CMAKE_CURRENT_LIST_DIR}/../..)

add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../logic ${CMAKE_CURRENT_BINARY_DIR}/logic)

add_executable(wc_vector_tests
  test_vectors.cpp
  json_bridge.cpp
)
target_include_directories(wc_vector_tests PRIVATE
  ${CMAKE_CURRENT_LIST_DIR}
  ${CMAKE_CURRENT_LIST_DIR}/../main/generated   # keymap_gen.h (tools/gen_keymap_header.py)
)
target_link_libraries(wc_vector_tests PRIVATE wc_logic nlohmann_json::nlohmann_json)
target_compile_definitions(wc_vector_tests PRIVATE WC_SHARED_DIR="${WC_ROOT}/shared")
if(MSVC)
  target_compile_options(wc_vector_tests PRIVATE /W4 /utf-8)
else()
  target_compile_options(wc_vector_tests PRIVATE -Wall -Wextra)
endif()

enable_testing()
add_test(NAME shared_test_vectors COMMAND wc_vector_tests ${WC_ROOT}/shared)

# 터치 제스처 판정(원시 터치 샘플 → tap/longPress/swipe → HID) — 2단계 5번
add_executable(wc_touch_tests test_touch.cpp)
target_include_directories(wc_touch_tests PRIVATE ${CMAKE_CURRENT_LIST_DIR}/../main/generated)
target_link_libraries(wc_touch_tests PRIVATE wc_logic)
if(MSVC)
  target_compile_options(wc_touch_tests PRIVATE /W4 /utf-8)
else()
  target_compile_options(wc_touch_tests PRIVATE -Wall -Wextra)
endif()
add_test(NAME touch_gesture COMMAND wc_touch_tests)
