/**
 * AO-Core Codec Types
 */

import type { Binary } from './primitives.js';
import type { TABMMessage } from './message.js';
import type { Result } from './result.js';
import type { ResolveOptions } from './options.js';

/** Codec interface for encoding/decoding messages */
export interface Codec {
  /** Codec name identifier */
  name: string;

  /** MIME type this codec handles */
  mimeType: string;

  /** Encode message to wire format */
  encode(msg: TABMMessage): Result<Binary>;

  /** Decode wire format to message */
  decode(data: Binary): Result<TABMMessage>;
}

/** Async codec interface for codecs that require async operations */
export interface AsyncCodec {
  /** Codec name identifier */
  name: string;

  /** MIME type this codec handles */
  mimeType: string;

  /** Encode message to wire format */
  encode(msg: TABMMessage, opts?: ResolveOptions): Promise<Result<Binary>>;

  /** Decode wire format to message */
  decode(data: Binary, opts?: ResolveOptions): Promise<Result<TABMMessage>>;
}

/** Commitment device interface for signing/verification */
export interface CommitmentDevice {
  /** Device name */
  name: string;

  /** Sign message */
  commit(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;

  /** Verify signature(s) */
  verify(
    msg: TABMMessage,
    mode: 'all' | 'any',
    opts: ResolveOptions
  ): Promise<boolean>;

  /** Get list of signers */
  signers(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<string[]>;

  /** Get unsigned message ID */
  unsignedId(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<string>;
}

/** Available content types */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  ANS104: 'application/x-ans-104',
  HTTPSIG: 'message/http',
  TABM: 'application/x-tabm',
  OCTET_STREAM: 'application/octet-stream'
} as const;
