# 손목 컨트롤러 — PC 바로 가기 키 설정 (Windows 10/11, 관리자 권한 필요 없음)
#
# 시계 실행 모드 1쪽 타일은 Ctrl+Alt+1~6 을 보낸다. 이 스크립트는 사용자 시작 메뉴
#   %APPDATA%\Microsoft\Windows\Start Menu\Programs\손목 컨트롤러
# 에 바로 가기(.lnk) 6개를 만들고 각각 바로 가기 키 Ctrl+Alt+1~6 을 준다.
#   1 Claude · 2 카카오톡 · 3 크롬 · 4 파워포인트 · 5 엑셀 · 6 한글
# 실행 파일 경로를 찾지 않고, 시작 메뉴 앱 목록(Get-StartApps)의 AppID 를
#   explorer.exe "shell:AppsFolder\<AppID>"
# 로 연다 — 스토어 앱(Claude 데스크톱)·카카오톡·한글 모두 같은 방식으로 된다.
# 다시 실행하면 같은 이름의 바로 가기를 덮어쓴다. 못 찾은 앱은 건너뛰고 화면에 알려 준다.
#
# 실행: 파일을 오른쪽 클릭 → 'PowerShell 에서 실행'
#   또는 PowerShell 창에서:  powershell -ExecutionPolicy Bypass -File .\wrist-shortcuts.ps1
# 실행한 뒤 바로 가기 키가 안 먹으면 로그아웃 후 다시 로그인한다(탐색기가 바로 가기 키를 다시 읽는다).
#
# 이 파일은 UTF-8(BOM 포함)이어야 한다 — Windows PowerShell 5.1 은 BOM 없는 UTF-8 한글을 깨뜨린다.

$ErrorActionPreference = 'Stop'
$apps = @(
  @{ n = 1; name = 'Claude';     match = '^Claude$';        prefer = 'Claude_' },  # Chrome PWA(Chrome._crx_…)보다 데스크톱 앱 우선
  @{ n = 2; name = '카카오톡';   match = '^(카카오톡|KakaoTalk)$' },
  @{ n = 3; name = '크롬';       match = '^Google Chrome$' },
  @{ n = 4; name = '파워포인트'; match = '^PowerPoint' },
  @{ n = 5; name = '엑셀';       match = '^Excel' },
  @{ n = 6; name = '한글';       match = '^(한글|Hwp|Hangul)' }
)

$dir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\손목 컨트롤러'
New-Item -ItemType Directory -Force $dir | Out-Null
$sh = New-Object -ComObject WScript.Shell
$start = Get-StartApps
$made = 0
$skipped = @()

Write-Output '손목 컨트롤러 — 바로 가기 키 만들기'
Write-Output "폴더: $dir"
Write-Output ''
foreach ($a in $apps) {
  $cand = @($start | Where-Object { $_.Name -match $a.match })
  if ($a.prefer) {
    $p = @($cand | Where-Object { $_.AppID -like "$($a.prefer)*" })
    if ($p.Count -gt 0) { $cand = $p }
  }
  $app = $cand | Select-Object -First 1
  if (-not $app) {
    Write-Output ("  건너뜀  Ctrl+Alt+{0}  {1}  (시작 메뉴에서 못 찾음 — 설치돼 있는지 확인)" -f $a.n, $a.name)
    $skipped += $a.name
    continue
  }
  # 옛 바로 가기(번호가 같은 것)는 지우고 다시 만든다 — 같은 키가 두 개 있으면 Windows 가 하나만 쓴다
  Get-ChildItem -Path $dir -Filter ("{0} *.lnk" -f $a.n) -ErrorAction SilentlyContinue | Remove-Item -Force
  $lnk = $sh.CreateShortcut((Join-Path $dir ("{0} {1}.lnk" -f $a.n, $a.name)))
  $lnk.TargetPath = "$env:WINDIR\explorer.exe"
  $lnk.Arguments = "shell:AppsFolder\$($app.AppID)"
  $lnk.Hotkey = "CTRL+ALT+$($a.n)"
  $lnk.Description = "손목 컨트롤러 실행 타일 $($a.n) ($($a.name))"
  $lnk.Save()
  $made++
  Write-Output ("  만듦    Ctrl+Alt+{0}  {1}  ({2})" -f $a.n, $a.name, $app.AppID)
}

Write-Output ''
Write-Output ("완료: {0}개 만듦, {1}개 건너뜀{2}" -f $made, $skipped.Count, $(if ($skipped.Count) { ' — ' + ($skipped -join ', ') } else { '' }))
Write-Output '바로 가기 키가 바로 안 먹으면 로그아웃 후 다시 로그인하세요.'
if ($Host.Name -eq 'ConsoleHost') { Read-Host '창을 닫으려면 Enter' | Out-Null }
