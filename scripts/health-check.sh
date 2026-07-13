#!/bin/bash
set -e

echo "=== Running DevOps Control Center Health Checks ==="

check_endpoint() {
    local name=$1
    local url=$2
    echo -n "Checking $name ($url)... "
    if curl -sf "$url" > /dev/null; then
        echo "OK"
    else
        echo "FAILED"
        return 1
    fi
}

FAILED=0

check_endpoint "Agent" "http://localhost:3011/health" || FAILED=1
check_endpoint "Orchestrator" "http://localhost:8090/health" || FAILED=1
check_endpoint "Frontend" "http://localhost:8085" || FAILED=1
check_endpoint "Prometheus" "http://localhost:9091/-/healthy" || FAILED=1
check_endpoint "Grafana" "http://localhost:3010/api/health" || FAILED=1
check_endpoint "Node Exporter" "http://localhost:9101/" || FAILED=1

if [ $FAILED -eq 0 ]; then
    echo "=== All checks PASSED ==="
    exit 0
else
    echo "=== Some checks FAILED ==="
    exit 1
fi
