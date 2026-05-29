#!/usr/bin/env bash

set -euo pipefail

PACKAGE_NAME="@teamolab/teamo-cli"
REQUESTED_TARGET="${1:-latest}"
TARGET="${REQUESTED_TARGET}"
# TARGET="0.1.10"
TELEMETRY_URL="${TEAMO_TELEMETRY_URL:-https://teamocode.com/api/v1/telemetry/events}"
INSTALL_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
INSTALL_STARTED_EPOCH="$(date +%s)"
INSTALL_EVENT_ID="teamo-install-$(date +%s)-$$-${RANDOM}"
INSTALL_PLATFORM="$(uname -s 2>/dev/null || echo unknown)"
INSTALL_ARCH="$(uname -m 2>/dev/null || echo unknown)"
ORIGINAL_PATH="${PATH}"

usage() {
  cat >&2 <<'EOF'
Usage: ./install.sh [latest|VERSION]

Examples:
  ./install.sh
  ./install.sh latest
  ./install.sh 0.1.0
EOF
}

now_utc_iso() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

json_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "${value}"
}

install_duration_seconds() {
  echo $(( $(date +%s) - INSTALL_STARTED_EPOCH ))
}

send_install_telemetry() {
  local event="$1"
  local result="$2"
  local stage="$3"
  local detail="${4:-}"
  local exit_code="${5:-0}"
  local installed_version="${6:-}"
  local node_version="${7:-}"
  local npm_version="${8:-}"

  local payload="" timestamp="" duration_seconds="" interactive_flag="false"
  if [[ -t 1 ]]; then
    interactive_flag="true"
  fi

  timestamp="$(now_utc_iso)"
  duration_seconds="$(install_duration_seconds)"
  payload="$(cat <<EOF
{"eventId":"$(json_escape "${INSTALL_EVENT_ID}")","event":"$(json_escape "${event}")","timestamp":"$(json_escape "${timestamp}")","client":"teamo-cli","clientVersion":"$(json_escape "${installed_version}")","deviceInfo":{"platform":"$(json_escape "${INSTALL_PLATFORM}")","arch":"$(json_escape "${INSTALL_ARCH}")","nodeVersion":"$(json_escape "${node_version}")"},"properties":{"target":"$(json_escape "${TARGET}")","requestedTarget":"$(json_escape "${REQUESTED_TARGET}")","packageName":"$(json_escape "${PACKAGE_NAME}")","installSpec":"$(json_escape "${PACKAGE_NAME}@${TARGET}")","result":"$(json_escape "${result}")","stage":"$(json_escape "${stage}")","detail":"$(json_escape "${detail}")","exitCode":${exit_code},"durationSeconds":${duration_seconds},"startedAt":"$(json_escape "${INSTALL_STARTED_AT}")","finishedAt":"$(json_escape "${timestamp}")","interactive":${interactive_flag},"npmVersion":"$(json_escape "${npm_version}")","nodeAutoInstallAttempted":${NODE_AUTO_INSTALL_ATTEMPTED:-false},"nodeAutoInstallMethod":"$(json_escape "${NODE_AUTO_INSTALL_METHOD:-}")","nodeAutoInstallResult":"$(json_escape "${NODE_AUTO_INSTALL_RESULT:-}")","nodePreInstallVersion":"$(json_escape "${NODE_PRE_INSTALL_VERSION:-}")","telemetrySource":"public_install_script_v1","path":"/install.sh"}}
EOF
)"

  if command -v curl >/dev/null 2>&1; then
    curl --silent --output /dev/null \
      --connect-timeout 2 --max-time 4 \
      -H "Content-Type: application/json" \
      -X POST \
      --data-binary "${payload}" \
      "${TELEMETRY_URL}" >/dev/null 2>&1 || true
    return 0
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet \
      --output-document=/dev/null \
      --header="Content-Type: application/json" \
      --method=POST \
      --body-data="${payload}" \
      "${TELEMETRY_URL}" >/dev/null 2>&1 || true
  fi
}

fail_install() {
  local stage="$1"
  local detail="$2"
  local exit_code="${3:-1}"
  local installed_version="${4:-}"
  local node_version="${5:-}"
  local npm_version="${6:-}"
  send_install_telemetry "install.failed" "failed" "${stage}" "${detail}" "${exit_code}" "${installed_version}" "${node_version}" "${npm_version}"
  exit "${exit_code}"
}

