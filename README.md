# bazaarlink-worker

BazaarLink Worker Agent — connect your local GPU to the [BazaarLink](https://bazaarlink.ai) distributed inference network and earn rewards.

## Requirements

- Node.js >= 18
- [Ollama](https://ollama.ai) running locally with at least one supported model

## Installation

```bash
npm install -g bazaarlink-worker
```

Or run directly:

```bash
git clone https://github.com/BazaarLink/bazaarlink-worker.git
cd bazaarlink-worker
npm install && npm run build
```

## Usage

### 1. Get a Worker Key

Contact [BazaarLink](https://bazaarlink.ai) to obtain a worker key (`wk_...`).

### 2. Login

```bash
bazaarlink-worker login \
  --key wk_your_key_here \
  --gateway https://gateway.bazaarlink.ai \
  --models qwen3-30b-a3b \
  --ollama-url http://localhost:11434
```

| Flag | Default | Description |
|------|---------|-------------|
| `--key` | *(required)* | Your worker key |
| `--gateway` | *(required)* | Gateway URL |
| `--models` | `qwen3-30b-a3b` | Comma-separated supported models |
| `--max-concurrent` | `4` | Max concurrent jobs |
| `--ollama-url` | `http://localhost:11434` | Local Ollama URL |

Credentials stored at `~/.bazaarlink/config.json`.

### 3. Start

```bash
bazaarlink-worker start
```

Press `Ctrl+C` to stop gracefully.

### Check Status

```bash
bazaarlink-worker status
```

## How It Works

```
BazaarLink API
    │
    ▼
Worker Gateway  ──── WebSocket ────►  bazaarlink-worker (your machine)
                                               │
                                               ▼
                                        Ollama (local GPU)
```

## License

MIT
