#!/usr/bin/env bash
# Retry wrapper with adaptive timeout for flaky test mitigation

set -euo pipefail

# Error handling - report line number on failure
# Note: This trap is disabled when set +e is active (during intentional retry handling)
trap 'echo "[ERROR] with-retry.sh failed unexpectedly on line $LINENO (exit code: $?)" >&2; exit 1' ERR

# Configuration (with safe defaults for unset variables)
CMD="${*:-echo 'No command provided'}"
SOFT_TIMEOUT="${TIMEOUT_SOFT:-10m}"
HARD_TIMEOUT="${TIMEOUT_HARD:-20m}"
MAX_RETRIES="${MAX_RETRIES:-1}"
RETRY_DELAY="${RETRY_DELAY:-2}"

# Colors for output (if terminal supports it)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

# Helper functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1" >&2
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1" >&2
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Execute command with timeout
run_with_timeout() {
  local timeout="${1:-10m}"
  shift
  
  if command -v timeout >/dev/null 2>&1; then
    timeout "$timeout" bash -c "$*"
  else
    # Fallback for systems without GNU timeout
    bash -c "$*" &
    local pid=$!
    
    # Convert timeout to seconds
    local seconds
    if [[ "$timeout" =~ ^([0-9]+)m$ ]]; then
      seconds=$((${BASH_REMATCH[1]} * 60))
    elif [[ "$timeout" =~ ^([0-9]+)s$ ]]; then
      seconds=${BASH_REMATCH[1]}
    else
      seconds=600 # Default 10 minutes
    fi
    
    local count=0
    while kill -0 "$pid" 2>/dev/null; do
      if [[ $count -ge $seconds ]]; then
        kill -TERM "$pid" 2>/dev/null || true
        sleep 2
        kill -KILL "$pid" 2>/dev/null || true
        return 124 # Timeout exit code
      fi
      sleep 1
      ((count++)) || true  # Prevent exit on arithmetic returning 0
    done
    
    wait "$pid"
  fi
}

# Main execution
attempt=0
exit_code=0

while [[ $attempt -le $MAX_RETRIES ]]; do
  if [[ $attempt -gt 0 ]]; then
    log_warn "Retry attempt $attempt/$MAX_RETRIES after ${RETRY_DELAY}s delay..."
    sleep "$RETRY_DELAY"
  fi
  
  # Try with soft timeout first
  # Disable errexit for intentional failure handling
  set +e
  if [[ $attempt -eq 0 ]]; then
    log_info "Running: $CMD"
    log_info "Timeout: $SOFT_TIMEOUT (soft), $HARD_TIMEOUT (hard)"
    run_with_timeout "$SOFT_TIMEOUT" "$CMD"
    exit_code=$?
  else
    # Use hard timeout on retries
    run_with_timeout "$HARD_TIMEOUT" "$CMD"
    exit_code=$?
  fi
  set -e
  
  # Check exit code
  case $exit_code in
    0)
      log_info "Command succeeded"
      exit 0
      ;;
    124|137)
      # Timeout occurred
      if [[ $attempt -eq 0 ]]; then
        log_warn "Soft timeout reached, extending to $HARD_TIMEOUT"
        # Don't count this as a retry, just extend timeout
        ((attempt--)) || true  # Prevent exit on arithmetic returning 0
      else
        log_error "Hard timeout reached"
        if [[ $attempt -lt $MAX_RETRIES ]]; then
          log_warn "Will retry..."
        fi
      fi
      ;;
    *)
      # Other failure
      log_error "Command failed with exit code $exit_code"
      if [[ $attempt -lt $MAX_RETRIES ]]; then
        log_warn "Possible flake detected, will retry..."
      fi
      ;;
  esac
  
  ((attempt++)) || true  # Prevent exit on arithmetic returning 0
done

# All retries exhausted
log_error "Command failed after $MAX_RETRIES retries"
exit "$exit_code"
