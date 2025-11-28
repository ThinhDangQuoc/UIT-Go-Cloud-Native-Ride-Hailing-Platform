#!/bin/bash
# =====================================================
# Quick Load Test Runner
# =====================================================

set -e

# Configuration
BASE_URL=${BASE_URL:-"http://localhost:8080"}
JWT_TOKEN=${JWT_TOKEN:-"test-jwt-token"}
RESULTS_DIR="./results/$(date +%Y%m%d_%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create results directory
mkdir -p "$RESULTS_DIR"

echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           DRIVER LOCATION UPDATE - LOAD TEST RUNNER              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Base URL: ${YELLOW}$BASE_URL${NC}"
echo -e "Results Directory: ${YELLOW}$RESULTS_DIR${NC}"
echo ""

# Function to run test
run_test() {
    local test_name=$1
    local test_file=$2
    local extra_args=$3
    
    echo -e "${YELLOW}Running $test_name...${NC}"
    
    k6 run \
        --env BASE_URL="$BASE_URL" \
        --env JWT_TOKEN="$JWT_TOKEN" \
        --out json="$RESULTS_DIR/${test_name}.json" \
        $extra_args \
        "$test_file"
    
    echo -e "${GREEN}✓ $test_name completed${NC}"
    echo ""
}

# Parse arguments
case "$1" in
    smoke)
        echo "Running Smoke Test..."
        run_test "smoke-test" "location-update-load-test.js" "--duration 1m --vus 10"
        ;;
    
    load)
        echo "Running Load Test (10k req/s target)..."
        run_test "load-test" "location-update-load-test.js"
        ;;
    
    stress)
        echo "Running Stress Test (find breaking point)..."
        run_test "stress-test" "stress-test.js"
        ;;
    
    soak)
        echo "Running Soak Test (2 hours)..."
        echo -e "${RED}⚠ This will run for 2 hours!${NC}"
        read -p "Continue? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            run_test "soak-test" "soak-test.js"
        else
            echo "Cancelled"
            exit 0
        fi
        ;;
    
    all)
        echo "Running all tests sequentially..."
        run_test "smoke-test" "location-update-load-test.js" "--duration 1m --vus 10"
        run_test "load-test" "location-update-load-test.js"
        run_test "stress-test" "stress-test.js"
        echo -e "${GREEN}All tests completed!${NC}"
        ;;
    
    *)
        echo "Usage: $0 {smoke|load|stress|soak|all}"
        echo ""
        echo "Tests:"
        echo "  smoke   - Quick validation (10 VUs, 1 min)"
        echo "  load    - Full load test (1000 VUs, 10 min)"
        echo "  stress  - Find breaking point (up to 25k req/s)"
        echo "  soak    - Endurance test (5000 req/s, 2 hours)"
        echo "  all     - Run smoke, load, and stress tests"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Results saved to: $RESULTS_DIR${NC}"
echo ""
echo "View results:"
echo "  cat $RESULTS_DIR/*.json | jq '.'"
