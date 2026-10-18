// 자동 생성 파일 — 고치지 마세요. 원본: shared/strings.ko.json
// 다시 만들기: python tools/gen_strings_header.py   (CI 는 --check 로 최신인지 확인)
// 원본 해시(sha256 앞 12자리): 283d76094f0c
#pragma once

#define WC_STRINGS_GEN_HASH "283d76094f0c"

namespace wc::str {

inline constexpr const char* SCREEN_SETTINGS = "설정";
inline constexpr const char* SCREEN_NAME = "이름";
inline constexpr const char* SCREEN_WAITING = "연결 대기";
inline constexpr const char* CLOCK_DATE = "%d월 %d일";
inline constexpr const char* CLOCK_DOW0 = "일";
inline constexpr const char* CLOCK_DOW1 = "월";
inline constexpr const char* CLOCK_DOW2 = "화";
inline constexpr const char* CLOCK_DOW3 = "수";
inline constexpr const char* CLOCK_DOW4 = "목";
inline constexpr const char* CLOCK_DOW5 = "금";
inline constexpr const char* CLOCK_DOW6 = "토";
inline constexpr const char* CLOCK_UNSYNCED = "시각 동기화 전";
inline constexpr const char* CLOCK_FIRST_HINT = "밀어서 모드 전환";
inline constexpr const char* PRESENT_PRE = "쇼 시작 전";
inline constexpr const char* PRESENT_RUN = "쇼 진행 중";
inline constexpr const char* PRESENT_ENDED = "쇼 끝남";
inline constexpr const char* PRESENT_LOCKED = "잠금";
inline constexpr const char* PRESENT_START_HINT = "위에서 당겨 쇼 시작";
inline constexpr const char* PRESENT_BLACK_CHIP = "암전 중";
inline constexpr const char* PRESENT_HINT_PREV = "‹ %s";
inline constexpr const char* PRESENT_HINT_NEXT = "%s ›";
inline constexpr const char* PRESENT_HINT_HOLD = "길게 · %s";
inline constexpr const char* PRESENT_HINT_RESUME = "길게 · 복귀";
inline constexpr const char* PRESENT_AIR_LABEL = "포인터";
inline constexpr const char* PRESENT_AIR_HELP = "화면 탭 = 클릭";
inline constexpr const char* SHEET_TITLE = "슬라이드 쇼";
inline constexpr const char* SHEET_SETTINGS = "설정";
inline constexpr const char* SHEET_SETTINGS_SUB = "감도 · 컴퓨터 · 이름";
inline constexpr const char* LAUNCH_TAB_APPS = "앱";
inline constexpr const char* LAUNCH_TAB_WORK = "업무";
inline constexpr const char* LAUNCH_NEED_URL = "주소 필요";
inline constexpr const char* LAUNCH_NO_MAC = "Mac 없음";
inline constexpr const char* LAUNCH_NO_KEY = "키 없음";
inline constexpr const char* MEETING_ON = "켜짐";
inline constexpr const char* MEETING_OFF = "꺼짐";
inline constexpr const char* MEETING_UNKNOWN = "모름";
inline constexpr const char* MEETING_UP = "올림";
inline constexpr const char* MEETING_DOWN = "내림";
inline constexpr const char* MEETING_NO_KEY = "키 없음";
inline constexpr const char* MEETING_LABEL_STATE = "%s %s";
inline constexpr const char* MEETING_ESTIMATED = "추정";
inline constexpr const char* MEETING_SYNC_HINT = "다르면 길게 눌러 맞추기";
inline constexpr const char* MEETING_UNKNOWN_HINT = "상태 모름 · 길게 눌러 맞추기";
inline constexpr const char* SETTINGS_FLICK = "손목 튕김";
inline constexpr const char* SETTINGS_AIR = "에어마우스";
inline constexpr const char* SETTINGS_SENS = "감도";
inline constexpr const char* SETTINGS_OS = "컴퓨터";
inline constexpr const char* SETTINGS_RAISE = "손목 들면 시계";
inline constexpr const char* SETTINGS_IMU = "IMU 녹화";
inline constexpr const char* SETTINGS_NAME = "블루투스 이름";
inline constexpr const char* SETTINGS_VERSION = "버전";
inline constexpr const char* SETTINGS_CLOSE = "닫기";
inline constexpr const char* SETTINGS_ON = "켜짐";
inline constexpr const char* SETTINGS_OFF = "꺼짐";
inline constexpr const char* SETTINGS_RECORDING = "녹화 중";
inline constexpr const char* SETTINGS_STOPPED = "멈춤";
inline constexpr const char* SETTINGS_FOOTER = "줄 탭 = 바꾸기 · 위로 밀면 닫기";
inline constexpr const char* SETTINGS_SENS_SECTION = "에어마우스 감도";
inline constexpr const char* SETTINGS_SENS_DESC = "포인터 속도 · 바로 적용";
inline constexpr const char* SETTINGS_OS_SECTION = "컴퓨터 종류";
inline constexpr const char* SETTINGS_OS_DESC = "보내는 단축키가 바뀜";
inline constexpr const char* SETTINGS_FW_SECTION = "펌웨어";
inline constexpr const char* SETTINGS_SIM_BUILD = "시뮬레이터 빌드 · 실제 펌웨어 아님";
inline constexpr const char* SETTINGS_APPLYING = "적용 중…";
inline constexpr const char* SETTINGS_CANCEL = "취소";
inline constexpr const char* SETTINGS_RENAME_TITLE = "이름을 바꿀까요?";
inline constexpr const char* SETTINGS_RENAME_DESC = "연결이 끊기고, PC의 블루투스 설정에서 다시 페어링해야 할 수 있습니다.";
inline constexpr const char* SETTINGS_RENAME_OK = "바꾸기";
inline constexpr const char* SETTINGS_CHECK = "✓";
inline constexpr const char* SETTINGS_ARROW = "›";
inline constexpr const char* PAIR_GUIDE = "이 이름을 PC에서 찾으세요";
inline constexpr const char* PAIR_STEP1 = "PC 설정 › 블루투스 및 기기";
inline constexpr const char* PAIR_STEP2 = "기기 추가 › 블루투스";
inline constexpr const char* PAIR_STEP3 = "위 이름을 누르세요";
inline constexpr const char* PAIR_TIP = "안 보이면 PC 목록에서 이전 기기를 삭제";
inline constexpr const char* PAIR_CONNECTING = "PC와 연결하는 중…";
inline constexpr const char* PAIR_REPAIR = "PC에서 이 장치를 제거하고 다시 추가하세요";
inline constexpr const char* PAIR_RESTARTING = "블루투스를 다시 켜는 중…";
inline constexpr const char* BANNER_LOST = "연결 끊김";
inline constexpr const char* BANNER_SEARCHING = "찾는 중 %d초";
inline constexpr const char* BANNER_CHECK_PC = "PC 블루투스 확인";
inline constexpr const char* BANNER_NOT_SENT = "보내지 못함";
inline constexpr const char* BANNER_RECONNECTED = "연결됨";
inline constexpr const char* BANNER_LOST_SECS = "연결 끊김 · %d초";
inline constexpr const char* BANNER_LOST_CHECK = "연결 끊김 · PC 블루투스 확인";
inline constexpr const char* BANNER_LOST_NOT_SENT = "연결 끊김 · 보내지 못함";
inline constexpr const char* BANNER_REPAIR = "PC에서 장치 제거 후 다시 추가";
inline constexpr const char* TOAST_LOCKED = "제스처 잠김";
inline constexpr const char* TOAST_UNLOCKED = "제스처 풀림";
inline constexpr const char* TOAST_CONNECTED = "연결됨";
inline constexpr const char* TOAST_ESTIMATE_ONLY = "표시만 바꿈 · 키 안 보냄";
inline constexpr const char* TOAST_APP_CHANGED_RO = "%s로 바꿈";
inline constexpr const char* TOAST_APP_CHANGED_EURO = "%s으로 바꿈";
inline constexpr const char* TOAST_MEETING_HINT = "회의 창을 앞에 두세요";
inline constexpr const char* TOAST_RENAMED = "이름 바뀜 · 다시 페어링";

// 블루투스 이름 후보(설정 '블루투스 이름' — 뒤에 공백 + MAC 끝 4자리를 붙인다)
inline constexpr int NAME_CANDIDATE_COUNT = 3;
inline constexpr const char* NAME_CANDIDATES[] = {"손목 컨트롤러", "수업 리모컨", "WristCtrl"};

}  // namespace wc::str
