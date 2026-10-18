/**
 * "시계에 설치" 페이지 — 담당: settings 모듈. 명세: design/settings-install.md 3장 (ESP Web Tools),
 * 근거: docs/research/firmware-stack.md 5장(esptool v5 백업·복원), 6장(매니페스트·같은 출처 배포).
 *
 * 주의: 사용자가 직접 USB 로 연결해 설치하는 화면이다. 개발 중 실제 시계에 업로드하지 않는다.
 *  - 백업 확인 체크박스를 켜야만 설치 버튼이 활성화된다(새로 열 때마다 다시 체크 — 저장하지 않음).
 *  - 버전 목록은 firmware/manifests.json. 지금은 예시뿐이라 실제 설치 파일이 없다는 것을 화면에 크게 표시한다.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import './install.css';
import { setupPWA } from '../pwa';

setupPWA(); // 설치형 웹앱: 서비스워커 등록(배포 빌드에서만)

/** ESP Web Tools — unpkg 고정 버전(2025-05 배포 10.1.1). 바꿀 때는 정확한 버전으로 */
const ESP_WEB_TOOLS_URL = 'https://unpkg.com/esp-web-tools@10.1.1/dist/web/install-button.js?module';

interface VersionEntry {
  version: string;
  date: string | null;
  manifest: string;
  notes: string | null;
  summary?: string;
  example?: boolean;
}
interface VersionList {
  example?: boolean;
  versions: VersionEntry[];
}

/** Web Serial 의 필요한 부분만(타입 패키지 없이) */
interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  setSignals?(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
}

