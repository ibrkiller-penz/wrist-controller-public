/**
 * 시계 안 설정 화면 — 명세: design/settings-install.md 1장.
 * (시뮬레이터 바깥의 keymap/gesture 편집 패널은 settings 모듈 몫. 이 파일은 '시계 화면 안'의 설정이다.)
 *
 * - 진입: 발표 모드 쇼 시트의 '설정' 행, 그 밖의 모드는 상태줄에서 아래로 끌기(시트가 없으므로).
 * - 항목: 에어마우스 감도 3단계(gesture.airMouse.sensitivity 이름), 컴퓨터 종류(OS), 블루투스 이름(후보 선택), 펌웨어 버전.
 * - 선택은 손을 뗄 때(스크롤과 구분). 바꾼 값은 app.dispatch(setSensitivity / setOs) · app.setDeviceName 로 즉시 반영.
 * - 설정 화면에서는 터치를 코어로 보내지 않는다(키가 PC 로 새지 않게). 측면 버튼 처리는 watch.ts 가 한다.
 * - 닫기: 닫기 버튼, 오른쪽 스와이프, 주 측면 버튼 짧게, 30초 무입력.
 * - v2(README 3.5): 글자는 모두 t('settings.*'), 글꼴은 kr_20/24/28/32. 열고 닫기는 즉시(페이드·슬라이드 없음).
 *   이름 바꾸기 확인은 덮개 대신 화면 전체를 불투명 검정으로 가린다.
 */
import type { App } from '../app';
import type { CoreState, OsId } from '../core';
import pkg from '../../package.json';
import { el, icon, place, setText, utf8Bytes } from './dom';
import { NAME_CANDIDATES, t } from './text';

/** 시뮬레이션용 가짜 BLE MAC 끝 4자리(실제 시계는 MAC 에서 읽는다). 이름 뒤에 공백 + 이 4자를 붙인다(README 3.5) */
export const SIM_MAC_SUFFIX = '1A2B';
/** 컴퓨터 종류 표시(제품명이라 영문 그대로, README 3.5 'Windows'/'macOS') */
const OS_LIST: { id: OsId; label: string }[] = [
  { id: 'win', label: 'Windows' },
  { id: 'mac', label: 'macOS' },
];
const TOP = 56; // 스크롤 뷰포트 시작(상태줄 아래)
const IDLE_CLOSE_MS = 30000;

export interface SettingsHooks {
  toast: (text: string) => void;
  /** 열림/닫힘이 바뀔 때(watch.ts 가 화면 상태를 다시 그림) */
  onChange: () => void;
}

export class SettingsScreen {
  readonly root = el('div', 'watch-a watch-set is-hidden');
  readonly picker = el('div', 'watch-a watch-set watch-set--picker is-hidden');
  readonly dialog = el('div', 'watch-a watch-dlg is-hidden');
  private content = el('div', 'watch-set__content');
  private airSegs: HTMLDivElement[] = [];
  private sensSegs: HTMLDivElement[] = [];
  private osSegs: HTMLDivElement[] = [];
  private nameRow = el('div', 'watch-a watch-set__row watch-bd');
  private nameText = el('span', 'watch-kr28');
  private nameArrow = el('span', 'watch-set__arrow watch-kr28', t('settings.arrow'));
  private dlgOld = el('div', 'watch-a watch-dlg__old watch-kr24');
  private dlgNew = el('div', 'watch-a watch-dlg__new watch-kr28');
  private pickRows: HTMLDivElement[] = [];
  private pendingName: string | null = null;
  private applyingUntil = 0;
  private _open = false;
  lastActivity = 0;

  constructor(private app: App, private hooks: SettingsHooks) {
    this.buildMain();
    this.buildPicker();
    this.buildDialog();
  }

  get isOpen(): boolean {
    return this._open;
  }
  get pickerOpen(): boolean {
    return !this.picker.classList.contains('is-hidden');
  }
  get dialogOpen(): boolean {
    return !this.dialog.classList.contains('is-hidden');
  }