# ANSI color codes — only enabled when stderr is a TTY so redirected output
# (CI logs, file redirects) stays clean.
if [[ -t 2 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET="" C_BOLD="" C_RED="" C_YELLOW="" C_CYAN=""
fi

# Visual hierarchy on stderr:
#   bold red    → what went wrong (error headline)
#   bold yellow → what to do next (recovery section header)
#   plain       → body text, commands, npm output

# Print a bold-red error headline.
print_error_header() {
  printf '%s%s%s%s\n' "${C_BOLD}" "${C_RED}" "$1" "${C_RESET}" >&2
}

# Print a highlighted recovery section header, surrounded by blank lines.
print_section_header() {
  printf '\n%s%s%s%s\n' "${C_BOLD}" "${C_YELLOW}" "$1" "${C_RESET}" >&2
}

# Print install instructions for Node.js 18+.
print_node_install_help() {
  print_section_header "Install Node.js 18+:"
  cat >&2 <<'EOF'
  Download the LTS installer from https://nodejs.org/en/download

  Then re-run:
    curl -fsSL https://teamocode.com/install.sh | bash
EOF
}

# Print upgrade instructions when Node is present but too old.
print_node_upgrade_help() {
  print_section_header "Upgrade Node.js to 18+:"
  cat >&2 <<'EOF'
  Download the latest LTS from https://nodejs.org/en/download

  Then re-run:
    curl -fsSL https://teamocode.com/install.sh | bash
EOF
}

# Inspect the npm log tail and return a short kind label for the dominant error.
classify_npm_failure() {
  local log_path="$1"
  local tail_text
  tail_text="$(tail -n 100 "${log_path}" 2>/dev/null || true)"

  if grep -qE 'EACCES|EPERM|permission denied|Operation not permitted' <<< "${tail_text}"; then
    echo "permission"
  elif grep -qE 'ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network timeout|fetch failed|socket hang up|getaddrinfo' <<< "${tail_text}"; then
    echo "network"
  elif grep -qE 'E404|404 Not Found|No matching version|notarget|Tag not found' <<< "${tail_text}"; then
    echo "version_not_found"
  elif grep -qE 'ENOSPC|no space left' <<< "${tail_text}"; then
    echo "disk_full"
  elif grep -qE 'EINTEGRITY|Integrity check' <<< "${tail_text}"; then
    echo "integrity"
  elif grep -qE 'EUNSUPPORTEDPROTOCOL|registry .* not allowed' <<< "${tail_text}"; then
    echo "registry"
  else
    echo "unknown"
  fi
}

# Print targeted next-step guidance based on the classified npm failure kind.
print_npm_failure_help() {
  local kind="$1"
  case "${kind}" in
    permission)
      print_section_header "→ Permission error (EACCES). The npm global directory isn't writable by your user."
      cat >&2 <<'EOF'
   Recommended fix — install Node via nvm so global packages live in your home dir:
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
     # in a new shell:
     nvm install --lts && nvm use --lts
     curl -fsSL https://teamocode.com/install.sh | bash

   Or move npm's global prefix to a writable path:
     mkdir -p ~/.npm-global
     npm config set prefix ~/.npm-global
     echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
     source ~/.zshrc

   Avoid `sudo npm install -g` — it tends to break npm cache ownership later.
EOF
      ;;
    network)
      print_section_header "→ Network error reaching the npm registry."
      cat >&2 <<'EOF'
   Try:
     • Check your internet connection, VPN, and any DNS settings.
     • If you're behind a corporate proxy:
         npm config set proxy http://your-proxy:port
         npm config set https-proxy http://your-proxy:port
     • Re-run the installer — transient registry errors often clear on retry.
EOF
      ;;
    version_not_found)
      print_section_header "→ Version \"${TARGET}\" was not found on the npm registry."
      cat >&2 <<EOF
   • Install the latest version (re-run with no argument):
       curl -fsSL https://teamocode.com/install.sh | bash
   • List all published versions:
       npm view ${PACKAGE_NAME} versions --json
EOF
      ;;
    disk_full)
      print_section_header "→ Disk is out of space (ENOSPC). Free up space and re-run the installer."
      ;;
    integrity)
      print_section_header "→ Package integrity check failed (corrupt download or stale cache)."
      cat >&2 <<'EOF'
   Clear the npm cache and re-install:
     npm cache clean --force
     curl -fsSL https://teamocode.com/install.sh | bash
