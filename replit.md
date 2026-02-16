# API Kimi Gratis - Project Summary

## Overview

**API Kimi Gratis** (Kimi Free API Fix) adalah server API proxy yang mengubah layanan Kimi AI (dari Moonshot AI) menjadi API yang kompatibel dengan format OpenAI, Google Gemini, dan Anthropic Claude. Server ini ditulis dalam TypeScript menggunakan framework Koa.js.

Project ini di-clone dari GitHub (`kimi-free-api-fix`) dan telah dikonfigurasi untuk berjalan sepenuhnya di Replit pada port 5000.

### Status: Berjalan (Running) - Semua Tested OK
- Server aktif di port 5000
- Semua endpoint sudah ditest dan berfungsi (streaming & non-streaming)
- API Documentation UI (Swagger-style) tersedia di halaman utama
- Token auth tersimpan di server (valid sampai 2026-03-18)
- Streaming per-kata SUDAH BERFUNGSI (true streaming via Connect RPC)
- Melanjutkan percakapan (conversation continuation) SUDAH BERFUNGSI via chatId

## Project Architecture

### Tech Stack
- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Framework**: Koa.js
- **Build Tool**: tsup
- **Key Libraries**: axios, lodash, eventsource-parser, koa-router, koa-body, koa2-cors

### Directory Structure
```
├── configs/dev/          # Konfigurasi service & system (YAML)
├── public/               # Static files (welcome.html - Swagger-style API docs)
├── src/
│   ├── api/
│   │   ├── controllers/  # Business logic
│   │   │   ├── chat.ts           # Traditional REST API (refresh_token)
│   │   │   ├── chat-v2.ts        # Connect RPC API (JWT/kimi-auth) - TRUE STREAMING
│   │   │   ├── gemini-adapter.ts # Gemini format adapter
│   │   │   └── claude-adapter.ts # Claude format adapter
│   │   ├── routes/       # Route definitions
│   │   │   ├── chat.ts   # POST /v1/chat/completions
│   │   │   ├── ping.ts   # GET /ping
│   │   │   ├── token.ts  # POST /token/check
│   │   │   ├── models.ts # GET /v1/models (16 models termasuk K2.5)
│   │   │   ├── gemini.ts # Gemini endpoints (/v1beta/...)
│   │   │   ├── claude.ts # Claude endpoint (POST /v1/messages)
│   │   │   └── auth.ts   # Token management endpoints
│   │   └── consts/       # Exception constants
│   ├── lib/              # Core utilities
│   │   ├── connect-rpc/  # Connect RPC protocol implementation
│   │   │   ├── client.ts    # HTTP client (chat + chatStream true streaming)
│   │   │   ├── protocol.ts  # Binary protocol encode/decode
│   │   │   ├── types.ts     # TypeScript types (ChatRequest, ConnectMessage, dll)
│   │   │   └── index.ts     # Module exports
│   │   ├── server.ts     # Koa server setup
│   │   ├── config.ts     # Config loader
│   │   ├── logger.ts     # Logging
│   │   └── util.ts       # Utilities
│   └── index.ts          # Entry point
├── dist/                 # Built output (auto-generated)
├── setup.sh              # Auto-download dependencies script
├── package.json
├── tsconfig.json
└── vercel.json           # Vercel deployment config
```

## Fitur Utama

### 1. True Streaming (Per-Kata)
- Connect RPC client menggunakan `responseType: 'stream'` untuk menerima data secara real-time
- Binary frames di-parse saat tiba, langsung dikirim ke client sebagai SSE chunks
- Respons muncul per-kata/token, bukan menunggu selesai semua

### 2. Conversation Continuation (Lanjutkan Percakapan)
- Setiap chat pertama membuat chatId baru dari Kimi
- ChatId dikembalikan dalam response `id` field
- Kirim `conversation_id` di request body untuk melanjutkan chat yang sama
- AI akan ingat konteks percakapan sebelumnya