  // ------------------------------------------------------------------ 만들기
  private buildMain(): void {
    const c = this.content;
    const at = (e: HTMLElement, x: number, y: number, w?: number, h?: number) => {
      place(e, x, y - TOP, w, h);
      c.appendChild(e);
      return e;
    };
    const ttlIcon = icon('i-gear', 'sm', 'watch-set__ttlicon');
    ttlIcon.style.left = '24px';
    ttlIcon.style.top = `${70 - TOP}px`;
    c.appendChild(ttlIcon);
    at(el('div', 'watch-a watch-kr28', t('screen.settings')), 60, 66, 200, 36);
    // 에어마우스 켜기/끄기(기본 끔 — 실기 피드백 6). 감도는 켰을 때만 의미가 있어 꺼지면 흐리게
    at(el('div', 'watch-a watch-set__sec watch-kr24', t('settings.air')), 24, 118, 362, 30);
    [true, false].forEach((on, i) => {
      const seg = this.segment(`air:${on ? 1 : 0}`, on ? t('settings.on') : t('settings.off'));
      at(seg, 16 + i * 195, 156, 183, 88);
      this.airSegs.push(seg);
    });
    at(el('div', 'watch-a watch-set__sec watch-kr24', t('settings.sensSection')), 24, 242, 362, 30);
    for (let i = 0; i < 3; i++) {
      const seg = this.segment(`sens:${i}`, '');
      at(seg, 16 + i * 130, 280, 118, 88);
      this.sensSegs.push(seg);
    }
    at(el('div', 'watch-a watch-set__desc watch-kr20', t('settings.sensDesc')), 24, 376, 362, 26);
    at(el('div', 'watch-a watch-set__sec watch-kr24', t('settings.osSection')), 24, 422, 362, 30);
    OS_LIST.forEach((o, i) => {
      const seg = this.segment(`os:${o.id}`, o.label);
      at(seg, 16 + i * 195, 460, 183, 88);
      this.osSegs.push(seg);
    });
    at(el('div', 'watch-a watch-set__desc watch-kr20', t('settings.osDesc')), 24, 556, 362, 26);
    at(el('div', 'watch-a watch-set__sec watch-kr24', t('settings.name')), 24, 602, 362, 30);
    this.nameRow.dataset.act = 'name';
    this.nameRow.append(this.nameText, this.nameArrow);
    at(this.nameRow, 16, 640, 378, 88);
    at(el('div', 'watch-a watch-set__sec watch-kr24', t('settings.fwSection')), 24, 750, 362, 30);
    const ver = at(el('div', 'watch-a watch-set__ver'), 24, 788, 362, 64);
    ver.append(
      el('div', 'watch-kr28', `v${pkg.version}`),
      el('div', 'watch-kr20 watch-set__desc', t('settings.simBuild')),
    );
    const close = at(el('div', 'watch-a watch-set__row watch-set__row--c watch-bd watch-kr28', t('settings.close')), 16, 876, 378, 88);
    close.dataset.act = 'close';
    this.root.appendChild(this.content);
  }

  private segment(act: string, label: string): HTMLDivElement {
    const seg = el('div', 'watch-a watch-seg watch-bd watch-kr28');
    seg.dataset.act = act;
    seg.append(el('i', 'watch-seg__dot'), el('span', '', label));
    return seg;
  }

  private buildPicker(): void {
    const p = this.picker;
    const at = (e: HTMLElement, x: number, y: number, w?: number, h?: number) => {
      place(e, x, y - TOP, w, h);
      p.appendChild(e);
      return e;
    };
    // 후보 행 16, 64/156/248 · 취소 16,348 (README 3.5)
    for (let i = 0; i < 3; i++) {
      const row = el('div', 'watch-a watch-set__row watch-set__pick watch-bd');
      row.dataset.act = `pick:${i}`;
      row.append(
        el('span', 'watch-kr28'),
        el('span', 'watch-kr24 watch-set__suffix', SIM_MAC_SUFFIX),
        el('span', 'watch-set__check watch-kr28', t('settings.check')),
      );
      at(row, 16, 64 + i * 92, 378, 88);
      this.pickRows.push(row);
    }
    const cancel = at(el('div', 'watch-a watch-set__row watch-set__row--c watch-bd watch-kr28', t('settings.cancel')), 16, 348, 378, 88);
    cancel.dataset.act = 'pick-cancel';
  }