const PORT = 'COM7'; // 장치 관리자에서 실제 포트 확인
const CMD_ID = `esptool --chip esp32c6 -p ${PORT} flash-id`;
const CMD_BACKUP = `esptool --chip esp32c6 -p ${PORT} -b 460800 read-flash 0 ALL xiaozhi_backup.bin`;
const CMD_HASH = 'certutil -hashfile xiaozhi_backup.bin SHA256';
const CMD_RESTORE = `esptool --chip esp32c6 -p ${PORT} -b 460800 write-flash 0x0 xiaozhi_backup.bin`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// 시뮬레이터에서 고른 테마를 따른다(편의 기능, 실패해도 무시)
try {
  const t = localStorage.getItem('wrist-sim.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  /* 무시 */
}

const code = (cmd: string, label: string) => `
  <div class="inst-code">
    <pre><code>${esc(cmd)}</code></pre>
    <button type="button" class="inst-btn inst-copy" data-copy="${esc(cmd)}" aria-label="${esc(label)} 명령 복사">복사</button>
  </div>`;

const root = document.getElementById('install-root');
if (root) {
  const serialOk = 'serial' in navigator;
  const secure = globalThis.isSecureContext;
  root.innerHTML = `
  <main class="inst-main">
    <p class="inst-back"><a href="./index.html">← 시뮬레이터로</a> · <a href="./guide.html">처음이면 따라 하기 안내서</a></p>
    <h1 class="inst-title">시계에 설치</h1>
    <p class="inst-lead">Waveshare ESP32-C6 2.06 AMOLED 시계에 손목 컨트롤러 펌웨어를 브라우저에서 USB 로 바로 설치합니다(ESP Web Tools). PC 에 프로그램을 설치하지 않아도 됩니다.</p>

    ${
      serialOk
        ? `<p class="inst-ok">Chrome·Edge 확인됨 (Web Serial 사용 가능)${secure ? '' : ' · 단, 보안 연결(https)이 아니라 설치가 막힙니다'}</p>`
        : `<div class="inst-notice" role="alert">이 페이지는 <strong>데스크톱 Chrome 또는 Edge</strong>에서만 설치할 수 있습니다(Web Serial 필요). Safari·Firefox·모바일은 지원하지 않습니다.</div>`
    }
    <div class="inst-notice inst-notice--example" data-ref="exampleNotice" hidden>
      <strong>아직 실제 릴리스가 없습니다.</strong> 아래 버전 목록은 예시이며 설치 파일(.bin)이 없습니다. 펌웨어 2단계와 배포 파이프라인이 끝나면 CI 가 이 목록을 채웁니다.
    </div>

    <section class="inst-card" aria-labelledby="inst-s1">
      <h2 id="inst-s1"><span class="inst-n">1</span>시계 연결</h2>
      <p>USB-C <strong>데이터</strong> 케이블로 시계를 PC 에 연결합니다(충전 전용 케이블은 인식되지 않습니다).</p>
      <p class="inst-sub">인식되지 않으면: BOOT 버튼을 누른 채 전원을 켜서 다운로드 모드로 들어간 뒤 다시 시도합니다(Waveshare 위키 기준 — 실물 확인 후 문구 확정).</p>
    </section>

    <section class="inst-card" aria-labelledby="inst-s2">
      <h2 id="inst-s2"><span class="inst-n">2</span>원래 펌웨어 백업</h2>
      <p>처음 설치하기 전에 지금 들어 있는 펌웨어(샤오즈)를 통째로 백업합니다. 되돌릴 수 있어야 합니다. Python 3.12 에서 <code>pip install esptool</code> 후, 포트(${PORT})는 장치 관리자에서 확인해 바꿉니다.</p>
      <ol class="inst-steps">
        <li>칩·플래시 확인 (실물: ESP32-C6, 16MB) ${code(CMD_ID, '플래시 확인')}</li>
        <li>전체 백업 (<code>ALL</code> = 용량 자동 감지, 16MB 약 90초) ${code(CMD_BACKUP, '백업')}</li>
        <li>해시 기록 (두 번 받아 같은지 비교하면 더 안전) ${code(CMD_HASH, '해시')}</li>
      </ol>
      <label class="inst-checkrow">
        <input type="checkbox" data-ref="backup" />
        <span>원래 펌웨어(샤오즈)를 백업했습니다. 또는 이미 손목 컨트롤러 펌웨어가 설치되어 있습니다.</span>
      </label>
    </section>

    <section class="inst-card" aria-labelledby="inst-s3">
      <h2 id="inst-s3"><span class="inst-n">3</span>버전 선택</h2>
      <div class="inst-versions" role="radiogroup" aria-label="펌웨어 버전" data-ref="versions"><p class="inst-sub">버전 목록을 불러오는 중…</p></div>
      <div class="inst-notice" data-ref="oldWarn" hidden>이전 버전입니다. 설정이 초기화되고 PC 와 다시 페어링해야 할 수 있습니다.</div>
    </section>

    <section class="inst-card" aria-labelledby="inst-s4">
      <h2 id="inst-s4"><span class="inst-n">4</span>설치</h2>
      <p class="inst-sub">설치 대화상자에서 "장치 지우기(Erase)"를 고르면 설정·페어링이 초기화되어 PC 에서 다시 페어링해야 합니다. 샤오즈나 공장 펌웨어에서 처음 넘어올 때는 지우기를 고르세요.</p>
      <div class="inst-install">
        <esp-web-install-button data-ref="espBtn">
          <button slot="activate" type="button" class="inst-installbtn" data-ref="activate" disabled>시계에 설치</button>
          <span slot="unsupported" class="inst-notice">이 브라우저는 지원하지 않습니다. 데스크톱 Chrome 또는 Edge로 열어 주세요.</span>
          <span slot="not-allowed" class="inst-notice">보안 연결(https)에서만 설치할 수 있습니다.</span>
        </esp-web-install-button>
        <span class="inst-sub">설치 중에는 USB를 뽑지 마세요. 약 1분 걸립니다.</span>
      </div>
      <p class="inst-sub">이 설치는 <strong>부트로더(0x0)·파티션 표(0x8000)·앱(0x10000) 세 파일을 나눠 써서</strong> 페어링·설정이 든 NVS(0x9000~)를 지킵니다. 명령으로 쓸 때도 같은 세 파일을 씁니다(빌드 폴더의 <code>FLASH.txt</code>): ${code(`esptool --chip esp32c6 -p ${PORT} -b 460800 write-flash 0x0 wrist-controller-버전-bootloader.bin 0x8000 wrist-controller-버전-partition-table.bin 0x10000 wrist-controller-버전-app.bin`, '나눠 쓰기')}
      <code>…-merged-full-erase.bin</code> 을 0x0 에 통째로 쓰면 빈칸이 0xFF 로 채워져 <strong>NVS 가 지워집니다</strong>(PC 에서 장치를 지우고 다시 페어링해야 함). 처음 설치·완전 초기화 때만 씁니다.</p>
      <p class="inst-gate" data-ref="gate" aria-live="polite"></p>
    </section>

    <section class="inst-card">
      <details>
        <summary><span class="inst-n">5</span>원래 펌웨어(샤오즈)로 되돌리기</summary>
        <ol class="inst-steps">
          <li>2단계에서 받은 백업 파일 <code>xiaozhi_backup.bin</code> 위치를 확인하고, 그 폴더에서 명령 창을 엽니다.</li>
          <li>시계를 연결하고(필요하면 BOOT 를 누른 채 전원) 전체 이미지를 0x0 에 씁니다. esptool v5 는 쓰고 나서 자동으로 검증합니다. ${code(CMD_RESTORE, '복원')}</li>
          <li>전원을 다시 켭니다. 자세한 방법: 저장소 README 의 '원래 펌웨어 복원'.</li>
        </ol>
        <p class="inst-sub">ESP Web Tools 는 내 PC 의 파일을 직접 올리지 못해서 복원은 esptool 명령으로 합니다. 백업이 없으면 Waveshare 저장소 Release 의 공장 펌웨어로 복원할 수 있습니다(같은 명령, 파일만 바꿈).</p>
      </details>
    </section>

    <section class="inst-card" aria-labelledby="inst-s6">
      <h2 id="inst-s6"><span class="inst-n">6</span>시계 시간 맞추기</h2>
      <p>시계 모드의 시각은 보드 RTC(PCF85063A)에 저장됩니다(전원을 꺼도 유지). 처음 한 번, 또는 배터리를 뺀 뒤에 이 PC 의 시각으로 맞춥니다.</p>
      <p class="inst-sub">USB 로 연결한 채 버튼을 누르고 시계 포트를 고르면 <code>t &lt;유닉스 초&gt; &lt;시간대 분&gt;</code> 명령을 보냅니다(직렬 명령, README '시계 안 조작'). 포트를 열 때 시계가 다시 켜질 수 있어 2초 뒤 한 번 더 보냅니다.</p>
      <div class="inst-install">
        <button type="button" class="inst-installbtn" data-ref="setTime" ${serialOk ? '' : 'disabled'}>시계 시간 맞추기</button>
        <span class="inst-sub" data-ref="timeMsg" aria-live="polite"></span>
      </div>
    </section>

    <section class="inst-card" aria-labelledby="inst-s7">
      <h2 id="inst-s7"><span class="inst-n">7</span>PC 바로 가기 키 설정</h2>
      <p>시계 <strong>실행 모드 1쪽</strong> 타일은 <code>Ctrl+Alt+1~6</code> 을 보냅니다(1 Claude · 2 카카오톡 · 3 크롬 · 4 파워포인트 · 5 엑셀 · 6 한글). 수업용 PC 마다 한 번, 이 키로 앱이 열리도록 바로 가기를 만듭니다. 작업표시줄 순서·한/영 상태와 상관없이 동작합니다.</p>
      <ol class="inst-steps">
        <li><a href="./pc-setup/wrist-shortcuts.ps1" download="wrist-shortcuts.ps1">wrist-shortcuts.ps1 내려받기</a> (PowerShell 스크립트, 관리자 권한 필요 없음 — 내 시작 메뉴 <code>손목 컨트롤러</code> 폴더에 바로 가기 6개를 만듭니다)</li>
        <li>내려받은 파일을 <strong>오른쪽 클릭 → PowerShell 에서 실행</strong>. 실행이 막히면 내려받은 폴더에서 PowerShell 을 열고 아래 한 줄을 실행합니다. ${code('powershell -ExecutionPolicy Bypass -File .\wrist-shortcuts.ps1', '바로 가기 스크립트')}</li>
        <li>창에 <code>만듦</code> / <code>건너뜀</code> 이 앱마다 표시됩니다. 건너뛴 앱은 시작 메뉴에서 찾지 못한 것입니다(설치 후 다시 실행하면 됩니다. 다시 실행하면 덮어씁니다).</li>
        <li>실행 후 바로 가기 키가 안 먹으면 <strong>로그아웃 후 다시 로그인</strong>합니다.</li>
      </ol>
      <p class="inst-sub">타일을 길게 누르면 크롬·파워포인트·엑셀은 실행 창(Win+R)으로도 열 수 있습니다. macOS 는 이 설정 없이 Spotlight 로 엽니다.</p>
    </section>

    <p class="inst-foot">이 페이지의 설치 버튼은 사용자가 직접 누릅니다. 개발 중 자동으로 시계에 올리지 않습니다.</p>
  </main>`;

  const $ = <T extends HTMLElement = HTMLElement>(ref: string) => root.querySelector<T>(`[data-ref="${ref}"]`)!;
  const backup = $<HTMLInputElement>('backup');
  const activate = $<HTMLButtonElement>('activate');
  const espBtn = $('espBtn');
  const gate = $('gate');
  const versionsEl = $('versions');
  const oldWarn = $('oldWarn');
  let list: VersionEntry[] = [];
  let selected: VersionEntry | null = null;
  let scriptState: 'loading' | 'ok' | 'error' = 'loading';

  const updateGate = () => {
    const ready = backup.checked && !!selected && serialOk;
    activate.disabled = !ready;
    let msg = '';
    if (!serialOk) msg = '이 브라우저에서는 설치할 수 없습니다(데스크톱 Chrome·Edge 필요).';
    else if (!backup.checked) msg = '2단계 백업 확인 체크를 켜면 설치 버튼이 활성화됩니다.';
    else if (!selected) msg = '설치할 버전을 고르세요.';
    else if (selected.example) msg = `v${selected.version} 은(는) 예시라 설치 파일이 없습니다 — 눌러도 매니페스트를 찾지 못해 아무것도 쓰지 않습니다.`;
    else if (scriptState === 'error') msg = '설치 도구(ESP Web Tools)를 불러오지 못했습니다. 인터넷 연결을 확인하세요.';
    gate.textContent = msg;
  };

  // 체크하지 않았으면 클릭을 ESP Web Tools 에 전달하지 않는다(비활성 버튼 이중 안전장치)
  espBtn.addEventListener(
    'click',
    (e) => {
      if (activate.disabled) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
  backup.addEventListener('change', updateGate);

  const select = (v: VersionEntry) => {
    selected = v;
    espBtn.setAttribute('manifest', v.manifest);
    oldWarn.hidden = list.length === 0 || v === list[0];
    for (const r of versionsEl.querySelectorAll<HTMLInputElement>('input[type="radio"]')) r.checked = r.value === v.version;
    updateGate();
  };

  const renderVersions = () => {
    if (list.length === 0) {
      versionsEl.innerHTML = '<p class="inst-sub">설치할 수 있는 버전이 없습니다.</p>';
      return;
    }
    versionsEl.innerHTML = list
      .map(
        (v, i) => `
        <label class="inst-version">
          <input type="radio" name="inst-version" value="${esc(v.version)}" />
          <span class="inst-version__main">
            <span class="inst-version__name">v${esc(v.version)}</span>
            ${i === 0 ? '<span class="inst-badge">최신 · 권장</span>' : ''}
            ${v.example ? '<span class="inst-badge inst-badge--example">예시 · 파일 없음</span>' : ''}
            <span class="inst-version__date">${v.date ? esc(v.date) : '날짜 없음'}</span>
          </span>
          <span class="inst-version__sub">${v.summary ? esc(v.summary) : ''}${
            v.notes ? ` · <a href="${esc(v.notes)}" target="_blank" rel="noopener">변경 내역</a>` : ' · 변경 내역(릴리스 후 연결)'
          }</span>
        </label>`,
      )
      .join('');
    versionsEl.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((r) =>
      r.addEventListener('change', () => {
        const v = list.find((x) => x.version === r.value);
        if (v) select(v);
      }),
    );
    select(list[0]);
  };

  fetch('firmware/manifests.json', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<VersionList>;
    })
    .then((data) => {
      list = Array.isArray(data.versions) ? data.versions : [];
      $('exampleNotice').hidden = !(data.example || list.some((v) => v.example));
      renderVersions();
    })
    .catch((err: unknown) => {
      versionsEl.innerHTML = `<p class="inst-sub">버전 목록(firmware/manifests.json)을 불러오지 못했습니다: ${esc(err instanceof Error ? err.message : String(err))}</p>`;
      updateGate();
    });

  // 시계 시간 맞추기(Web Serial): 't <unix초> <시간대 분>' — 펌웨어 main.cpp serialCommand
  const setTime = $<HTMLButtonElement>('setTime');
  const timeMsg = $('timeMsg');
  setTime.addEventListener('click', async () => {
    const serial = (navigator as unknown as { serial?: { requestPort(): Promise<SerialPortLike> } }).serial;
    if (!serial) return;
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: 115200 });
      // DTR/RTS 를 내려 둔다(USB-Serial/JTAG 는 이 선 조합으로 칩을 재시작할 수 있다)
      await port.setSignals?.({ dataTerminalReady: false, requestToSend: false }).catch(() => undefined);
      const send = async () => {
        const now = Date.now();
        const tz = -new Date().getTimezoneOffset();
        const line = `t ${Math.floor(now / 1000)} ${tz}
`;
        const w = port.writable!.getWriter();
        await w.write(new TextEncoder().encode(line));
        w.releaseLock();
        return line.trim();
      };
      await new Promise((r) => setTimeout(r, 300));
      const first = await send();
      timeMsg.textContent = `보냄: ${first} — 2초 뒤 한 번 더`;
      await new Promise((r) => setTimeout(r, 2000));
      const again = await send();
      await port.close();
      const d = new Date();
      timeMsg.textContent = `완료: ${again} (${d.toLocaleString()} · UTC${d.getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(d.getTimezoneOffset() / 60)})`;
    } catch (err) {
      timeMsg.textContent = `실패: ${err instanceof Error ? err.message : String(err)} (다른 프로그램이 포트를 쓰고 있으면 닫으세요)`;
    }
  });

  // 복사 버튼
  root.querySelectorAll<HTMLButtonElement>('.inst-copy').forEach((b) =>
    b.addEventListener('click', async () => {
      const text = b.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = '복사됨';
      } catch {
        const pre = b.parentElement?.querySelector('code');
        if (pre) {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        b.textContent = '선택됨 — Ctrl+C';
      }
      setTimeout(() => (b.textContent = '복사'), 1600);
    }),
  );

  // ESP Web Tools 불러오기(지원 브라우저에서만)
  if (serialOk) {
    const s = document.createElement('script');
    s.type = 'module';
    s.src = ESP_WEB_TOOLS_URL;
    s.onload = () => {
      scriptState = 'ok';
      updateGate();
    };
    s.onerror = () => {
      scriptState = 'error';
      updateGate();
    };
    document.head.append(s);
  }
  updateGate();
}
