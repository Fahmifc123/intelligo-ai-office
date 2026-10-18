import { deflateSync } from 'node:zlib';
import type { WorkerEnv } from '@intelligo/shared/env';
import { z } from 'zod';
import { LlmConfigError } from './types';

export interface ImageRequest {
  prompt: string;
  /** Used to vary the placeholder in scripted mode (slide number). */
  seed: number;
}

export interface GeneratedImage {
  bytes: Buffer;
  contentType: 'image/jpeg' | 'image/png';
  model: string;
}

export interface ImageClient {
  readonly mode: 'live' | 'scripted';
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

export class ImageError extends Error {}

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
/** Generation can take close to a minute per image at high quality. */
const IMAGE_TIMEOUT_MS = 120_000;

const ImagesResponse = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
});

/** OpenAI Images API (model from MODEL_IMAGE). Returns JPEG, which suits Instagram. */
export class OpenAiImageClient implements ImageClient {
  readonly mode = 'live' as const;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly size: WorkerEnv['IMAGE_SIZE'],
    private readonly quality: WorkerEnv['IMAGE_QUALITY'],
  ) {}

  async generate(request: ImageRequest): Promise<GeneratedImage> {
    const response = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        n: 1,
        size: this.size,
        quality: this.quality,
        output_format: 'jpeg',
        output_compression: 85,
      }),
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      const message = z
        .object({ error: z.object({ message: z.string() }) })
        .safeParse(safeJson(text));
      throw new ImageError(
        `OpenAI Images membalas HTTP ${response.status}${message.success ? `: ${message.data.error.message.slice(0, 200)}` : ''}`,
      );
    }
    const parsed = ImagesResponse.safeParse(safeJson(text));
    if (!parsed.success) throw new ImageError('Balasan OpenAI Images tidak berisi gambar.');
    const first = parsed.data.data[0];
    if (!first) throw new ImageError('Balasan OpenAI Images tidak berisi gambar.');
    return {
      bytes: Buffer.from(first.b64_json, 'base64'),
      contentType: 'image/jpeg',
      model: this.model,
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

class MissingImageConfig implements ImageClient {
  readonly mode = 'live' as const;
  generate(): Promise<GeneratedImage> {
    return Promise.reject(
      new LlmConfigError('OPENAI_API_KEY dan MODEL_IMAGE belum diisi di worker (desain carousel).'),
    );
  }
}

/**
 * Deterministic placeholder slides for e2e tests and offline demos: brand navy with an orange
 * band whose position follows the slide number. No network.
 */
export class ScriptedImageClient implements ImageClient {
  readonly mode = 'scripted' as const;

  generate(request: ImageRequest): Promise<GeneratedImage> {
    return Promise.resolve({
      bytes: placeholderPng(request.seed),
      contentType: 'image/png',
      model: 'scripted-image',
    });
  }
}

export function createImageClient(env: WorkerEnv): ImageClient {
  if (env.LLM_MODE === 'scripted') return new ScriptedImageClient();
  if (!env.OPENAI_API_KEY || !env.MODEL_IMAGE) return new MissingImageConfig();
  return new OpenAiImageClient(
    env.OPENAI_API_KEY,
    env.MODEL_IMAGE,
    env.IMAGE_SIZE,
    env.IMAGE_QUALITY,
  );
}

/* ---------- Minimal PNG encoder for the placeholder ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const PLACEHOLDER_SIZE = 320;

export function placeholderPng(seed: number): Buffer {
  const size = PLACEHOLDER_SIZE;
  const navy = [2, 48, 71];
  const orange = [255, 84, 0];
  const bandTop = 40 + ((seed * 47) % (size - 120));
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    const color = y >= bandTop && y < bandTop + 40 ? orange : navy;
    for (let x = 0; x < size; x++) row.set(color, 1 + x * 3);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