  private buildDialog(): void {
    const card = el('div', 'watch-a watch-dlg__card');
    // 카드 16,100,378×320 · 취소 32,316 / 바꾸기 207,316, 171×88 (화면 좌표, README 3.5)
    const cancel = el('div', 'watch-a watch-dlg__btn watch-bd watch-kr28', t('settings.cancel'));
    cancel.dataset.act = 'dlg-cancel';
    const ok = el('div', 'watch-a watch-dlg__btn watch-dlg__btn--ok watch-bd watch-kr28', t('settings.renameOk'));
    ok.dataset.act = 'dlg-ok';
    place(card, 16, 100, 378, 320);
    place(cancel, 16, 216, 171, 88);
    place(ok, 191, 216, 171, 88);
    card.append(
      place(el('div', 'watch-a watch-kr32', t('settings.renameTitle')), 24, 20, 330, 40),
      place(this.dlgOld, 24, 64, 330, 30),
      place(this.dlgNew, 24, 96, 330, 36),
      place(el('div', 'watch-a watch-kr20 watch-dlg__desc', t('settings.renameDesc')), 24, 136, 330, 78),
      cancel,
      ok,
    );
    this.dialog.appendChild(card);
  }

  // ------------------------------------------------------------------ 열기·닫기
  open(): void {
    if (this._open) return;
    this._open = true;
    this.lastActivity = this.app.now();
    this.root.scrollTop = 0;
    this.root.classList.remove('is-hidden');
    this.update(this.app.state);
    this.hooks.onChange();
  }

  close(): void {
    if (!this._open) return;
    this._open = false;
    this.hidePicker(false);
    this.dialog.classList.add('is-hidden');
    this.root.classList.add('is-hidden');
    this.hooks.onChange();
  }

  /** 30초 무입력 자동 닫힘 */
  checkIdle(now: number): void {
    const ms = this.app.gesture.timing.settingsIdleCloseMs ?? IDLE_CLOSE_MS;
    if (this._open && ms > 0 && now - this.lastActivity >= ms) this.close();
  }

  private showPicker(): void {
    this.updatePicker();
    this.picker.classList.remove('is-hidden');
    this.hooks.onChange();
  }

  private hidePicker(notify = true): void {
    if (!this.pickerOpen) return;
    this.picker.classList.add('is-hidden');
    if (notify) this.hooks.onChange();
  }

  /** 오른쪽 스와이프: 이름 선택 화면이면 취소, 아니면 설정 닫기 */
  back(): void {
    this.lastActivity = this.app.now();
    if (this.dialogOpen) this.dialog.classList.add('is-hidden');
    else if (this.pickerOpen) this.hidePicker();
    else this.close();
  }

  // ------------------------------------------------------------------ 그리기
  update(s: CoreState): void {
    const levels = this.app.gesture.airMouse.sensitivity;
    const air = this.app.gesture.airMouse.enabled;
    this.airSegs.forEach((seg, i) => seg.classList.toggle('is-sel', air === (i === 0)));
    this.sensSegs.forEach((seg, i) => {
      seg.classList.toggle('is-dis', !air);
      const lv = levels[i];
      seg.classList.toggle('is-hidden', !lv);
      setText(seg.querySelector('span')!, lv?.name ?? '');
      seg.classList.toggle('is-sel', s.sensitivity === i);
    });
    this.osSegs.forEach((seg, i) => seg.classList.toggle('is-sel', s.os === OS_LIST[i].id));
    setText(this.nameText, this.app.deviceName);
    const applying = this.app.now() < this.applyingUntil;
    this.nameRow.classList.toggle('is-dis', applying);
    setText(this.nameArrow, applying ? t('settings.applying') : t('settings.arrow'));
    this.nameArrow.classList.toggle('watch-kr20', applying);
    this.nameArrow.classList.toggle('watch-kr28', !applying);
    // 끊김 배너가 아래를 가리므로 콘텐츠 아래 여백 40 → 112 (README 2.2)
    this.content.classList.toggle('is-banner', !s.connected);
    if (this.pickerOpen) this.updatePicker();
  }

  /** 이름 후보(strings.ko.json nameCandidates) + 공백 + 끝자리 4자. deviceNameMaxBytes 이내만 */
  private candidates(): { base: string; full: string }[] {
    const max = this.app.keymap.settings.deviceNameMaxBytes ?? 24;
    return NAME_CANDIDATES.map((base) => ({ base, full: `${base} ${SIM_MAC_SUFFIX}` }))
      .filter((c) => utf8Bytes(c.full) <= max)
      .slice(0, 3);
  }

