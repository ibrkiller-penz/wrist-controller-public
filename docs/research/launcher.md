# 실행(런처) 모드 조사 — 손목 컨트롤러

작성 2026-10-17. 조사원 10명의 웹 조사 결과를 정리한 것이다. PC에는 아무것도 설치하지 않으므로 **시계가 보낼 수 있는 것은 키 입력(BLE HID 키보드·소비자 키)뿐**이라는 전제로 판단했다.
표시 규칙: **확인** = 출처 있음 / **제3자** = 팁·블로그 수준 출처 / **미확인** = 출처 없음, 월요일 실기로 확정해야 함.
서로 다른 결과가 나오면 더 공식적인 출처를 따랐고, 해당 자리에 `[충돌]`로 적었다.

범위를 줄였다("뺄 것은 뺀다"). 맨 아래 6장에 뺀 항목과 이유를 적었다.

---

## 1. 결론: 타일 배치

### 1쪽 — 앱 실행 (2×3, 사용자 후보 그대로)

| 칸 | 타일 | 근거 |
|---|---|---|
| 1 | Claude (데스크톱 앱) | 사용자 지정. 공식 딥링크 `claude://` 있음 (아래 2장) |
| 2 | 카카오톡 | 사용자 지정. 교사 업무 연락용 |
| 3 | 크롬 | 사용자 지정. 웹 업무(업무포털·나이스 등) 진입점 |
| 4 | 파워포인트 | 사용자 지정. 발표 모드와 바로 이어짐 |
| 5 | 엑셀 | 사용자 지정 |
| 6 | 한글(한컴오피스) | 사용자 지정. 공문·학교 문서 표준 |

- 스트림덱 사용자에게 가장 흔한 구성이 "버튼 하나에 앱 하나"다. 사용 빈도 통계는 없어서 순위 자체는 **미확인**이지만, 한국어 후기와 매크로 예제 모두 앱 실행이 첫 번째로 나온다. 출처: https://www.clien.net/service/board/lecture/18153916 , https://wikidocs.net/blog/@taskautolab/5224/
- 6개 앱별로 "한국 사용자가 많이 쓴다"는 통계 근거는 찾지 못했다(**미확인**). 사용자 선택을 그대로 둔다.

### 2쪽 — 업무 단축 (2×3, 추천)

| 칸 | 타일 | Windows 키 | macOS 키 | 확인 | 출처 |
|---|---|---|---|---|---|
| 1 | 영역 캡처 | Win+Shift+S (클립보드로 복사) | Cmd+Shift+5 (캡처 패널) | 확인 | https://pureinfotech.com/windows-11-take-screenshot/ , https://support.apple.com/en-us/102650 |
| 2 | 화면 잠금 | Win+L | Control+Cmd+Q | 확인 | https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec , https://support.apple.com/en-us/102650 |
| 3 | 바탕화면 보기 | Win+D (토글) | 미확인 | 확인(Win) | 위 MS 지원 페이지 |
| 4 | 화면 출력 전환 (복제/확장) | Win+P (메뉴만 열림) | 없음 → 비활성 | 확인(Win) | 위 MS 지원 페이지 |
| 5 | 음소거 | 소비자 키 MUTE (0x00E2) | 같은 소비자 키 | 미확인 (HID 코드는 `shared/hid-usage.json`에 있음, 두 OS의 반응은 실기 확인) | — |
| 6 | 업무포털 열기 | 크롬으로 사용자가 정한 주소 열기 (2.3절) | 같은 방식 | 방식만 제안. 주소는 교육청마다 달라 설정값 | — |