### 3. Multi-Format API Support
- OpenAI format (`/v1/chat/completions`)
- Claude format (`/v1/messages`)
- Gemini format (`/v1beta/models/:model:generateContent`)
- Semua format mengarah ke Kimi AI backend

## Cara Pakai Conversation Continuation

```json
// Chat pertama (buat baru)
POST /v1/chat/completions
{
  "model": "kimi-k2.5-thinking",
  "messages": [{"role": "user", "content": "Hai, namaku Zaki"}],
  "stream": true
}
// Response id = "abc123..."

// Chat lanjutan (lanjutkan percakapan)
POST /v1/chat/completions
{
  "model": "kimi-k2.5-thinking",
  "conversation_id": "abc123...",
  "messages": [{"role": "user", "content": "Siapa namaku?"}],
  "stream": true
}
// AI akan ingat nama Zaki
```

## Streaming Support (Semua Format)

### Cara Kerja Streaming
Semua respon AI bisa di-stream per kata/token, seperti ChatGPT aslinya. Format SSE (Server-Sent Events) digunakan.

### Endpoint & Streaming Status (Tested 2026-02-16)

| Format | Endpoint | Streaming | Non-Streaming | Status Test |
|--------|----------|-----------|---------------|-------------|
| OpenAI | `POST /v1/chat/completions` | `"stream": true` | `"stream": false` | OK |
| Claude | `POST /v1/messages` | `"stream": true` | `"stream": false` | OK |
| Gemini | `POST /v1beta/models/:model:streamGenerateContent` | Otomatis | - | OK |
| Gemini | `POST /v1beta/models/:model:generateContent` | - | Otomatis | OK |

### Penting: Semua Model = Kimi AI Backend
API "Claude" dan "Gemini" di sini BUKAN API asli. Ini adalah ADAPTER yang:
- Menerima request dalam format Claude/Gemini
- Meneruskan ke Kimi AI
- Mengembalikan respon dalam format Claude/Gemini

## Model AI yang Didukung (16 Model)

### K2.5 Series (Terbaru)
| Model ID | Nama | Deskripsi |
|----------|------|-----------|
| `kimi-k2.5-instant` | K2.5 Instant | Quick response, 256k context, fast 3-8s |
| `kimi-k2.5-thinking` | K2.5 Thinking | Deep thinking, chain-of-thought reasoning |
| `kimi-k2.5-agent` | K2.5 Agent | Research, slides, websites, docs, sheets |
| `kimi-k2.5-agent-swarm` | K2.5 Agent Swarm | Multi-agent orchestration, 100 parallel sub-agents |

### K2 Series
| Model ID | Nama | Deskripsi |
|----------|------|-----------|
| `kimi-k2-0905-preview` | K2-0905 | 256k context, enhanced Agentic Coding |
| `kimi-k2-0711-preview` | K2-0711 | 128k context, 1T params MoE |
| `kimi-k2-turbo-preview` | K2-Turbo | High-speed, 60-100 tokens/s |
| `kimi-k2-thinking` | K2-Thinking | Long-thinking model, deep reasoning |
| `kimi-k2-thinking-turbo` | K2-Thinking-Turbo | Thinking high-speed |

### Moonshot V1 Series
| Model ID | Deskripsi |
|----------|-----------|
| `moonshot-v1-8k` | Short text, 8k context |
| `moonshot-v1-32k` | Long text, 32k context |
| `moonshot-v1-128k` | Ultra-long text, 128k context |

### Vision & Latest
| Model ID | Deskripsi |
|----------|-----------|
| `moonshot-v1-8k-vision-preview` | Vision 8k |
| `moonshot-v1-32k-vision-preview` | Vision 32k |
| `moonshot-v1-128k-vision-preview` | Vision 128k |
| `kimi-latest` | Latest model, 128k context |

## API Endpoints

