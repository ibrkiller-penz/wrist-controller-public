# 손목 컨트롤러 펌웨어 — ESP-IDF 프로젝트 최상위 (ESP-IDF 5.5.x 기준, docs/research/firmware-stack.md 8장)
#
#   cd firmware
#   python ../tools/gen_keymap_header.py     # shared/*.json → main/generated/keymap_gen.h
#   idf.py set-target esp32c6
#   idf.py build
#
# 시계에 올리는 idf.py flash 는 2단계에서 사용자 확인을 받은 뒤에만 한다(작업지시서 규칙).
# 첫 업로드 전에는 원래 펌웨어 백업(README.md '원래 펌웨어 백업·복원')이 끝났는지 먼저 확인한다.
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(wrist_controller)