- 교사용 웹 서비스(나이스, K-에듀파인, 업무포털)는 공동인증서 등으로 로그인한다는 보도가 있어서 **로그인은 자동화하지 않는다**. 타일은 "로그인 화면까지 열기"만 한다. 출처: https://www.nocutnews.co.kr/news/6406942
- 다른 후보: 화면 확대 Win++ / Win+- / Win+Esc (확인, https://support.microsoft.com/en-us/accessibility/windows/magnifier/magnifier-keyboard-shortcuts-and-touch-gestures). 수업 중 화면을 확대해 보여 줄 일이 많으면 4번(Win+P)과 바꾼다.

---

## 2. 실행 방식 (Windows 1순위, macOS 2순위)

### 2.1 방식 비교와 결론

| 방식 | 키 시퀀스 | IME(한/영) 영향 | 신뢰도 | 출처 |
|---|---|---|---|---|
| **A. Win+숫자 (작업표시줄 고정 순서)** | Win+1 … Win+9, Win+0(10번째) | **없음** (글자를 치지 않음) | 높음. 앱 위치가 바뀌면 다른 앱이 뜸 | https://www.pcworld.com/article/440340/get-more-out-of-the-windows-taskbar-with-these-3-shortcuts.html , https://www.elevenforum.com/t/open-apps-on-taskbar-in-windows-11.29087/ |
| B. Win+R → 이름/URI → Enter | Win+R, 대기, 글자, Enter | **있음** (한글 상태면 `powerpnt`가 자모로 입력됨) | 중간. App Paths에 등록된 이름이나 URI만 됨 | https://learn.microsoft.com/windows/win32/shell/app-registration , https://winaero.com/windows-11-uri-commands-to-launch-apps-directly/amp |
| C. Win → 앱 이름 검색 → Enter | Win, 대기, 글자, 대기, Enter | 있음 + 검색 인덱스 지연 | 낮음~미확인 (검색 불안정 보고 있음) | https://learn.microsoft.com/en-us/answers/questions/1692600/windows-11-start-menu-search-not-functional-typing |

**결론**
1. **기본은 A(Win+숫자)**. 작업표시줄 고정 순서를 1쪽 타일 순서와 맞춘다: 1 Claude, 2 카카오톡, 3 크롬, 4 파워포인트, 5 엑셀, 6 한글. 설치 안내서에 "작업표시줄에 이 순서로 고정"이라는 한 단계가 추가된다.
   - Win+Shift+숫자는 새 창, Win+Ctrl+숫자는 마지막 활성 창이다(확인, 위 PCWorld). 기본은 Win+숫자로 한다.
   - 이미 앞에 떠 있는 앱에 Win+숫자를 다시 누르면 최소화될 수 있다(**미확인**, 실기 확인).
2. **B는 대안**. 타일 길게 누르기로 실행한다. 작업표시줄 순서가 틀렸을 때나 macOS가 아닌 PC를 빌려 쓸 때 쓴다.
3. **C는 쓰지 않는다** (검색 지연과 IME를 둘 다 탄다).

### 2.2 IME(한/영) 문제의 결론

- 시계는 PC의 한/영 상태를 읽을 수 없다. LANG1(0x90, 한/영 키)은 **토글**이라 지금 상태를 모르면 보내서는 안 된다. 기존 결론(`docs/research/shortcuts.md` 4.2)과 같다. HID 코드 출처: HUT 1.5 (shortcuts.md 4.6). 한/영 키·Win+Space 전환: https://learn.microsoft.com/globalization/input/korean-ime
- 그래서 **글자를 치는 방식(B·C)은 기본값으로 쓰지 않는다**. Win+숫자는 IME와 무관하다.
- Win+R 창이 열릴 때 처음부터 영문 상태인지는 **미확인**이다. 월요일에 한글 상태에서 Win+R을 눌러 확인한다. 영문으로 시작하면 B도 안전하다.
- B가 실패하면(자모가 입력되면) Enter가 잘못된 명령을 실행하지 않도록, 실행되지 않은 Run 창은 사용자가 Esc로 닫는다. 시계 쪽에서 자동 재시도는 하지 않는다.

### 2.3 타일별 키 시퀀스

지연값은 시작값이다(**미확인**, 실기로 조정). 글자 전송은 글자마다 누름·뗌, 간격 15 ms로 시작한다.

| 타일 | 1순위 (A) | 대안 (B, Win+R) | 대안 근거 |
|---|---|---|---|
| Claude | Win+1 | Win+R → 300 ms → `claude://claude.ai/new` → 50 ms → Enter | 공식 도움말: `claude://` 딥링크 지원(Windows 포함), CMD에서 `start "" "claude://claude.ai/new"`로 테스트 안내. https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link . Store(MSIX) 설치라 exe 경로가 버전마다 바뀌므로 경로 실행은 쓰지 않는다(제3자: https://horadecodar.com.br/?p=43205) |
| 카카오톡 | Win+2 | 없음 (권장 안 함) | `kakaotalk://` 실행 스킴은 공식 문서에 없음(공식 스킴은 앱키 기반 공유용). https://developers.kakao.com/docs/ko/kakaotalk-share/android-link . 설치 경로는 `C:\Program Files (x86)\Kakao\KakaoTalk\KakaoTalk.exe`(설치 안내 다수, https://foxcg.com/kakaotalk-pc-download-2/) `[충돌]` 조사원 2는 `%LOCALAPPDATA%` 경로를 적었으나 출처 없는 일반 지식이라 설치 안내 쪽을 택함. 경로를 Win+R에 치는 방식은 한글 상태에 취약하고 길어서 넣지 않는다 |
| 크롬 | Win+3 | Win+R → 300 ms → `chrome` → 50 ms → Enter | App Paths 등록 이름 실행(원리 확인: https://learn.microsoft.com/windows/win32/shell/app-registration , 크롬 등록 여부는 제3자: https://techcult.com/complete-list-of-windows-11-run-commands/) |
| 파워포인트 | Win+4 | Win+R → 300 ms → `powerpnt` → 50 ms → Enter | App Paths 등록(설치 가이드 수준): https://support.sendsteps.com/portal/en/kb/articles/sendsteps-shortcut-opens-explorer-instead-of-powerpoint |
| 엑셀 | Win+5 | Win+R → 300 ms → `excel` → 50 ms → Enter | 같은 출처. https://www.thomsonreuters.com/en-gb/help/digita-accounts-production-advanced/errors/error-file-cannot-be-accessed-by-the-system-when-y.html |
| 한글 | Win+6 | **미확인** — `hwp`가 Win+R에서 되는지 모름. 되면 Win+R → `hwp` → Enter | 설치 경로 예 `C:\Program Files (x86)\Hnc\Office 2022\HOffice120\Bin\Hwp.exe`(개인 사례, 버전마다 다름). `-regserver`는 COM 등록용이지 실행 옵션이 아님. https://www.inflearn.com/community/questions/1057625/hwp-win32-부터-에러가-발생합니다-ㅠㅠ |
| 업무포털 (2쪽) | Win+3(크롬) → 800 ms → Ctrl+T → 150 ms → 주소 → 50 ms → Enter | Win+R → 300 ms → 주소 → Enter (기본 브라우저로 열림) | 주소창 입력 방식은 조사원 3의 제안. URL은 영문이라 IME를 탄다. 주소창도 한글 상태면 실패할 수 있음(**미확인**) |

- `claude://` 대안은 Claude가 이미 실행 중일 때 새 대화 창이 뜨는지 **미확인**이다. 같은 딥링크가 Claude Code의 `/desktop` 명령에서는 Windows에서 실패한 보고가 있다(시계의 Win+R과는 다른 경로). https://claudeissues.com/issue/78335-bug-desktop-fails-with-failed-to-open-claude-desktop-on-windows-while-the-same-d
- 콜론은 Shift+SEMICOLON, 슬래시는 SLASH로 보낸다(US 배열 기준. 한국어 키보드의 영문 기호 배치도 같다고 보지만 **미확인**).

### 2.4 macOS

| 방식 | 키 시퀀스 | 출처 |
|---|---|---|
| **Spotlight (기본)** | Cmd+Space → 300 ms → 영문 앱 이름 → 300 ms → Return | https://www.macworld.com/article/228593/5-ways-to-launch-mac-apps-from-the-keyboard.html , https://www.howtogeek.com/718935/how-to-quickly-launch-a-mac-app-with-spotlight/ |
| Dock (대안) | Control+F3 (Fn 키 모드 장치는 Control+Fn+F3) → 글자로 점프 → Return | https://macmost.com/using-the-mac-dock-with-only-your-keyboard.html |

- Spotlight에 넣을 영문 이름: `Claude`, `KakaoTalk`, `Google Chrome`, `PowerPoint`, `Excel`, `Hancom Office HWP`(한글 앱의 영문 이름은 **미확인**).
- macOS에는 Win+숫자 같은 "Dock N번째 앱" 기본 단축키가 확인되지 않았다(**미확인**). 그래서 macOS는 IME 영향을 받는 Spotlight가 기본이 된다. Apple 한국어 입력기에서 첫 한글 입력이 빠지는 버그 보고가 있으므로 앱 이름은 영문으로만 보낸다. https://developer.apple.com/forums/thread/783005
- 입력 소스 전환 기본 단축키는 **미확인**이라 시계에서 보내지 않는다. 사용자가 영문 상태를 맞춰 두는 것을 전제로 하고 화면에 안내한다.
- Claude는 macOS에서도 `claude://`를 쓸 수 있지만 Spotlight 없이 URI를 여는 키 경로가 없어서 Spotlight와 같은 방식으로 둔다.

---

## 3. keymap.json "매크로 동작" 형식 제안

기존 동작은 `{ "mods": [...], "key": "..." }` 한 번 누름이다. 실행 타일은 여러 단계가 필요하므로 `steps` 배열을 추가한다. 기존 형식은 그대로 두고 `steps`가 있으면 매크로로 처리한다(하위 호환).

### 단계 종류 (4가지만)

| 단계 | 형식 | 의미 | 제한 |
|---|---|---|---|
| chord | `{ "chord": { "mods": ["gui"], "key": "R" } }` | 수정자 누름 → 키 누름 → 모두 뗌 | key는 `hid-usage.json`의 keys |
| wait | `{ "wait": 300 }` | 밀리초 대기 | 0~3000 |
| text | `{ "text": "powerpnt" }` | ASCII 글자를 US 배열 키로 바꿔 차례로 입력 | 출력 가능한 ASCII만(`^[\x20-\x7E]{1,96}$`). 한글 금지 |
| consumer | `{ "consumer": "MUTE" }` | 소비자 키 한 번 | `hid-usage.json`의 consumer |

한 동작의 단계는 최대 24개. 실행 중 다른 타일 입력은 무시하고, 마지막에 모든 키 뗌을 보장한다.

### 예시

```json
"launch": {
  "name": "실행",
  "pages": [
    {
      "id": "apps",
      "tiles": [
        {
          "id": "claude",
          "label": "Claude",
          "icon": null,
          "source": "https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link",
          "win": { "steps": [ { "chord": { "mods": ["gui"], "key": "1" } } ] },
          "winAlt": { "steps": [
            { "chord": { "mods": ["gui"], "key": "R" } },
            { "wait": 300 },
            { "text": "claude://claude.ai/new" },
            { "wait": 50 },
            { "chord": { "mods": [], "key": "ENTER" } }
          ] },
          "mac": { "steps": [
            { "chord": { "mods": ["gui"], "key": "SPACE" } },
            { "wait": 300 },
            { "text": "Claude" },
            { "wait": 300 },
            { "chord": { "mods": [], "key": "ENTER" } }
          ] }
        },
        {
          "id": "kakaotalk",
          "label": "카카오톡",
          "icon": null,
          "win": { "steps": [ { "chord": { "mods": ["gui"], "key": "2" } } ] },
          "winAlt": null,
          "mac": { "steps": [
            { "chord": { "mods": ["gui"], "key": "SPACE" } },
            { "wait": 300 },
            { "text": "KakaoTalk" },
            { "wait": 300 },
            { "chord": { "mods": [], "key": "ENTER" } }
          ] }
        }
      ]
    },
    {
      "id": "work",
      "tiles": [
        {
          "id": "mute",
          "label": "음소거",
          "icon": null,
          "win": { "steps": [ { "consumer": "MUTE" } ] },
          "mac": { "steps": [ { "consumer": "MUTE" } ] }
        },
        {
          "id": "portal",
          "label": "업무포털",
          "icon": null,
          "url": "",
          "note": "url 은 사용자가 설정 화면에서 넣는다. 비어 있으면 타일 비활성",
          "win": { "steps": [
            { "chord": { "mods": ["gui"], "key": "3" } },
            { "wait": 800 },
            { "chord": { "mods": ["ctrl"], "key": "T" } },
            { "wait": 150 },
            { "text": "{url}" },
            { "wait": 50 },
            { "chord": { "mods": [], "key": "ENTER" } }
          ] }
        }
      ]
    }
  ]
}
```

- `winAlt`는 타일 길게 누르기로 실행한다. `null`이면 길게 누르기가 없다(기존 규칙과 같이 `null` = 비활성).
- `{url}` 자리표시자는 텍스트 단계에서만 쓴다. URL도 ASCII 제한을 받는다.
- 적용하려면 스키마(`shared/schema/keymap.schema.json`)의 `modes`, `modeOrder`(현재 3개 고정)를 늘리고, sim의 TS 로직과 firmware `logic/`에 같은 매크로 실행기를 넣고, `test-vectors`에 단계 → HID 리포트 열 기대값을 추가해야 한다. 이 문서에서는 형식만 제안한다.

---

## 4. 월요일 실기 확인 목록

Windows (교무실 PC 기준)
1. 작업표시줄을 Claude, 카카오톡, 크롬, PPT, 엑셀, 한글 순으로 고정한 뒤 Win+1~6이 각각 맞는 앱을 여는지.
2. 이미 앞에 떠 있는 앱에 Win+숫자를 누르면 최소화되는지, 창이 여러 개면 어떻게 되는지.
3. **한글 입력 상태에서 Win+R을 눌렀을 때 입력창이 영문으로 시작하는지** (B 방식 채택 여부를 결정).
4. Win+R로 `powerpnt`, `excel`, `chrome`, `hwp`가 각각 실행되는지. `hwp`가 안 되면 한글은 Win+숫자만 둔다.
5. Win+R `claude://claude.ai/new`: 꺼져 있을 때 / 켜져 있을 때 각각 어떻게 열리는지.
6. Win+R 300 ms 대기와 글자 간격 15 ms로 글자가 빠지지 않는지. 빠지면 대기 500 ms, 간격 30 ms로 올린다.
7. `:` `/` 기호가 한국어 키보드 설정 PC에서 그대로 입력되는지.
8. 음소거 소비자 키(MUTE)가 Windows 볼륨 표시를 띄우며 음소거되는지.
9. Win+Shift+S, Win+L, Win+D, Win+P가 시계에서 보낸 키로도 동작하는지.
10. 업무포털 타일: 크롬이 켜져 있지 않을 때 800 ms로 Ctrl+T가 늦지 않는지. 주소창이 한글 상태일 때 실패하는지.

macOS (가능하면)
11. 영문 상태에서 Cmd+Space → `KakaoTalk` → Return이 카카오톡을 여는지. 한글 앱의 Spotlight 영문 이름.
12. 한글 입력 상태에서 같은 시퀀스가 어떻게 실패하는지(안내 문구 작성용).
13. Control+Cmd+Q 잠금, Cmd+Shift+5 캡처 패널.

---

## 5. 출처 요약 (공식 순)

- Microsoft App Paths: https://learn.microsoft.com/windows/win32/shell/app-registration , https://devblogs.microsoft.com/oldnewthing/20110725-00/?p=10073
- Microsoft Windows 단축키: https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec
- Microsoft 돋보기 단축키: https://support.microsoft.com/en-us/accessibility/windows/magnifier/magnifier-keyboard-shortcuts-and-touch-gestures
- Microsoft 한국어 IME: https://learn.microsoft.com/globalization/input/korean-ime
- Claude 딥링크: https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link
- Kakao 개발자 문서: https://developers.kakao.com/docs/ko/kakaotalk-share/android-link
- Apple 단축키: https://support.apple.com/en-us/102650
- Apple 개발자 포럼(한국어 IME): https://developer.apple.com/forums/thread/783005
- 제3자: 위 표에 적은 PCWorld, elevenforum, winaero, techcult, sendsteps, thomsonreuters, inflearn, foxcg, macworld, howtogeek, macmost, pureinfotech, clien, wikidocs, nocutnews

---

## 6. 뺀 것과 이유

| 뺀 항목 | 이유 |
|---|---|
| 시작 메뉴 검색(Win → 이름) 실행 | 검색 지연 + IME 이중 위험, 출처도 불안정 보고뿐 |
| 카카오톡·한글 exe 전체 경로 실행 | 버전·설치 방식마다 경로가 다르고 Win+R 글자 입력이라 IME를 탐 |
| `ms-excel:` 등 Office URI 단독 실행 | 공식 문서상 파일 URL과 함께 쓰는 형식만 있음 (https://learn.microsoft.com/en-us/sharepoint/dev/embedded/development/tutorials/launch-experience) |
| LANG1(한/영)을 먼저 보내는 방식 | 토글이라 현재 상태를 모르면 오히려 한글로 바꿀 수 있음 |
| 화면 녹화 Win+Shift+R | 빌드에 따라 오버레이만 뜨고, PowerPoint 녹화 단축키와 충돌 보고 (https://learn.microsoft.com/en-us/answers/questions/5240436/snipping-tools-hotkey-conflicts-with-the-hotkey-of) |
| 가상 데스크톱 전환·닫기 | Win+Ctrl+F4는 열린 앱까지 닫혀 손목 오조작 위험. 교사 수업 흐름에서 쓸 일 적음 |
| 나이스·에듀파인 자동 로그인 | 인증서 로그인이라 키 입력으로 다룰 수 없고, 다뤄서도 안 됨 |
| 판서·타이머·OBS·Zoom 음소거 매크로 | 출처 없음 또는 기존 회의 모드와 겹침 |
| Macro Deck·Touch Portal 등 대체품 비교 | PC 설치형이라 "PC에 설치 없음" 전제와 맞지 않음 |