EOF
      ;;
    registry)
      print_section_header "→ npm registry configuration looks broken."
      cat >&2 <<'EOF'
   Reset to the official registry:
     npm config set registry https://registry.npmjs.org/
   Then re-run the installer.
EOF
      ;;
    *)
      print_section_header "→ Couldn't auto-classify this error. Common fixes to try:"
      cat >&2 <<'EOF'
   • Re-run the installer (registry hiccups are often transient).
   • Permission errors → reinstall Node via nvm/fnm to avoid sudo.
   • Network errors → check connectivity / proxy settings.

   If it keeps failing, please open an issue with the npm output above:
     https://github.com/teamo-lab/TeamoCLI/issues
EOF
      ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────
# Node.js auto-install via nvm (user-space, no sudo required)
# ──────────────────────────────────────────────────────────────────────────
# Globals consumed by the telemetry payload. Updated only by auto_install_node.
NODE_AUTO_INSTALL_ATTEMPTED="false"
NODE_AUTO_INSTALL_METHOD=""
NODE_AUTO_INSTALL_RESULT=""
NODE_PRE_INSTALL_VERSION=""

# Install Node.js 18 LTS into the user's home via nvm. Returns 0 if Node 18+
# is available after the call, non-zero otherwise (so the caller can fall
# back to the existing "go download from nodejs.org" exit path).
#
# Pinned to nvm v0.39.7 — same URL we already print in the existing
# permission-error help text, no new outbound destination. nvm installs to
# `~/.nvm` and appends shell initialization to the user's rc file. No sudo.
#
# Escape hatch: `TEAMO_SKIP_AUTO_NODE=1` makes this return immediately so
# locked-down corporate users can opt out.
auto_install_node() {
  local reason="${1:-unknown}"  # "missing" | "too_old" | "npm_missing"
  NODE_AUTO_INSTALL_ATTEMPTED="true"
  NODE_AUTO_INSTALL_METHOD="nvm"

  if [[ "${TEAMO_SKIP_AUTO_NODE:-}" == "1" ]]; then
    NODE_AUTO_INSTALL_RESULT="skipped"
    echo "  TEAMO_SKIP_AUTO_NODE=1 set; skipping auto-install." >&2
    return 1
  fi

  print_section_header "Auto-installing Node.js 18 LTS via nvm (no sudo)..."
  echo "  Reason: ${reason}" >&2
  echo "  Method: nvm v0.39.7 (installs to ~/.nvm)" >&2
  echo "  To opt out next time: TEAMO_SKIP_AUTO_NODE=1 curl ... | bash" >&2

  if command -v node >/dev/null 2>&1; then
    NODE_PRE_INSTALL_VERSION="$(node -v 2>/dev/null || true)"
  fi

  export NVM_DIR="${HOME}/.nvm"

  # Re-use existing nvm if the user already has one. Otherwise pull the
  # pinned installer.
  if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    echo "  Downloading pinned nvm v0.39.7..." >&2
    if ! curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1; then
      echo "  Failed to download / install nvm. Network or rate-limit issue?" >&2
      NODE_AUTO_INSTALL_RESULT="failed"
      return 1
    fi
  fi

  if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    echo "  nvm.sh not found at ${NVM_DIR}/nvm.sh after install." >&2
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi

  # `set -e` would abort the script on the first non-zero status inside nvm.sh
  # (which contains plenty of `[[ ... ]]` tests intended to short-circuit).
  # `set -u` can also break nvm internals on fresh Linux shells, so both are
  # turned off only while loading nvm into this installer process.
  set +e
  set +u
  # shellcheck disable=SC1091
  \. "${NVM_DIR}/nvm.sh"
  local nvm_source_status=$?
  set -u
  set -e
  if [[ ${nvm_source_status} -ne 0 ]]; then
    echo "  Failed to load nvm from ${NVM_DIR}/nvm.sh." >&2
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi

  echo "  Running: nvm install --lts" >&2
  # Keep nounset/errexit disabled while invoking nvm itself. nvm is a sourced
  # shell function, and some Linux environments expose unset optional variables
  # during install/use; with `set -u`, bash exits the whole installer before we
  # can print a useful error.
  set +e
  set +u
  nvm install --lts
  local nvm_install_status=$?
  if [[ ${nvm_install_status} -eq 0 ]]; then
    nvm use --lts
    local nvm_use_status=$?
  else
    local nvm_use_status=1
  fi
  if [[ ${nvm_install_status} -eq 0 && ${nvm_use_status} -eq 0 ]]; then
    nvm alias default 'lts/*' >/dev/null 2>&1 || true
  fi
  set -u
  set -e

  if [[ ${nvm_install_status} -ne 0 ]]; then
    echo "  nvm install --lts failed." >&2
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi
  if [[ ${nvm_use_status} -ne 0 ]]; then
    echo "  nvm use --lts failed." >&2
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi
  hash -r

  if ! command -v node >/dev/null 2>&1; then
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi
  local installed major
  installed="$(node -v 2>/dev/null || true)"
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ -z "${major}" || "${major}" -lt 18 ]]; then
    NODE_AUTO_INSTALL_RESULT="failed"
    return 1
  fi

  NODE_AUTO_INSTALL_RESULT="success"
  echo "  Installed: ${installed} via nvm." >&2
  echo "  nvm has appended shell init to your ~/.zshrc / ~/.bashrc;" >&2
  echo "  new shells will see node/npm automatically." >&2
  return 0
}

