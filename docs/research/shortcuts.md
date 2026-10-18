# 대상 앱 단축키 검증 보고서 (자료조사팀 2번)

조사일: 2026-10-16 · 기준 문서: `손목컨트롤러_작업지시서.md`
원칙: 모든 사실에 공식 출처 URL을 단다. 공식 문서로 확인하지 못한 내용은 **미확인**으로 표시한다.

---

## 1. 요약 — 작업지시서와 달라지는 점

| # | 항목 | 작업지시서 | 검증 결과 | 정정안 |
| --- | --- | --- | --- | --- |
| 1 | PowerPoint 쇼 시작 (macOS) | F5 | macOS 공식 키는 **⌘+Shift+Return**(처음부터), **⌘+Return**(현재 슬라이드). F5는 macOS 표에 없음 | mac 키를 `Cmd+Shift+Enter`로 분리 |
| 2 | Google Slides 쇼 시작 (Win) | F5 | Windows는 **Ctrl+F5**, Mac은 **⌘+Enter**(현재) / **⌘+Shift+Enter**(처음부터) | 발표 모드의 "쇼 시작"을 앱별로 분리 (PowerPoint/Slides) |
| 3 | Zoom (macOS) | 표에 Windows 키만 있음 | macOS: 마이크 **⌘+Shift+A**, 비디오 **⌘+Shift+V**, 손들기 **Option+Y** | keymap에 mac 키 추가 |
| 4 | Teams (macOS) | 표에 Windows 키만 있음 | macOS: **⌘+Shift+M / ⌘+Shift+O / ⌘+Shift+K** | keymap에 mac 키 추가 |
| 5 | Google Meet (macOS) | 표에 Windows 키만 있음 | macOS: 마이크 **⌘+D**, 카메라 **⌘+E**, 손들기 **Ctrl+⌘+H** (Option 아님) | keymap에 mac 키 추가 |
| 6 | Teams 웹앱 | 구분 없음 | 공식 표에 Windows 웹앱의 비디오 토글은 "단축키 없음" | Teams는 **데스크톱 앱 전제**로 명시 |
| 7 | Slides/Meet 단축키 충돌 | 언급 없음 | Chrome에서 Ctrl+F5 = 주소창 이동, Ctrl+D = 북마크, Ctrl+E = 검색 | 해당 탭에 포커스가 있을 때만 의도대로 동작함을 UI/문서에 경고 |
| 8 | 암전 B | B | B 외에 **마침표(.)** 도 PowerPoint·Slides 공통 검은 화면 키 | 한글 IME 문제 회피용으로 `.`을 기본값으로 검토 (4장 참조) |

나머지(PowerPoint 다음/이전/B/Esc, VS Code 6개 키, Zoom·Teams·Meet의 Windows 키)는 작업지시서와 **일치**한다.

---

## 2. 앱별 검증 결과

### 2.1 PowerPoint (슬라이드 쇼 중)

출처: Microsoft 지원 — <https://support.microsoft.com/en-us/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0>

| 기능 | Windows | macOS | 지시서 대비 |
| --- | --- | --- | --- |
| 처음부터 쇼 시작 | F5 | ⌘+Shift+Return | mac 다름 |
| 현재 슬라이드부터 시작 | Shift+F5 | ⌘+Return | 참고 |
| 다음 슬라이드 | →, N, Enter, PageDown, ↓, Space | →, N, PageDown, ↓, Space | 일치 |
| 이전 슬라이드 | ←, P, PageUp, ↑, Backspace | ←, P, PageUp, ↑, Delete | 일치 |
| 검은 화면 / 복귀 | B 또는 마침표(.) | B, Shift+B 또는 마침표(.) | 일치 (+ `.` 대안) |
| 흰 화면 / 복귀 | W 또는 쉼표(,) | W, Shift+W 또는 쉼표(,) | 참고 |
| 쇼 종료 | Esc | Esc, 하이픈(-), ⌘+마침표 | 일치 |

### 2.2 Google Slides (발표 중)

출처: Google Docs 편집기 도움말 — Google Slides 단축키 <https://support.google.com/docs/answer/1696717?hl=en>

