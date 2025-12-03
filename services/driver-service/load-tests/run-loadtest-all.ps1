# ============================================================
# SCRIPT CHẠY LOAD TEST VỚI SCALED ENVIRONMENT
# ============================================================
# Script này khởi động môi trường với 3 driver-service instances
# và chạy các bài test tuần tự.
# ============================================================

param(
    [switch]$SkipBuild,
    [switch]$ScaledEnv,
    [string]$Test = "all"
)

$ErrorActionPreference = "Continue"
Set-Location -Path "e:\Nam_3_HK1\Cloud\uit-go"

Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           🚀 LOAD TEST RUNNER - UIT-GO                       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ============================================================
# OPTION 1: Chạy với Scaled Environment (3 instances)
# ============================================================
if ($ScaledEnv) {
    Write-Host "`n📦 SCALED ENVIRONMENT MODE (3 driver-service instances)" -ForegroundColor Yellow
    
    # Stop existing containers
    Write-Host "`n1️⃣ Dừng containers cũ..." -ForegroundColor Gray
    docker-compose down 2>$null
    docker-compose -f docker-compose.loadtest.yml down 2>$null
    
    # Build và start scaled environment
    if (-not $SkipBuild) {
        Write-Host "`n2️⃣ Build images..." -ForegroundColor Gray
        docker-compose -f docker-compose.loadtest.yml build
    }
    
    Write-Host "`n3️⃣ Khởi động scaled environment..." -ForegroundColor Gray
    docker-compose -f docker-compose.loadtest.yml up -d
    
    Write-Host "`n4️⃣ Đợi services khởi động (30s)..." -ForegroundColor Gray
    Start-Sleep -Seconds 30
    
    # Check containers
    Write-Host "`n5️⃣ Kiểm tra containers:" -ForegroundColor Gray
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "driver|nginx|redis"
}
else {
    # ============================================================
    # OPTION 2: Chạy với Single Instance (Default)
    # ============================================================
    Write-Host "`n📦 SINGLE INSTANCE MODE" -ForegroundColor Yellow
    
    # Restart containers
    Write-Host "`n1️⃣ Restart containers để clear memory..." -ForegroundColor Gray
    docker-compose restart driver-service api-gateway driver-redis 2>$null
    
    Write-Host "`n2️⃣ Đợi services khởi động (10s)..." -ForegroundColor Gray
    Start-Sleep -Seconds 10
}

# ============================================================
# HEALTH CHECK
# ============================================================
Write-Host "`n🔍 Health Check..." -ForegroundColor Yellow

$maxRetries = 10
$retry = 0
$healthy = $false

while ($retry -lt $maxRetries -and -not $healthy) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/api/drivers/2/location" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            Write-Host "   ✅ API Gateway sẵn sàng!" -ForegroundColor Green
        }
    } catch {
        $retry++
        Write-Host "   ⏳ Đợi API Gateway... ($retry/$maxRetries)" -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
}

if (-not $healthy) {
    Write-Host "   ❌ API Gateway không phản hồi!" -ForegroundColor Red
    exit 1
}

# ============================================================
# RUN TESTS
# ============================================================
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "                    🧪 CHẠY LOAD TESTS                         " -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Green

Set-Location -Path "e:\Nam_3_HK1\Cloud\uit-go\modules\driver-service\load-tests"

# SMOKE TEST
if ($Test -eq "all" -or $Test -eq "smoke") {
    Write-Host "`n▶️  SMOKE TEST (1 phút)..." -ForegroundColor Cyan
    k6 run 01-smoke-test.js
    Write-Host "`n⏳ Nghỉ 15s trước test tiếp theo..." -ForegroundColor Gray
    Start-Sleep -Seconds 15
}

# LOAD TEST (Local optimized)
if ($Test -eq "all" -or $Test -eq "load") {
    Write-Host "`n▶️  LOAD TEST - LOCAL OPTIMIZED (4 phút)..." -ForegroundColor Cyan
    k6 run 02-load-test-local.js
    Write-Host "`n⏳ Nghỉ 30s trước test tiếp theo..." -ForegroundColor Gray
    Start-Sleep -Seconds 30
}

# STRESS TEST (Local optimized)
if ($Test -eq "all" -or $Test -eq "stress") {
    Write-Host "`n▶️  STRESS TEST - LOCAL OPTIMIZED (3 phút)..." -ForegroundColor Cyan
    k6 run 03-stress-test-local.js
}

# ============================================================
# SUMMARY
# ============================================================
Write-Host "`n" -NoNewline
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    ✅ HOÀN TẤT LOAD TEST                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green

# Show container stats
Write-Host "`n📊 Docker Stats sau khi test:" -ForegroundColor Yellow
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>$null | Select-String -Pattern "driver|nginx|redis|gateway"

Write-Host "`n💡 Tips:" -ForegroundColor Gray
Write-Host "   • Chạy với scaled env: .\run-loadtest-all.ps1 -ScaledEnv" -ForegroundColor Gray
Write-Host "   • Chỉ chạy 1 test: .\run-loadtest-all.ps1 -Test smoke" -ForegroundColor Gray
Write-Host "   • Skip build: .\run-loadtest-all.ps1 -ScaledEnv -SkipBuild" -ForegroundColor Gray
Write-Host ""