npm_global_bin_dir() {
  local bin_dir="" prefix=""

  if bin_dir="$(npm bin -g 2>/dev/null)" && [[ -n "${bin_dir}" && "${bin_dir}" != Unknown* ]]; then
    printf '%s\n' "${bin_dir}"
    return 0
  fi

  prefix="$(npm prefix -g 2>/dev/null || npm config get prefix 2>/dev/null || true)"
  if [[ -n "${prefix}" && "${prefix}" != "undefined" && "${prefix}" != "null" ]]; then
    printf '%s\n' "${prefix%/}/bin"
    return 0
  fi

  return 1
}

path_contains_dir() {
  local dir="$1"
  case ":${PATH}:" in
    *":${dir}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

original_path_contains_dir() {
  local dir="$1"
  case ":${ORIGINAL_PATH}:" in
    *":${dir}:"*) return 0 ;;
    *) return 1 ;;
  esac
}

install_teamo_launcher_into_existing_path() {
  local npm_bin_dir="$1"
  local teamo_bin="${npm_bin_dir%/}/teamo"
  local path_dir="" IFS=":"

  [[ -e "${teamo_bin}" ]] || return 1
  original_path_contains_dir "${npm_bin_dir}" && return 1

  for path_dir in ${ORIGINAL_PATH}; do
    [[ -n "${path_dir}" && -d "${path_dir}" && -w "${path_dir}" ]] || continue
    case "${path_dir}" in
      /usr/local/bin|/opt/homebrew/bin|"${HOME}/.local/bin"|"${HOME}/bin")
        if [[ -e "${path_dir}/teamo" && ! -L "${path_dir}/teamo" ]]; then
          continue
        fi
        cat > "${path_dir}/teamo" <<EOF || continue
#!/usr/bin/env bash
export PATH="${npm_bin_dir}:\$PATH"
exec "${teamo_bin}" "\$@"
EOF
        chmod 755 "${path_dir}/teamo" 2>/dev/null || continue
        printf '%s\n' "${path_dir}/teamo"
        return 0
        ;;
    esac
  done

  return 1
}

shell_profile_paths() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "${shell_name}" in
    zsh)
      printf '%s\n' "${HOME}/.zshrc"
      [[ -f "${HOME}/.zprofile" ]] && printf '%s\n' "${HOME}/.zprofile"
      ;;
    bash)
      if [[ "${INSTALL_PLATFORM}" == "Darwin" ]]; then
        printf '%s\n' "${HOME}/.bash_profile"
        [[ -f "${HOME}/.bashrc" ]] && printf '%s\n' "${HOME}/.bashrc"
      else
        printf '%s\n' "${HOME}/.bashrc"
        [[ -f "${HOME}/.profile" ]] && printf '%s\n' "${HOME}/.profile"
      fi
      ;;
    fish)
      printf '%s\n' "${HOME}/.config/fish/config.fish"
      ;;
    *)
      if [[ "${INSTALL_PLATFORM}" == "Darwin" ]]; then
        printf '%s\n' "${HOME}/.zshrc"
      else
        printf '%s\n' "${HOME}/.profile"
      fi
      ;;
  esac
}