| 기능 | Windows / ChromeOS | macOS | 지시서 대비 |
| --- | --- | --- | --- |
| 발표 시작 | Ctrl+F5 | ⌘+Enter (현재 슬라이드) | 지시서 F5 → 정정 |
| 처음부터 발표 | 공식 표에 별도 키 없음 (**미확인**: Ctrl+Shift+F5) | ⌘+Shift+Enter | — |
| 다음 슬라이드 | → | → | 일치 |
| 이전 슬라이드 | ← | ← | 일치 |
| 검은 화면 | **b 또는 .** (지원함) | b 또는 . | B 지원 확인 |
| 흰 화면 | w 또는 , | w 또는 , | 참고 |
| 발표 종료 | Esc | Esc | 일치 |

주의: Windows Chrome에서 **Ctrl+F5는 "주소창으로 커서 이동"**, Shift+F5는 "캐시 무시 새로고침"이다(출처: Chrome 단축키 <https://support.google.com/chrome/answer/157179?hl=en&co=GENIE.Platform%3DDesktop>). Slides 편집 화면이 포커스를 갖고 있지 않으면 Chrome 동작이 실행될 수 있다.

### 2.3 VS Code

출처: VS Code 기본 키 바인딩 <https://code.visualstudio.com/docs/reference/default-keybindings>

| 기능 | Windows/Linux | macOS | 명령 ID | 지시서 대비 |
| --- | --- | --- | --- | --- |
| 저장 | Ctrl+S | ⌘S | `workbench.action.files.save` | 일치 |
| 명령 팔레트 | Ctrl+Shift+P (또는 F1) | ⇧⌘P (또는 F1) | `workbench.action.showCommands` | 일치 |
| 터미널 토글 | Ctrl+` | **⌃`** (Control, Cmd 아님) | `workbench.action.terminal.toggleTerminal` | 일치 |
| 디버그 시작 | F5 | F5 | `workbench.action.debug.start` | 일치 |
| 줄 주석 토글 | Ctrl+/ | ⌘/ | `editor.action.commentLine` | 일치 |
| 실행 취소 | Ctrl+Z | ⌘Z | `undo` | 일치 |

- 명령 팔레트는 **F1**로도 열린다. 수정자 없는 단일 키라 HID 전송이 가장 단순하고 레이아웃 영향이 없으므로 대체 키로 쓸 만하다.
- VS Code 문서: 표시된 키는 **미국 표준 레이아웃 기준**이며, 키는 문자 대신 가상 키를 뜻한다. 스캔 코드 바인딩(`[Slash]`, `[Backquote]` 등)으로 레이아웃과 무관한 단축키를 정의할 수 있다(출처: <https://code.visualstudio.com/docs/configure/keybindings>).

### 2.4 Zoom (데스크톱 앱)

출처: Zoom 지원 — 단축키 <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067050>

| 기능 | Windows | macOS | 지시서 대비 |
| --- | --- | --- | --- |
| 마이크 켜기·끄기 | Alt+A | ⌘+Shift+A | Win 일치 |
| 비디오 켜기·끄기 | Alt+V | ⌘+Shift+V | Win 일치 |
| 손 들기·내리기 | Alt+Y | **Option+Y** | Win 일치 |

- 일부 단축키는 설정에서 **전역(global)** 으로 켜면 Zoom이 활성 창이 아니어도 동작한다(같은 출처). 발표 중 PowerPoint가 앞에 있을 때 회의 모드를 쓰려면 사용자에게 "Zoom 설정 → 키보드 단축키 → 전역 사용" 체크를 안내해야 한다.
- macOS에서는 Space를 누르고 있는 동안 일시 음소거 해제가 된다(같은 출처). Windows 쪽 동일 기능은 공식 표에서 확인하지 못함(**미확인**).

### 2.5 Microsoft Teams

출처: Microsoft 지원 — Teams 단축키 <https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-microsoft-teams-2e8e2a70-e8d8-4a19-949b-4c36dd5292d2>

| 기능 | Windows (데스크톱) | macOS | 지시서 대비 |
| --- | --- | --- | --- |
| 음소거 토글 | Ctrl+Shift+M | ⌘+Shift+M | 일치 |
| 비디오 토글 | Ctrl+Shift+O | ⌘+Shift+O | 일치 |
| 손 들기·내리기 | Ctrl+Shift+K | ⌘+Shift+K | 일치 |

- Windows **웹앱**에서는 비디오 토글이 "단축키 없음"으로 표기되어 있다(같은 출처). 회의 모드는 Teams 데스크톱 앱을 전제로 한다.
- 참고: Windows 11은 **Win+Alt+K** 로 "지원되는 앱에서 마이크 음소거/해제"를 제공한다(출처: Windows 단축키 <https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec>). 어떤 앱이 "지원 앱"인지는 문서에 없음(**미확인**: Teams 지원은 알려져 있으나 공식 목록 미확인). 포커스와 무관하게 동작할 가능성이 있어 회의 모드 보조 키 후보.

### 2.6 Google Meet (브라우저)

출처: Google Workspace 학습 센터 — Meet 단축키 <https://support.google.com/a/users/answer/9896256?hl=en> (Android 판 페이지가 열렸으나 키 값은 데스크톱과 동일하게 표기), 보조: Meet 화면 낭독기 가이드 <https://support.google.com/meet/answer/15738543>

| 기능 | Windows / ChromeOS | macOS | 지시서 대비 |
| --- | --- | --- | --- |
| 마이크 켜기·끄기 | Ctrl+D | ⌘+D | 일치 |
| 카메라 켜기·끄기 | Ctrl+E | ⌘+E | 일치 |
| 손 들기·내리기 | Ctrl+Alt+H | **Ctrl+⌘+H** | Win 일치 |

- 일부 제3자 사이트는 mac 손들기를 ⌘+Option+H로 적지만 Google 공식 페이지는 **Ctrl+⌘+H** 다. 공식을 따른다.
- 회의 중 Shift+? 로 전체 목록을 볼 수 있다고 안내됨(위 Workspace 페이지, 검색 요약 기준 — 원문 직접 대조는 **미확인**).
- 주의: Chrome에서 **Ctrl+D = 북마크 저장, Ctrl+E = 검색**(Chrome 단축키 출처 동일). Meet 탭이 포커스를 잃으면 북마크 대화상자가 뜰 수 있다.

---

## 3. 검증된 키 표 (`/shared/keymap.json` 입력용)

표기 규칙: 수정자는 `Ctrl`, `Shift`, `Alt`(mac은 Option), `Cmd`(Win에서는 GUI=Win 키). 키 이름은 HID 키보드 페이지(0x07) 기준 영문 이름. 출처 약어는 표 아래 참조.

| 앱 | 기능 | win 키 | mac 키 | 출처 |
| --- | --- | --- | --- | --- |
| PowerPoint | 다음 슬라이드 | Right | Right | PPT |
| PowerPoint | 이전 슬라이드 | Left | Left | PPT |
| PowerPoint | 검은 화면 토글 | B (대안 Period) | B (대안 Period) | PPT |
| PowerPoint | 쇼 시작(처음부터) | F5 | Cmd+Shift+Enter | PPT |
| PowerPoint | 쇼 시작(현재 슬라이드) | Shift+F5 | Cmd+Enter | PPT |
| PowerPoint | 쇼 종료 | Escape | Escape | PPT |
| Google Slides | 다음 슬라이드 | Right | Right | GSL |
| Google Slides | 이전 슬라이드 | Left | Left | GSL |
| Google Slides | 검은 화면 토글 | B (대안 Period) | B (대안 Period) | GSL |
| Google Slides | 발표 시작 | Ctrl+F5 | Cmd+Enter | GSL |
| Google Slides | 처음부터 발표 | 미확인 | Cmd+Shift+Enter | GSL |
| Google Slides | 발표 종료 | Escape | Escape | GSL |
| VS Code | 저장 | Ctrl+S | Cmd+S | VSC |
| VS Code | 명령 팔레트 | Ctrl+Shift+P (대안 F1) | Cmd+Shift+P (대안 F1) | VSC |
| VS Code | 터미널 토글 | Ctrl+Grave | Ctrl+Grave | VSC |
| VS Code | 디버그 시작 | F5 | F5 | VSC |
| VS Code | 줄 주석 토글 | Ctrl+Slash | Cmd+Slash | VSC |
| VS Code | 실행 취소 | Ctrl+Z | Cmd+Z | VSC |
| Zoom | 마이크 토글 | Alt+A | Cmd+Shift+A | ZM |
| Zoom | 비디오 토글 | Alt+V | Cmd+Shift+V | ZM |
| Zoom | 손 들기·내리기 | Alt+Y | Alt+Y (Option+Y) | ZM |
| Teams | 마이크 토글 | Ctrl+Shift+M | Cmd+Shift+M | TMS |
| Teams | 카메라 토글 | Ctrl+Shift+O | Cmd+Shift+O | TMS |
| Teams | 손 들기·내리기 | Ctrl+Shift+K | Cmd+Shift+K | TMS |
| Google Meet | 마이크 토글 | Ctrl+D | Cmd+D | GMT |
| Google Meet | 카메라 토글 | Ctrl+E | Cmd+E | GMT |
| Google Meet | 손 들기·내리기 | Ctrl+Alt+H | Ctrl+Cmd+H | GMT |
| (Windows 공통) | 지원 앱 마이크 음소거 | Win+Alt+K | 해당 없음 | WIN |

출처 약어:
- PPT: <https://support.microsoft.com/en-us/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0>
- GSL: <https://support.google.com/docs/answer/1696717?hl=en>
- VSC: <https://code.visualstudio.com/docs/reference/default-keybindings>
- ZM: <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0067050>
- TMS: <https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-microsoft-teams-2e8e2a70-e8d8-4a19-949b-4c36dd5292d2>
- GMT: <https://support.google.com/a/users/answer/9896256?hl=en>
- WIN: <https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec>

### 3.1 키 이름 → HID 사용 코드 (키보드 페이지 0x07)

출처: USB HID Usage Tables 1.5 <https://usb.org/sites/default/files/hut1_5.pdf> (10장 Keyboard/Keypad Page). 0x35·0x90·0x91은 PDF 원문에서 직접 확인했고, 나머지는 같은 표의 표준 값이다(원문 행 직접 대조는 0x35/0x90/0x91만 수행 — 나머지는 펌웨어팀이 구현 시 한 번 더 대조 권장).

| 키 | 사용 코드 | 키 | 사용 코드 |
| --- | --- | --- | --- |
| A | 0x04 | Enter | 0x28 |
| B | 0x05 | Escape | 0x29 |
| D | 0x07 | Space | 0x2C |
| E | 0x08 | Grave(`) | **0x35** |
| H | 0x0B | Period(.) | 0x37 |
| K | 0x0E | Slash(/) | 0x38 |
| M | 0x10 | F1 | 0x3A |
| O | 0x12 | F5 | 0x3E |
| P | 0x13 | Right | 0x4F |
| S | 0x16 | Left | 0x50 |
| V | 0x19 | LANG1(한/영) | **0x90** |
| Y | 0x1C | LANG2(한자) | **0x91** |
| Z | 0x1D | 수정자 | 보고서 1바이트 비트맵 (LCtrl·LShift·LAlt·LGUI = 비트0~3) |

---

## 4. HID 관점 주의점

### 4.1 HID는 "글자"가 아니라 "키 위치"를 보낸다
- HID 키보드는 사용 코드(물리 키 위치)를 보내고, 문자는 PC의 키보드 레이아웃이 결정한다. HUT 문서는 0x35(Grave Accent and Tilde)에 "호스트에서 다른 언어용으로 재매핑되는 경우가 많다"는 각주를 단다(출처: HUT 1.5, 위 URL).
- **한국어 Windows 레이아웃(103/106키)** 에서 ` 키는 미국 배열과 같은 위치이므로 0x35를 보내면 Ctrl+` 가 그대로 동작할 것으로 본다(**미확인** — 실제 한국어 Windows에서 VS Code 터미널 토글 실측 필요).
- **macOS 한국어 입력기(2벌식)** 에서는 ` 위치에서 ₩가 입력되는 것으로 알려져 있다(**미확인**). VS Code는 단축키를 가상 키/레이아웃 기준으로 해석하므로, 문제가 생기면 사용자 `keybindings.json`에 스캔 코드 바인딩 `ctrl+[Backquote]`를 추가하는 방법이 있다(VS Code 문서의 스캔 코드 바인딩 기능, 출처: <https://code.visualstudio.com/docs/configure/keybindings>). 다만 "PC에 프로그램 설치 없음" 원칙상 설정 변경도 최소화하므로, 대안으로 **명령 팔레트 → "Toggle Terminal"** 흐름을 시계 매크로로 두는 방법도 고려.

### 4.2 한글 입력 상태(IME)와 단일 문자 키 (B, N, P 등)
- 브라우저에서 IME 조합 중인 keydown은 `keyCode` 229(`isComposing`)로 전달된다(출처: MDN <https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event>). 따라서 **Google Slides 발표 중 Windows 입력기가 '한글' 상태이면 `b`가 'ㅠ' 조합으로 처리되어 검은 화면이 동작하지 않을 수 있다**(**미확인** — 실측 필요).
- PowerPoint 데스크톱 슬라이드 쇼에서 한글 상태일 때 B 키 동작은 공식 자료를 찾지 못함(**미확인**).
- 대책 후보:
  1. 검은 화면 기본 키를 **마침표(.)** 로 한다. 두 앱 모두 공식 지원하며, 마침표는 한글 조합을 시작하지 않는다(조합 미시작 여부는 **미확인**, 실측 권장).
  2. 다음/이전은 문자 키(N/P) 대신 **화살표 키**만 쓴다(현재 지시서도 화살표 — 유지).
  3. 시계에서 LANG1(0x90)을 보내 한/영 전환을 하는 방식은 현재 상태를 알 수 없어(토글) **권장하지 않음**.

### 4.3 Alt 조합과 메뉴 포커스 (Windows)
- Windows에서 Alt를 누른 채 다른 키를 누르면 `WM_SYSKEYDOWN`이 발생하고, F10은 메뉴 막대를 활성화한다(출처: <https://learn.microsoft.com/en-us/windows/win32/inputdev/wm-syskeydown>, Windows 단축키 F10 "활성 창의 메뉴 막대 활성화").
- **Alt만 단독으로 눌렀다 떼면** 메뉴 막대에 포커스가 가는 것은 Windows의 일반적인 동작이나, 공식 문서 문구로는 확인 못함(**미확인**). BLE 보고서가 다음 순서로 깨지면 문제가 된다.
  - Alt 눌림 보고서 → (A 키 보고서 유실) → Alt 뗌 보고서 ⇒ 호스트에는 "Alt 단독 탭"으로 보여 메뉴 포커스 이동, 이후 화살표 키가 메뉴를 움직임.
- 펌웨어 권장 사항:
  1. 수정자와 키를 **같은 보고서**에 실어 보낸다: `[수정자+키]` → `[수정자만]` → `[모두 0]`. 또는 `[수정자만]` 단계를 생략하고 `[수정자+키]` → `[모두 0]` 두 보고서로 보낸다.
  2. 재연결·모드 전환·오류 시 항상 **빈 보고서(모든 키 뗌)** 를 먼저 보내 "붙은 수정자(stuck modifier)"를 없앤다.
  3. 각 보고서 사이 최소 간격(예: 10ms)을 두어 호스트가 순서를 놓치지 않게 한다(간격 수치는 **미확인**, 실측으로 정함).
- Zoom의 Alt+A/V/Y는 Zoom 창(또는 전역 설정)에서만 의미가 있다. 포커스가 다른 앱이면 그 앱의 Alt 메뉴 액셀러레이터(예: Office 리본 키팁)가 반응할 수 있다.

### 4.4 포커스 의존성
- Zoom(전역 설정 제외), Teams, Meet, Slides 단축키는 **해당 창이 포커스일 때만** 동작한다. 시계 UI에 "대상 앱 창을 앞에 두세요" 안내 필요.
- 포커스를 잃은 브라우저에서 Ctrl+D(북마크), Ctrl+E(검색), Ctrl+F5(주소창)처럼 **다른 동작**이 일어날 수 있다(Chrome 단축키 출처).

### 4.5 macOS 관련
- macOS에서 Cmd는 HID의 GUI(0xE3 LeftGUI) 수정자, Option은 Alt(0xE2) 수정자로 보낸다(HUT 표준 값, 원문 행 대조 **미확인**).
- F5를 HID로 보낼 때 macOS가 이를 밝기·미디어 키로 바꾸는지는 Apple 키보드의 fn 설정 대상이지 외부 HID 장치에는 해당하지 않는 것으로 알려져 있음(**미확인** — 맥에서 PowerPoint/VS Code F5 실측 필요). PowerPoint mac은 어차피 Cmd+Shift+Enter를 쓰므로 영향은 VS Code 디버그뿐.

### 4.6 한/영·한자 키
- HUT 1.5 각주: 0x90(LANG1) = 한/영 전환 키, 0x91(LANG2) = 한자 변환 키, 한국어 키보드의 IME 제어 키로 쓰임(출처: HUT 1.5 PDF, 96쪽 각주 24·25에서 직접 확인).

---

## 5. 실측 필요 목록 (2단계에서 확인)

1. 한국어 Windows + 한글 입력 상태에서 PowerPoint·Slides의 `B`와 `.` 검은 화면 동작
2. 한국어 Windows에서 VS Code `Ctrl+`` (0x35) 터미널 토글
3. macOS 한국어 입력기에서 `Ctrl+`` 동작
4. Google Slides Windows "처음부터 발표" 키 존재 여부
5. Zoom 전역 단축키 설정 시 PowerPoint 포커스 상태에서 Alt+A 동작, 그리고 메뉴 포커스 부작용 여부
6. Win+Alt+K 가 Teams·Zoom에서 동작하는지