### Endpoint Tanpa Autentikasi
| Endpoint | Method | Deskripsi | Status |
|----------|--------|-----------|--------|
| `/` | GET | API Documentation (Swagger-style) | OK |
| `/ping` | GET | Health check, return "pong" | OK |
| `/v1/models` | GET | Daftar 16 model (termasuk K2.5) | OK |
| `/v1beta/models` | GET | Daftar model Gemini-compatible | OK |

### Endpoint Autentikasi (Butuh Kimi Auth Token)
| Endpoint | Method | Deskripsi | Streaming |
|----------|--------|-----------|-----------|
| `/v1/chat/completions` | POST | Chat completion (OpenAI format) | Ya (`stream: true`) |
| `/v1/messages` | POST | Chat completion (Claude format) | Ya (`stream: true`) |
| `/v1beta/models/:model:generateContent` | POST | Content generation (Gemini) | Tidak |
| `/v1beta/models/:model:streamGenerateContent` | POST | Streaming content (Gemini) | Ya (otomatis) |
| `/token/check` | POST | Cek validitas token | - |

### Endpoint Token Management (Server-Side)
| Endpoint | Method | Deskripsi | Status |
|----------|--------|-----------|--------|
| `/auth/extract` | POST | Extract kimi-auth dari cookie string | OK |
| `/auth/save` | POST | Simpan token ke server (auto-used for all API calls) | OK |
| `/auth/status` | GET | Cek status token di server (expiry, user info) | OK |
| `/auth/clear` | GET | Hapus token dari server | OK |

## Dual API System
- **Traditional API** (refresh_token): Fitur lengkap - multi-turn chat, file upload, image parsing, search
- **Connect RPC API** (kimi-auth JWT): True streaming, conversation continuation, K2.5 support

## Untuk Website Chat AI
Jika ingin membuat website chat AI dengan streaming:
1. Gunakan endpoint `POST /v1/chat/completions` dengan `"stream": true`
2. Parse SSE events (`data: {...}`) di frontend
3. Setiap chunk berisi `choices[0].delta.content` = potongan teks
4. Response `id` = chatId, simpan untuk melanjutkan percakapan
5. Kirim `conversation_id` di request body untuk melanjutkan
6. Stream berakhir dengan `data: [DONE]`

## Deployment
- Build: `npm run build`
- Start: `node --enable-source-maps --no-node-snapshot dist/index.js`
- Port: 5000

## Recent Changes
- 2026-02-16: FIX frontend chat tidak melanjutkan percakapan - sekarang conversation_id di-track dan dikirim otomatis
- 2026-02-16: Gemini adapter sekarang support conversation_id passthrough
- 2026-02-16: FIX conversation continuation - chat sekarang bisa dilanjutkan via chatId
- 2026-02-16: FIX true streaming - response sekarang per-kata (bukan buffered sekaligus)
- 2026-02-16: Connect RPC client chatStream() method dengan responseType: 'stream'
- 2026-02-16: Full test semua endpoint streaming & non-streaming - SEMUA OK
- 2026-02-16: Token auth berhasil disimpan (valid sampai 2026-03-18)
- 2026-02-16: Redesign UI jadi Swagger-style REST API documentation
- 2026-02-16: Server-side token storage
- 2026-02-16: Tambah model K2.5 Series

## User Preferences
- Bahasa komunikasi: Bahasa Indonesia
- Project di-clone dari GitHub, dikembangkan di Replit
- Prefer REST API documentation style (Swagger-like)
- Ingin streaming response per-kata untuk website chat AI
- Ingin chat bisa melanjutkan percakapan (conversation continuation)

## Rencana Kedepan
- Buat website chat AI frontend yang menggunakan API ini
- Implementasi penyimpanan token secara persistent (database/file)
- Tambah fitur file upload via Connect RPC
- Auto-refresh token saat mendekati expired
- Rate limiting dan error handling yang lebih baik