ensure_path_in_shell_profile() {
  local bin_dir="$1"
  local profile shell_name path_line written_profiles=() joined_profiles=""

  shell_name="$(basename "${SHELL:-}")"

  while IFS= read -r profile; do
    [[ -n "${profile}" ]] || continue

    mkdir -p "$(dirname "${profile}")" 2>/dev/null || continue
    touch "${profile}" 2>/dev/null || continue

    if grep -Fqs "${bin_dir}" "${profile}"; then
      written_profiles+=("${profile}")
      continue
    fi

    if [[ "${shell_name}" == "fish" ]]; then
      path_line="set -gx PATH \"${bin_dir}\" \$PATH"
    else
      path_line="export PATH=\"${bin_dir}:\$PATH\""
    fi

    {
      printf '\n# Added by Teamo Code installer\n'
      printf '%s\n' "${path_line}"
    } >> "${profile}" || continue

    written_profiles+=("${profile}")
  done < <(shell_profile_paths)

  [[ "${#written_profiles[@]}" -gt 0 ]] || return 1

  for profile in "${written_profiles[@]}"; do
    joined_profiles="${joined_profiles}${joined_profiles:+, }${profile}"
  done
  printf '%s\n' "${joined_profiles}"
}

if [[ "${REQUESTED_TARGET}" == "--help" || "${REQUESTED_TARGET}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ ! "${REQUESTED_TARGET}" =~ ^(latest|[0-9]+\.[0-9]+\.[0-9]+(-[^[:space:]]+)?)$ ]]; then
  usage
  fail_install "argument_validation" "invalid install target"
fi

if ! command -v node >/dev/null 2>&1; then
  print_error_header "Node.js 18+ is required, but \`node\` was not found."
  if ! auto_install_node "missing"; then
    print_node_install_help
    fail_install "prerequisite_check" "node command not found (auto-install also failed)"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  print_error_header "npm is required, but \`npm\` was not found."
  echo "(npm normally ships with Node — your Node install may be incomplete.)" >&2
  if ! auto_install_node "npm_missing"; then
    print_node_install_help
    fail_install "prerequisite_check" "npm command not found (auto-install also failed)" 1 "" "$(node -v 2>/dev/null || true)"
  fi
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ -z "${node_major}" || "${node_major}" -lt 18 ]]; then
  print_error_header "Node.js 18+ is required. Current version: $(node -v)"
  if ! auto_install_node "too_old"; then
    print_node_upgrade_help
    fail_install "prerequisite_check" "node version below minimum (auto-install also failed)" 1 "" "$(node -v 2>/dev/null || true)" "$(npm -v 2>/dev/null || true)"
  fi
fi

install_spec="${PACKAGE_NAME}@${TARGET}"
node_version="$(node -v 2>/dev/null || true)"
npm_version="$(npm -v 2>/dev/null || true)"

echo "Installing TeamoCLI from npm..."
echo "Package: ${install_spec}"
echo ""
echo "This usually takes around 2 minutes (longer on slow networks). Please keep this window open."
echo ""

log_file="$(mktemp 2>/dev/null || mktemp -t teamo-install)"
trap 'rm -f "${log_file}"' EXIT

# Run npm silently in the background and drive a single in-place progress bar.
# npm's own spinner can sit frozen for minutes during dependency resolution and
# tricks users into thinking the install crashed; an estimate-based bar with a
# guaranteed snap-to-100% on success gives clearer feedback.
npm install --global \
  --no-progress --loglevel=error "${install_spec}" \
  >"${log_file}" 2>&1 &
npm_pid=$!

draw_bar() {
  local pct="$1" width=30
  local filled=$(( pct * width / 100 ))
  local empty=$(( width - filled ))
  local bar=""
  if (( filled > 0 )); then
    bar="$(printf '%*s' "${filled}" '' | tr ' ' '#')"
  fi
  if (( empty > 0 )); then
    bar="${bar}$(printf '%*s' "${empty}" '' | tr ' ' '-')"
  fi
  printf '\r  [%s] %3d%%' "${bar}" "${pct}"
}

start_ts=$(date +%s)

