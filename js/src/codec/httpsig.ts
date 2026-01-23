/**
 * HTTPSig Codec - HTTP Signature format
 * RFC-8941 Structured Fields compatible signatures
 */

import type { TABMMessage } from '../types/message.js';
import type { Binary, Base64URL } from '../types/primitives.js';
import type { Codec } from '../types/codec.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { toBinary, fromBinary, toBase64URL, fromBase64URL } from '../utils/encoding.js';
import { sha256 } from '../crypto/hash.js';

/** HTTPSig signature parameters */
export interface SignatureParams {
  /** Signature algorithm */
  alg?: string;
  /** Key identifier */
  keyid?: string;
  /** Creation timestamp */
  created?: number;
  /** Expiration timestamp */
  expires?: number;
  /** Nonce for replay protection */
  nonce?: string;
  /** Covered components */
  components: string[];
}

/** Parse RFC-8941 structured field parameters */
export function parseStructuredParams(input: string): SignatureParams {
  const params: SignatureParams = { components: [] };

  // Parse inner list: ("@method" "@path" ...);alg="rsa-pss-sha256";keyid="..."
  const match = input.match(/^\(([^)]*)\)(.*)/);
  if (!match) {
    return params;
  }

  // Parse components
  const componentStr = match[1];
  params.components = componentStr
    .split(/\s+/)
    .filter(Boolean)
    .map(c => c.replace(/^"|"$/g, ''));

  // Parse parameters
  const paramStr = match[2];
  const paramRegex = /;(\w+)=(?:"([^"]*)"|(\d+))/g;
  let paramMatch;

  while ((paramMatch = paramRegex.exec(paramStr)) !== null) {
    const [, name, strValue, numValue] = paramMatch;
    const value = strValue ?? numValue;

    switch (name) {
      case 'alg':
        params.alg = value;
        break;
      case 'keyid':
        params.keyid = value;
        break;
      case 'created':
        params.created = parseInt(value, 10);
        break;
      case 'expires':
        params.expires = parseInt(value, 10);
        break;
      case 'nonce':
        params.nonce = value;
        break;
    }
  }

  return params;
}

/** Serialize RFC-8941 structured field parameters */
export function serializeStructuredParams(params: SignatureParams): string {
  const components = params.components.map(c => `"${c}"`).join(' ');
  let result = `(${components})`;

  if (params.alg) {
    result += `;alg="${params.alg}"`;
  }
  if (params.keyid) {
    result += `;keyid="${params.keyid}"`;
  }
  if (params.created !== undefined) {
    result += `;created=${params.created}`;
  }
  if (params.expires !== undefined) {
    result += `;expires=${params.expires}`;
  }
  if (params.nonce) {
    result += `;nonce="${params.nonce}"`;
  }

  return result;
}

/** Build signature base string from message */
export function buildSignatureBase(
  msg: TABMMessage,
  params: SignatureParams
): string {
  const lines: string[] = [];

  for (const component of params.components) {
    if (component.startsWith('@')) {
      // Derived component
      switch (component) {
        case '@method':
          lines.push(`"@method": ${msg['method'] ?? 'GET'}`);
          break;
        case '@path':
          lines.push(`"@path": ${msg['path'] ?? '/'}`);
          break;
        case '@authority':
          lines.push(`"@authority": ${msg['host'] ?? ''}`);
          break;
        case '@target-uri':
          lines.push(`"@target-uri": ${msg['uri'] ?? ''}`);
          break;
        case '@request-target':
          lines.push(`"@request-target": ${msg['method'] ?? 'GET'} ${msg['path'] ?? '/'}`);
          break;
        case '@signature-params':
          // Added last
          break;
        default:
          // Unknown derived component
          break;
      }
    } else {
      // Header/field component
      const value = msg[component];
      if (value !== undefined && value !== null) {
        lines.push(`"${component.toLowerCase()}": ${value}`);
      }
    }
  }

  // Always add signature-params at the end
  lines.push(`"@signature-params": ${serializeStructuredParams(params)}`);

  return lines.join('\n');
}

/** Get message components for signature verification */
export function getSignatureComponents(msg: TABMMessage): string[] {
  const inputStr = msg['signature-input'] as string | undefined;
  if (!inputStr) {
    return [];
  }

  // Parse: sig1=("@method" "@path" ...)...
  const match = inputStr.match(/^\w+=(.+)/);
  if (!match) {
    return [];
  }

  const params = parseStructuredParams(match[1]);
  return params.components;
}

