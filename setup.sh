#!/bin/bash

echo "=============================================="
echo "  KIMI FREE API FIX - Auto Setup Script"
echo "  Version 1.0.2 | github.com/akyoj/Kimi-ApiAi"
echo "=============================================="
echo ""

# ── Warna output ───────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC}    $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}   $1"; }
err()  { echo -e "${RED}[ERROR]${NC}  $1"; }
info() { echo -e "${BLUE}[INFO]${NC}   $1"; }

ERRORS=0

# ── Step 0: Cek prasyarat sistem ────────────────
echo "── Cek Prasyarat Sistem ─────────────────────"

# Node.js (wajib)
if ! command -v node &> /dev/null; then
    err "Node.js tidak ditemukan!"
    err "Install: https://nodejs.org/  atau  nvm install 20 && nvm use 20"
    exit 1
fi
NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo $NODE_VERSION | tr -d 'v' | cut -d. -f1)
ok "Node.js $NODE_VERSION"
if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js versi minimal 18. Versi $NODE_VERSION mungkin bermasalah."
fi

# npm (wajib)
if ! command -v npm &> /dev/null; then
    err "npm tidak ditemukan!"; exit 1
fi
ok "npm v$(npm -v)"

# Python3 — tools: code_execute(python), debug_code
if command -v python3 &> /dev/null; then
    ok "Python3 $(python3 --version 2>&1 | awk '{print $2}') — digunakan oleh: code_execute(python), debug_code"
elif command -v python &> /dev/null; then
    ok "Python $(python --version 2>&1 | awk '{print $2}') — digunakan oleh: code_execute(python), debug_code"
else
    warn "Python tidak ditemukan → code_execute(python), debug_code tidak akan berfungsi"
fi

# Bash
if command -v bash &> /dev/null; then
    ok "Bash $(bash --version | head -1 | awk '{print $4}') — digunakan oleh: shell, run_shell, code_execute(bash)"
fi

# Archive tools
for tool in zip unzip tar; do
    if command -v $tool &> /dev/null; then
        ok "$tool — digunakan oleh: archive_create_zip/tar, archive_extract_*"
    else
        warn "$tool tidak ditemukan → archive tools tidak akan berfungsi (install: apt-get install $tool)"
        ((ERRORS++))
    fi
done

# patch — tools: apply_patch
if command -v patch &> /dev/null; then
    ok "patch — digunakan oleh: apply_patch"
else
    warn "patch tidak ditemukan → apply_patch tidak akan berfungsi"
fi

echo ""

# ── Step 1: Install npm dependencies ────────────
echo "── [1/4] Install npm Dependencies ──────────"
echo ""
info "Packages yang akan diinstall:"
info "  ┌── HTTP Server ──────────────────────────────────────────────────┐"
info "  │  koa, koa-router, koa-body, koa-bodyparser, koa2-cors, koa-range│"
info "  ├── HTTP Client & Tools ──────────────────────────────────────────┤"
info "  │  axios — web_search, browser, http_request, places, weather     │"
info "  ├── Browser Automation ───────────────────────────────────────────┤"
info "  │  playwright — browser_navigate, browser_screenshot, browser_*   │"
info "  ├── File Generation ─────────────────────────────────────────────┤"
info "  │  pdfkit   — generate_pdf (PDF tanpa browser, pure JS)           │"
info "  │  docx     — generate_docx (Microsoft Word .docx)                │"
info "  │  exceljs  — generate_xlsx (Microsoft Excel .xlsx)               │"
info "  │  pptxgenjs — generate_pptx (Microsoft PowerPoint .pptx)        │"
info "  ├── Utilities ───────────────────────────────────────────────────┤"
info "  │  fs-extra, lodash, uuid, yaml, cron, mime, minimist             │"
info "  │  eventsource-parser, randomstring, colors, crc-32, date-fns     │"
info "  └────────────────────────────────────────────────────────────────┘"
echo ""

npm install
if [ $? -ne 0 ]; then
    err "Gagal menginstall npm dependencies!"
    exit 1
fi
ok "Semua npm dependencies berhasil diinstall."
echo ""

# ── Step 2: Playwright Chromium (opsional) ───────
echo "── [2/4] Setup Playwright Chromium ─────────"
echo ""
info "Playwright Chromium digunakan untuk:"
info "  browser_navigate, browser_screenshot, browser_click,"
info "  browser_type, browser_scroll, browser_get_text, browser_get_html, browser_eval"
echo ""
info "CATATAN: generate_pdf TIDAK membutuhkan Playwright (sudah pakai pdfkit)."
echo ""

