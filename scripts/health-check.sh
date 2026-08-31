#!/bin/bash
set -e

echo "=== Running DevOps Control Center Health Checks ==="

check_endpoint() {
    local name=$1
    local url=$2
    local max_attempts=${3:-1}
    local delay=${4:-2}
    
    echo -n "Checking $name ($url)... "
    for ((attempt=1; attempt<=max_attempts; attempt++)); do
        if curl -sf "$url" > /dev/null; then
            echo "OK"
            return 0
        fi
        if [ $attempt -lt $max_attempts ]; then
            echo -n "(retrying $attempt/$max_attempts)... "
            sleep $delay
        fi
    done
    echo "FAILED"
    return 1
}

FAILED=0

# The Agent should use /livez since /health returns 503 when Kubernetes is not configured
check_endpoint "Agent" "http://localhost:3011/livez" || FAILED=1

# The Orchestrator takes up to 30-40 seconds to boot up. We will give it 15 attempts with 3s delay.
check_endpoint "Orchestrator" "http://localhost:8090/health" 15 3 || FAILED=1

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
