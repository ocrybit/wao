# Cloudflare Worker Proxy for Arweave Gateway

This Cloudflare Worker proxies requests to Arweave gateways (arweave.net, g8way.io, etc.) to bypass environments where direct DNS resolution doesn't work.

## Supported Request Methods

### Method 1: URL in path (explicit)
```
GET /proxy/https://arweave.net/tx/abc123
```

### Method 2: X-Target-URL header
```
GET /
X-Target-URL: https://arweave.net/tx/abc123
```

### Method 3: X-Target-Host header
```
GET /tx/abc123
X-Target-Host: arweave.net
```

### Method 4: Direct path (CU server compatible)
```
GET /{txId}
```
This automatically proxies to `https://arweave.net/{txId}`, making it compatible with the genesis-wasm CU server which expects a standard Arweave gateway format.

## Allowed Hosts

Only requests to these hosts are proxied:
- arweave.net
- g8way.io
- ar-io.net
- arweave.dev
- goldsky.arweave.net

## Deployment

1. Install wrangler:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Deploy:
```bash
cd cloudflare-proxy
wrangler deploy
```

## Usage with WAO/HyperBEAM

Set the `GATEWAY_URL` environment variable to your deployed worker URL:

```bash
export GATEWAY_URL="https://your-worker.workers.dev"
```

The genesis-wasm CU server will use this URL to fetch WASM modules and other Arweave data.
