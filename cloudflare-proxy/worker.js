/**
 * Cloudflare Worker Proxy for Arweave Gateway
 *
 * This worker proxies requests to Arweave gateways (arweave.net, g8way.io)
 * to bypass environments where direct DNS resolution doesn't work.
 *
 * Usage:
 *   Method 1: GET/POST https://your-worker.workers.dev/proxy/https://arweave.net/tx/abc123
 *   Method 2: GET https://your-worker.workers.dev/ with X-Target-URL header
 *   Method 3: GET /path with X-Target-Host header
 *   Method 4: GET /{txId} - Direct path proxied to arweave.net (for CU server compatibility)
 */

const ALLOWED_HOSTS = [
  'arweave.net',
  'g8way.io',
  'ar-io.net',
  'arweave.dev',
  'goldsky.arweave.net',
];

const DEFAULT_GATEWAY = 'https://arweave.net';

// Arweave transaction IDs are 43 characters of base64url
const ARWEAVE_TXID_REGEX = /^[a-zA-Z0-9_-]{43}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    let targetUrl;

    // Method 1: URL in path after /proxy/
    if (url.pathname.startsWith('/proxy/')) {
      targetUrl = url.pathname.slice(7) + url.search;
      // Handle double-encoded URLs
      if (targetUrl.startsWith('http%3A') || targetUrl.startsWith('https%3A')) {
        targetUrl = decodeURIComponent(targetUrl);
      }
      // Fix URL normalization issue where https:// becomes https:/
      // Browsers/servers often normalize // to / in paths
      if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
        targetUrl = targetUrl.replace('https:/', 'https://');
      }
      if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
        targetUrl = targetUrl.replace('http:/', 'http://');
      }
    }
    // Method 2: X-Target-URL header
    else if (request.headers.get('X-Target-URL')) {
      targetUrl = request.headers.get('X-Target-URL');
    }
    // Method 3: Target host in X-Target-Host header, path from request
    else if (request.headers.get('X-Target-Host')) {
      const targetHost = request.headers.get('X-Target-Host');
      targetUrl = `https://${targetHost}${url.pathname}${url.search}`;
    }
    // Health check / info endpoint
    else if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'arweave-proxy',
        allowed_hosts: ALLOWED_HOSTS,
        default_gateway: DEFAULT_GATEWAY,
        usage: {
          method1: 'GET /proxy/https://arweave.net/path',
          method2: 'GET / with X-Target-URL header',
          method3: 'GET /path with X-Target-Host header',
          method4: 'GET /{txId} - Direct path proxied to arweave.net',
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    // Method 4: Direct path - proxy to default arweave.net gateway
    // This supports CU server which calls GATEWAY_URL/{txId} directly
    else if (url.pathname.length > 1) {
      // Remove leading slash and use as path to arweave.net
      targetUrl = `${DEFAULT_GATEWAY}${url.pathname}${url.search}`;
    }
    else {
      return new Response(JSON.stringify({
        error: 'No target URL specified',
        usage: 'Use /proxy/URL, X-Target-URL header, or direct /{txId} path'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Validate target URL
    let parsedTarget;
    try {
      parsedTarget = new URL(targetUrl);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Invalid target URL',
        url: targetUrl
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Security: Only allow whitelisted hosts
    if (!ALLOWED_HOSTS.some(host => parsedTarget.hostname === host || parsedTarget.hostname.endsWith('.' + host))) {
      return new Response(JSON.stringify({
        error: 'Host not allowed',
        host: parsedTarget.hostname,
        allowed: ALLOWED_HOSTS
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Forward the request
    const headers = new Headers(request.headers);
    // Remove headers that shouldn't be forwarded
    headers.delete('X-Target-URL');
    headers.delete('X-Target-Host');
    headers.delete('Host');
    headers.set('Host', parsedTarget.hostname);

    try {
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'follow',
      });

      // Clone response and add CORS headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Expose-Headers', '*');
      responseHeaders.set('X-Proxied-URL', targetUrl);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Proxy request failed',
        message: e.message,
        url: targetUrl
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
