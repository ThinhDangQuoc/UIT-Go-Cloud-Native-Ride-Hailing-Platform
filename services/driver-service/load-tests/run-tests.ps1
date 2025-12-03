# PowerShell Load Test Runner for Windows
# =====================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("smoke", "load", "stress", "soak", "all")]
    [string]$TestType = "smoke",
    
    [string]$BaseUrl = "http://localhost:8080",
    [string]$JwtToken = "test-jwt-token"
)

$ErrorActionPreference = "Stop"

# Configuration
$ResultsDir = ".\results\$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null

Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           DRIVER LOCATION UPDATE - LOAD TEST RUNNER              ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Base URL: $BaseUrl" -ForegroundColor Yellow
Write-Host "Results Directory: $ResultsDir" -ForegroundColor Yellow
Write-Host ""

function Run-Test {
    param(
        [string]$TestName,
        [string]$TestFile,
        [string]$ExtraArgs = ""
    )
    
    Write-Host "Running $TestName..." -ForegroundColor Yellow
    
    $env:BASE_URL = $BaseUrl
    $env:JWT_TOKEN = $JwtToken
    
    $command = "k6 run --out json=`"$ResultsDir\$TestName.json`" $ExtraArgs `"$TestFile`""
    Invoke-Expression $command
    
    Write-Host "✓ $TestName completed" -ForegroundColor Green
    Write-Host ""
}

switch ($TestType) {
    "smoke" {
        Write-Host "Running Smoke Test..." -ForegroundColor Cyan
        Run-Test -TestName "smoke-test" -TestFile "location-update-load-test.js" -ExtraArgs "--duration 1m --vus 10"
    }
    
    "load" {
        Write-Host "Running Load Test (10k req/s target)..." -ForegroundColor Cyan
        Run-Test -TestName "load-test" -TestFile "location-update-load-test.js"
    }
    
    "stress" {
        Write-Host "Running Stress Test (find breaking point)..." -ForegroundColor Cyan
        Run-Test -TestName "stress-test" -TestFile "stress-test.js"
    }
    
    "soak" {
        Write-Host "Running Soak Test (2 hours)..." -ForegroundColor Cyan
        Write-Host "⚠ This will run for 2 hours!" -ForegroundColor Red
        $confirm = Read-Host "Continue? (y/n)"
        if ($confirm -eq 'y') {
            Run-Test -TestName "soak-test" -TestFile "soak-test.js"
        } else {
            Write-Host "Cancelled" -ForegroundColor Yellow
            exit
        }
    }
    
    "all" {
        Write-Host "Running all tests sequentially..." -ForegroundColor Cyan
        Run-Test -TestName "smoke-test" -TestFile "location-update-load-test.js" -ExtraArgs "--duration 1m --vus 10"
        Run-Test -TestName "load-test" -TestFile "location-update-load-test.js"
        Run-Test -TestName "stress-test" -TestFile "stress-test.js"
        Write-Host "All tests completed!" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Results saved to: $ResultsDir" -ForegroundColor Green
Write-Host ""
Write-Host "View results:"
Write-Host "  Get-Content $ResultsDir\*.json | ConvertFrom-Json"
