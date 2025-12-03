# ============================================================
# SCRIPT CHUẨN BỊ MÔI TRƯỜNG TRƯỚC KHI LOAD TEST
# ============================================================
# Chạy script này TRƯỚC khi bắt đầu load test để đảm bảo
# Docker containers có đủ resources và hoạt động tốt nhất.
# ============================================================

Write-Host "`n🚀 CHUẨN BỊ MÔI TRƯỜNG LOAD TEST" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# 1. Kiểm tra Docker Desktop đang chạy
Write-Host "1️⃣ Kiểm tra Docker Desktop..." -ForegroundColor Yellow
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker Desktop chưa chạy! Vui lòng khởi động Docker Desktop." -ForegroundColor Red
    Write-Host "   Mở Docker Desktop từ Start Menu hoặc chạy: Start-Process 'Docker Desktop'" -ForegroundColor Gray
    exit 1
}
Write-Host "   ✅ Docker Desktop đang chạy" -ForegroundColor Green

# 2. Đóng các ứng dụng không cần thiết
Write-Host "`n2️⃣ Giải phóng tài nguyên..." -ForegroundColor Yellow
Write-Host "   💡 Khuyến nghị đóng các ứng dụng nặng:" -ForegroundColor Gray
Write-Host "      - Chrome (nếu mở nhiều tab)" -ForegroundColor Gray
Write-Host "      - Visual Studio Code (giữ 1 window)" -ForegroundColor Gray
Write-Host "      - Teams, Slack, Discord..." -ForegroundColor Gray

# 3. Restart containers để clear memory
Write-Host "`n3️⃣ Restart containers để clear cache..." -ForegroundColor Yellow
Write-Host "   Đang restart driver-service và api-gateway..." -ForegroundColor Gray

Set-Location -Path "e:\Nam_3_HK1\Cloud\uit-go"

docker-compose restart driver-service api-gateway driver-redis 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ Containers đã restart thành công" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Lỗi restart - Đang rebuild containers..." -ForegroundColor Yellow
    docker-compose up -d driver-service api-gateway driver-redis
}

# 4. Đợi containers sẵn sàng
Write-Host "`n4️⃣ Đợi containers khởi động..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 5. Kiểm tra health
Write-Host "`n5️⃣ Kiểm tra health của services..." -ForegroundColor Yellow

# Test API Gateway
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/api/drivers/2/location" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ API Gateway: OK" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️ API Gateway: Đang khởi động..." -ForegroundColor Yellow
}

# Test Redis
$redisCheck = docker exec driver-redis redis-cli ping 2>$null
if ($redisCheck -eq "PONG") {
    Write-Host "   ✅ Redis: OK" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ Redis: Đang khởi động..." -ForegroundColor Yellow
}

# 6. Hiển thị thông tin resources
Write-Host "`n6️⃣ Thông tin Docker containers:" -ForegroundColor Yellow
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" driver-service api-gateway driver-redis 2>$null

# 7. Tips
Write-Host "`n" -NoNewline
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   📋 TIPS ĐỂ PASS LOAD TEST:" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   
   1. ĐẢM BẢO CÓ ĐỦ TÀI NGUYÊN:
      • Đóng Chrome, VS Code (giữ 1 window)
      • Đóng Postman, pgAdmin, Teams, Slack
      • Không chạy các ứng dụng nặng khác
   
   2. TĂNG DOCKER RESOURCES:
      • Mở Docker Desktop → Settings → Resources
      • CPUs: 4-6 cores
      • Memory: 8-12 GB
      • Swap: 2-4 GB
   
   3. SỬ DỤNG FILE TEST LOCAL:
      • k6 run 02-load-test-local.js   (thay vì 02-load-test.js)
      • k6 run 03-stress-test-local.js (thay vì 03-stress-test.js)
   
   4. CHẠY TEST TUẦN TỰ:
      • Chạy smoke-test trước
      • Đợi 30s, chạy load-test-local
      • Đợi 60s, chạy stress-test-local
" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host "`n✅ SẴN SÀNG CHẠY LOAD TEST!" -ForegroundColor Green
Write-Host "   Chạy: cd modules\driver-service\load-tests" -ForegroundColor Gray
Write-Host "   Rồi:  k6 run 02-load-test-local.js" -ForegroundColor Gray
Write-Host ""