npx playwright install chromium --with-deps 2>/dev/null
PLAYWRIGHT_EXIT=$?
if [ $PLAYWRIGHT_EXIT -eq 0 ]; then
    ok "Playwright Chromium berhasil diinstall."
else
    warn "Gagal install Playwright Chromium. Browser automation tools tidak akan berfungsi."
    warn "Coba manual:"
    warn "  npx playwright install-deps chromium  (install system deps)"
    warn "  npx playwright install chromium"
fi
echo ""

# ── Step 3: Build TypeScript ─────────────────────
echo "── [3/4] Build Project TypeScript ──────────"
echo ""

npx tsup src/index.ts --format cjs,esm --sourcemap --dts --clean --publicDir public
if [ $? -ne 0 ]; then
    err "Gagal build project!"
    exit 1
fi
ok "Build berhasil."
echo ""

# ── Step 4: Persiapan direktori ──────────────────
echo "── [4/4] Persiapan Direktori & Validasi ────"
echo ""

mkdir -p agent-workspace data
ok "agent-workspace/ siap (file yang dibuat oleh tools)"
ok "data/ siap (persistent token storage)"

# Validasi build
if [ -f "dist/index.js" ]; then
    ok "dist/index.js — $(du -sh dist/index.js | awk '{print $1}')"
else
    err "dist/index.js tidak ditemukan!"; ((ERRORS++))
fi
if [ -f "dist/index.mjs" ]; then
    ok "dist/index.mjs — $(du -sh dist/index.mjs | awk '{print $1}')"
fi
if [ -d "configs" ]; then
    ok "configs/ ditemukan"
fi
echo ""

# ── Ringkasan Final ────────────────────────────
echo "=============================================="
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  ✅ Setup selesai! Semua dependencies siap.${NC}"
else
    echo -e "${YELLOW}  ⚠️  Setup selesai dengan $ERRORS peringatan.${NC}"
fi
echo ""
echo "  77 Tools tersedia dalam 1 endpoint:"
echo "  ─────────────────────────────────────────────"
echo "  GET  /v1/agent/tools       → Lihat semua tools"
echo "  POST /v1/agent/completions → Jalankan agent"
echo ""
echo "  Mode penggunaan (POST body):"
echo "    { \"list_tools\": true }          → list semua tools"
echo "    { \"task\": \"<your task>\" }        → run task singkat"
echo "    { \"messages\": [...] }            → OpenAI-compatible chat"
echo ""
echo "  Kategori Tools (77 total):"
echo "    Terminal      : shell, run_shell, bash_tool"
echo "    File System   : file_read/write/append/list/delete,"
echo "                    create_directory, move_file, copy_file"
echo "    Code          : code_execute(py/js/ts/bash/ruby),"
echo "                    install_package, debug_code, apply_patch"
echo "    Project       : create_project, delete_project,"
echo "                    get_project_structure, search_in_files"
echo "    Web & Browser : web_search, web_open_url, http_request,"
echo "                    browser, browser_navigate, browser_screenshot,"
echo "                    browser_click, browser_type, browser_scroll,"
echo "                    browser_get_text, browser_get_html, browser_eval"
echo "    Image Search  : search_image_by_text, search_image_by_image"
echo "    Data Sources  : get_data_source (Yahoo, Binance, WorldBank,"
echo "                    Arxiv, Google Scholar)"
echo "    File Gen      : generate_pdf, generate_markdown,"
echo "                    generate_json, generate_csv, generate_html,"
echo "                    generate_zip"
echo "    Office        : generate_docx (.docx), generate_xlsx (.xlsx),"
echo "                    generate_pptx (.pptx)"
echo "    Geo & Weather : places_search, places_map_display, weather_fetch"
echo "    Sports/Recipe : fetch_sports_data, recipe_display"
echo "    Archives      : archive_create/extract zip+tar, archive_list"
echo "    Agent Intel   : planner_phase, step_tracker, loop_supervisor,"
echo "                    tool_validator, reflection_pass,"
echo "                    memory_store, memory_retrieve, memory_space_edits"
echo "    System        : get_system_info, get/set_environment_variable,"
echo "                    check_disk_usage, check_website_status"
echo "    Misc          : str_replace, present_files, message_compose"
echo ""
echo "  Token Auth:"
echo "    POST /auth/save   { \"token\": \"your-kimi-auth-token\" }"
echo "    GET  /auth/status"
echo ""
echo "  Menjalankan server:"
echo "    Development : npm run dev   (watch mode + auto-restart)"
echo "    Production  : npm start     (requires build first)"
echo "    Build only  : npm run build"
echo ""
echo "  Server: http://0.0.0.0:5000"
echo "=============================================="
