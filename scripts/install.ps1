<#
  install.ps1 — Bootstrap 1 LỆNH cho Hi-CRM trên WINDOWS (PowerShell, không cần WSL thủ công).

  Tự động: kiểm tra Docker Desktop + Git → cài qua winget nếu thiếu → TẢI mã nguồn (clone)
  nếu CÀI MỚI / git pull nếu ĐÃ CÓ → gọi lại scripts\zalocrm-deploy.sh qua Git Bash
  (tái dùng đúng logic deploy: sinh .env, backup DB, build, migrate, health).

  Đặt repo nguồn qua biến môi trường trước khi chạy:
    $env:ZCRM_REPO = "<git-url>"

  Tuỳ biến (đặt biến môi trường trước khi chạy):
    $env:ZCRM_DIR    = "D:\zcrm"   # thư mục cài (mặc định: %USERPROFILE%\zcrm)
    $env:ZCRM_BRANCH = "main"      # nhánh git (mặc định: main)
    $env:SKIP_DEPLOY = "1"         # chỉ tải/cập nhật nguồn, KHÔNG deploy

  Yêu cầu: Windows 10/11 (winget), Docker Desktop (bật WSL2 backend khi cài).
#>
$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:ZCRM_REPO)   { $env:ZCRM_REPO }   else { '' }
$AppDir  = if ($env:ZCRM_DIR)    { $env:ZCRM_DIR }    else { Join-Path $env:USERPROFILE 'zcrm' }
$Branch  = if ($env:ZCRM_BRANCH) { $env:ZCRM_BRANCH } else { 'main' }

function Log  ($m) { Write-Host "▶ $m" -ForegroundColor Cyan }
function Ok   ($m) { Write-Host "✓ $m" -ForegroundColor Green }
function Warn ($m) { Write-Host "⚠ $m" -ForegroundColor Yellow }
function Die  ($m) { Write-Host "✗ $m" -ForegroundColor Red; exit 1 }
function Have ($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

function Install-WithWinget ($id, $name) {
  if (-not (Have winget)) { Die "Thiếu '$name' và không có 'winget'. Cài $name thủ công rồi chạy lại." }
  Log "Cài $name qua winget ($id)…"
  winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
  # Nạp lại PATH cho phiên hiện tại.
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}

# ── Git (kèm Git Bash + perl/openssl/curl để chạy deploy.sh) ────────────────────
function Ensure-Git {
  if (Have git) { Ok "Git đã có."; return }
  Install-WithWinget 'Git.Git' 'Git for Windows'
  if (-not (Have git)) { Die "Git vẫn chưa sẵn sàng — mở PowerShell mới rồi chạy lại." }
  Ok "Đã cài Git."
}

# Tìm bash.exe của Git for Windows (KHÔNG dùng bash.exe của WSL để tránh nhầm distro).
function Get-GitBash {
  $cands = @(
    "$env:ProgramFiles\Git\bin\bash.exe",
    "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
    "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
  )
  foreach ($p in $cands) { if (Test-Path $p) { return $p } }
  $g = Get-Command git -ErrorAction SilentlyContinue
  if ($g) { $b = Join-Path (Split-Path (Split-Path $g.Source)) 'bin\bash.exe'; if (Test-Path $b) { return $b } }
  return $null
}

# ── Docker Desktop ──────────────────────────────────────────────────────────────
function Ensure-Docker {
  if (-not (Have docker)) {
    Install-WithWinget 'Docker.DockerDesktop' 'Docker Desktop'
    Warn "Docker Desktop vừa cài — có thể cần ĐĂNG XUẤT/khởi động lại Windows + mở Docker Desktop 1 lần (chấp nhận điều khoản, bật WSL2)."
  } else { Ok "Docker đã có." }
  # Khởi động Docker Desktop nếu daemon chưa chạy.
  if (-not (Test-Docker)) {
    $dd = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dd) { Log "Khởi động Docker Desktop…"; Start-Process $dd | Out-Null }
  }
  Log "Chờ Docker daemon sẵn sàng (tối đa ~120s)…"
  for ($i=0; $i -lt 60; $i++) { if (Test-Docker) { Ok "Docker daemon sẵn sàng."; return }; Start-Sleep 2 }
  Die "Docker daemon chưa chạy. Mở 'Docker Desktop', đợi khởi động xong rồi chạy lại lệnh này."
}
function Test-Docker { try { docker info *> $null; return ($LASTEXITCODE -eq 0) } catch { return $false } }

function Ensure-Compose {
  docker compose version *> $null
  if ($LASTEXITCODE -ne 0) { Die "Thiếu Docker Compose v2. Cập nhật Docker Desktop (đã kèm 'docker compose')." }
  Ok "Docker Compose v2 đã có."
}

# ── Tải mã nguồn: clone (mới) / pull (đã có) ────────────────────────────────────
function Fetch-Source {
  if (Test-Path (Join-Path $AppDir '.git')) {
    Log "Đã có mã nguồn ở '$AppDir' → CẬP NHẬT (git pull)…"
    git -C $AppDir fetch --depth 1 origin $Branch -q
    git -C $AppDir reset --hard "origin/$Branch" -q
    Ok "Đã cập nhật mã nguồn nhánh $Branch."
  } elseif (Test-Path $AppDir) {
    Die "'$AppDir' đã tồn tại nhưng không phải repo git. Chọn `$env:ZCRM_DIR khác."
  } else {
    Log "TẢI mã nguồn về '$AppDir' (clone nhánh $Branch)…"
    git clone --depth 1 -b $Branch $RepoUrl $AppDir -q
    Ok "Đã tải mã nguồn."
  }
}

# ── Luồng chính ─────────────────────────────────────────────────────────────────
Write-Host "═══════════════════════════════════════════════"
Write-Host "  Hi-CRM — Cài đặt / Cập nhật TỰ ĐỘNG (Windows)"
Write-Host "═══════════════════════════════════════════════"
Log "Thư mục cài: $AppDir   |   Nhánh: $Branch"

Ensure-Git
Ensure-Docker
Ensure-Compose
Fetch-Source

if ($env:SKIP_DEPLOY -eq '1') {
  Warn "SKIP_DEPLOY=1 → đã tải/cập nhật mã nguồn ở '$AppDir', BỎ QUA deploy."
} else {
  $bash = Get-GitBash
  if (-not $bash) { Die "Không tìm thấy Git Bash (bash.exe). Cài lại Git for Windows rồi chạy lại." }
  Log "Chạy deploy qua Git Bash (tự phát hiện cài mới / nâng cấp)…"
  Push-Location $AppDir
  try {
    & $bash -lc "cd ""$($AppDir -replace '\\','/')"" && ./scripts/zalocrm-deploy.sh auto"
    if ($LASTEXITCODE -ne 0) { Die "Deploy thất bại (mã $LASTEXITCODE). Xem log phía trên / 'docker logs zalo-crm-app'." }
  } finally { Pop-Location }
}

Write-Host ""
Ok "HOÀN TẤT. Mã nguồn tại: $AppDir"
# Port có thể đã đổi nếu 3080 bận — đọc APP_PORT thật từ .env.
$appPort = '3080'
$envFile = Join-Path $AppDir '.env'
if (Test-Path $envFile) {
  $m = Select-String -Path $envFile -Pattern '^APP_PORT=(\d+)' | Select-Object -First 1
  if ($m) { $appPort = $m.Matches[0].Groups[1].Value }
}
Write-Host "→ Mở http://localhost:$appPort → trang /setup tạo tổ chức + tài khoản chủ."
Write-Host "→ Hướng dẫn sử dụng: https://docs.your-domain.com/"