if [[ -t 1 ]]; then
  draw_bar 0
  while kill -0 "${npm_pid}" 2>/dev/null; do
    sleep 1
    elapsed=$(( $(date +%s) - start_ts ))
    # Front-loaded power curve: ramps to 90% in 30s, then holds at 90% until
    # npm exits. Snap to 100% only happens in the success branch below — the
    # bar is honest about waiting on the actual install.
    pct=$(awk -v t="${elapsed}" 'BEGIN {
      if (t <= 0) { printf "0"; exit }
      p = 90 * (t / 30) ^ 0.4
      if (p > 90) p = 90
      printf "%d", p
    }')
    draw_bar "${pct}"
  done
fi

set +e
wait "${npm_pid}"
npm_status=$?
set -e

if [[ ${npm_status} -ne 0 ]]; then
  [[ -t 1 ]] && printf '\n'
  echo "" >&2
  print_error_header "Global npm install failed (exit ${npm_status}). npm output below:"
  echo "----------------------------------------" >&2
  cat "${log_file}" >&2
  echo "----------------------------------------" >&2
  npm_failure_kind="$(classify_npm_failure "${log_file}")"
  print_npm_failure_help "${npm_failure_kind}"
  npm_error_tail="$(tail -n 20 "${log_file}" 2>/dev/null || true)"
  fail_install "npm_global_install" "kind=${npm_failure_kind}; ${npm_error_tail:-npm install failed}" 1 "" "${node_version}" "${npm_version}"
fi

if [[ -t 1 ]]; then
  draw_bar 100
  printf '\n'
fi

# Surface any warnings npm emitted on success.
if [[ -s "${log_file}" ]]; then
  cat "${log_file}"
fi

echo ""
echo "Verifying installation..."

npm_bin_dir="$(npm_global_bin_dir || true)"
path_profile=""
path_launcher=""
# Compare against ORIGINAL_PATH (not live ${PATH}) so recovery still runs when
# the script itself added the bin dir to ${PATH} mid-run (e.g. future nvm
# auto-install). The user's outer shell only sees ORIGINAL_PATH, so that's the
# correct yardstick for "is `teamo` actually findable after we exit".
if [[ -n "${npm_bin_dir}" ]] && ! original_path_contains_dir "${npm_bin_dir}"; then
  path_launcher="$(install_teamo_launcher_into_existing_path "${npm_bin_dir}" || true)"
  export PATH="${npm_bin_dir}:${PATH}"
  path_profile="$(ensure_path_in_shell_profile "${npm_bin_dir}" || true)"
fi

if command -v teamo >/dev/null 2>&1; then
  teamo_version="$(teamo --version 2>/dev/null || true)"
  echo "Installed binary: $(command -v teamo)"
  echo "Version: ${teamo_version}"
  if [[ -n "${path_profile}" ]]; then
    echo "Added npm global bin to PATH for future shells: ${path_profile}"
  fi
  if [[ -n "${path_launcher}" ]]; then
    echo "Installed teamo launcher into current PATH: ${path_launcher}"
  fi
else
  print_section_header "→ TeamoCLI was installed, but \`teamo\` is not on your current PATH."
  if [[ -n "${npm_bin_dir}" ]]; then
    cat >&2 <<EOF
   Your npm global bin directory is:
     ${npm_bin_dir}

   Add it to PATH:
     export PATH="${npm_bin_dir}:\$PATH"
EOF
  else
    cat >&2 <<'EOF'
   Find your npm global bin directory:
     echo "$(npm prefix -g)/bin"
   Then add it to PATH in your shell rc file (~/.zshrc or ~/.bashrc).
EOF
  fi
  cat >&2 <<'EOF'

   Or simply open a new shell and run `teamo` again.
EOF
  fail_install "path_verification" "teamo binary missing from current PATH after npm install" 1 "" "${node_version}" "${npm_version}"
fi

send_install_telemetry "install.succeeded" "succeeded" "completed" "teamo binary verified" 0 "${teamo_version}" "${node_version}" "${npm_version}"

echo ""
echo "Installation complete."
if [[ -n "${npm_bin_dir:-}" && -n "${path_profile:-}" && -z "${path_launcher:-}" ]] && ! original_path_contains_dir "${npm_bin_dir}"; then
  echo "Open a new terminal, then run \`teamo\` to launch the TUI."
else
  echo "Run \`teamo\` to launch the TUI."
fi