/** Create signature input header value */
export function createSignatureInput(
  label: string,
  params: SignatureParams
): string {
  return `${label}=${serializeStructuredParams(params)}`;
}

/** Extract signature bytes from message */
export function extractSignature(msg: TABMMessage, label: string = 'sig1'): Binary | undefined {
  const sigStr = msg['signature'] as string | Binary | undefined;

  if (!sigStr) {
    return undefined;
  }

  if (sigStr instanceof Uint8Array) {
    return sigStr;
  }

  // Parse: sig1=:base64:
  const regex = new RegExp(`${label}=:([A-Za-z0-9_-]+):`);
  const match = sigStr.match(regex);

  if (match) {
    return fromBase64URL(match[1]);
  }

  // Try direct base64url
  return fromBase64URL(sigStr);
}

/** Create signature header value */
export function createSignatureHeader(label: string, signature: Binary): string {
  return `${label}=:${toBase64URL(signature)}:`;
}

/** Calculate content digest for body */
export async function calculateContentDigest(body: Binary): Promise<string> {
  const hash = await sha256(body);
  return `sha-256=:${toBase64URL(hash)}:`;
}

/** HTTPSig message encoding - adds signature fields */
export function encodeHTTPSig(
  msg: TABMMessage,
  signature: Binary,
  params: SignatureParams,
  label: string = 'sig1'
): TABMMessage {
  return {
    ...msg,
    'signature-input': createSignatureInput(label, params),
    'signature': createSignatureHeader(label, signature),
  };
}

/** Decode HTTPSig message - extracts signature data */
export function decodeHTTPSig(msg: TABMMessage): Result<{
  message: TABMMessage;
  signature: Binary;
  params: SignatureParams;
}> {
  const inputStr = msg['signature-input'] as string | undefined;
  if (!inputStr) {
    return err(400, 'Missing signature-input header');
  }

  // Parse label and params
  const match = inputStr.match(/^(\w+)=(.+)/);
  if (!match) {
    return err(400, 'Invalid signature-input format');
  }

  const [, label, paramStr] = match;
  const params = parseStructuredParams(paramStr);

  const signature = extractSignature(msg, label);
  if (!signature) {
    return err(400, 'Missing or invalid signature');
  }

  // Remove signature fields from message copy
  const message = { ...msg };
  delete message['signature'];
  delete message['signature-input'];

  return ok({ message, signature, params });
}

/** HTTPSig Codec implementation */
export const HTTPSigCodec: Codec = {
  name: 'httpsig',
  mimeType: 'message/http',

  encode(msg: TABMMessage): Result<Binary> {
    // Serialize message as HTTP-like format
    const lines: string[] = [];

    // Request line
    const method = msg['method'] ?? 'GET';
    const path = msg['path'] ?? '/';
    lines.push(`${method} ${path} HTTP/1.1`);

    // Headers
    for (const [key, value] of Object.entries(msg)) {
      if (key === 'method' || key === 'path' || key === 'body') {
        continue;
      }
      if (value !== null && value !== undefined) {
        lines.push(`${key}: ${value}`);
      }
    }

    // Empty line before body
    lines.push('');

    // Body
    const body = msg['body'];
    if (body instanceof Uint8Array) {
      return ok(toBinary(lines.join('\r\n') + '\r\n' + fromBinary(body)));
    } else if (typeof body === 'string') {
      return ok(toBinary(lines.join('\r\n') + '\r\n' + body));
    }

    return ok(toBinary(lines.join('\r\n')));
  },

  decode(data: Binary): Result<TABMMessage> {
    const text = fromBinary(data);
    const lines = text.split(/\r?\n/);

    if (lines.length === 0) {
      return err(400, 'Empty message');
    }

    const msg: TABMMessage = {};

    // Parse request line
    const requestLine = lines[0].match(/^(\w+)\s+(\S+)\s+HTTP\/\d\.\d$/);
    if (requestLine) {
      msg['method'] = requestLine[1];
      msg['path'] = requestLine[2];
    }

    // Parse headers
    let i = 1;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (line === '') {
        break;
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        msg[key] = value;
      }
    }

    // Rest is body
    if (i < lines.length - 1) {
      const bodyText = lines.slice(i + 1).join('\n');
      if (bodyText) {
        msg['body'] = toBinary(bodyText);
      }
    }

    return ok(msg);
  },
};