  private updatePicker(): void {
    const names = this.candidates();
    this.pickRows.forEach((row, i) => {
      const c = names[i];
      const n = c?.full;
      row.classList.toggle('is-hidden', !c);
      setText(row.firstElementChild!, c?.base ?? '');
      row.dataset.name = n ?? '';
      row.classList.toggle('is-sel', n === this.app.deviceName);
    });
  }

  // ------------------------------------------------------------------ 입력(watch.ts 의 포인터 판정에서 호출)
  private actAt(clientX: number, clientY: number): HTMLElement | null {
    const hit = document.elementFromPoint(clientX, clientY);
    const t = hit instanceof Element ? (hit.closest('[data-act]') as HTMLElement | null) : null;
    if (!t) return null;
    // 화면에 보이는 맨 위 층의 것만
    if (this.dialogOpen) return this.dialog.contains(t) ? t : null;
    if (this.pickerOpen) return this.picker.contains(t) ? t : null;
    return this.root.contains(t) ? t : null;
  }

  press(clientX: number, clientY: number): HTMLElement | null {
    this.lastActivity = this.app.now();
    const t = this.actAt(clientX, clientY);
    t?.classList.add('is-press');
    return t;
  }

  release(pressed: HTMLElement | null): void {
    pressed?.classList.remove('is-press');
  }

  /** 세로 드래그 스크롤(화면 좌표 px) */
  scrollTo(startTop: number, dy: number): void {
    this.lastActivity = this.app.now();
    this.root.scrollTop = startTop - dy;
  }

  /** 위로 쓸어 닫기를 받을 수 있나: 이름 선택·확인 카드가 없고, 누를 때 이미 목록 맨 아래였을 때(스크롤과 구분) */
  canSwipeClose(scroll0: number): boolean {
    if (this.pickerOpen || this.dialogOpen) return false;
    const max = this.root.scrollHeight - this.root.clientHeight;
    return max <= 1 || scroll0 >= max - 1;
  }

  get scrollTop(): number {
    return this.root.scrollTop;
  }

  /** 손을 뗀 순간 선택 */
  tap(clientX: number, clientY: number): void {
    this.lastActivity = this.app.now();
    const t = this.actAt(clientX, clientY);
    const act = t?.dataset.act;
    if (!t || !act || t.classList.contains('is-dis')) return;
    if (act.startsWith('air:')) {
      const on = act === 'air:1';
      const g = this.app.gesture;
      if (g.airMouse.enabled !== on) this.app.setConfig({ gesture: { ...g, airMouse: { ...g.airMouse, enabled: on } } });
      this.update(this.app.state);
    } else if (act.startsWith('sens:')) {
      this.app.dispatch({ t: 'setSensitivity', level: Number(act.slice(5)) });
    } else if (act.startsWith('os:')) {
      this.app.dispatch({ t: 'setOs', os: act.slice(3) as OsId });
    } else if (act === 'name') {
      this.showPicker();
    } else if (act === 'close') {
      this.close();
    } else if (act.startsWith('pick:')) {
      const name = t.dataset.name ?? '';
      if (!name || name === this.app.deviceName) {
        this.hidePicker();
      } else if (this.app.connected) {
        this.pendingName = name;
        setText(this.dlgOld, this.app.deviceName);
        setText(this.dlgNew, name);
        this.dialog.classList.remove('is-hidden');
      } else {
        this.applyName(name); // 끊김 중에는 확인 없이 바로 적용(design 1.5)
      }
    } else if (act === 'pick-cancel') {
      this.hidePicker();
    } else if (act === 'dlg-cancel') {
      this.pendingName = null;
      this.dialog.classList.add('is-hidden');
    } else if (act === 'dlg-ok') {
      const n = this.pendingName;
      this.pendingName = null;
      this.dialog.classList.add('is-hidden');
      if (n) this.applyName(n);
    }
  }

  private applyName(name: string): void {
    this.applyingUntil = this.app.now() + 2000;
    this.app.setDeviceName(name);
    this.hidePicker();
    this.hooks.toast(t('toast.renamed'));
    setTimeout(() => this.update(this.app.state), 2050);
  }
}
