import type { WorkerEnv } from '@intelligo/shared/env';

export const MEDIA_BUCKET = 'posters';

export interface MediaStore {
  /** Stores the file under `path` in the posters bucket and returns its public URL. */
  upload(path: string, bytes: Buffer, contentType: string): Promise<string>;
  /** Reads a stored file back (the review looks at the images). */
  read(url: string): Promise<Buffer>;
}

export class MediaStoreError extends Error {}

/** Supabase Storage over its REST API with the service role key (worker only). */
export class SupabaseMediaStore implements MediaStore {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
  ) {}

  async upload(path: string, bytes: Buffer, contentType: string): Promise<string> {
    const base = this.baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${base}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.serviceKey}`,
        apikey: this.serviceKey,
        'content-type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new MediaStoreError(
        `Upload gambar ke Supabase Storage gagal (HTTP ${response.status}).`,
      );
    }
    return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
  }

  async read(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new MediaStoreError(`Gambar tidak bisa dibaca (HTTP ${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }
}

/** In-memory store for tests. */
export class MemoryMediaStore implements MediaStore {
  readonly files = new Map<string, { bytes: Buffer; contentType: string }>();

  upload(path: string, bytes: Buffer, contentType: string): Promise<string> {
    const url = `https://media.test/${MEDIA_BUCKET}/${path}`;
    this.files.set(url, { bytes, contentType });
    return Promise.resolve(url);
  }

  read(url: string): Promise<Buffer> {
    const file = this.files.get(url);
    return file ? Promise.resolve(file.bytes) : Promise.reject(new MediaStoreError('tidak ada'));
  }
}

class MissingMediaConfig implements MediaStore {
  private fail(): Promise<never> {
    return Promise.reject(
      new MediaStoreError(
        'NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diisi di worker (penyimpanan gambar).',
      ),
    );
  }
  upload(): Promise<string> {
    return this.fail();
  }
  read(): Promise<Buffer> {
    return this.fail();
  }
}

export function createMediaStore(env: WorkerEnv): MediaStore {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    return new MissingMediaConfig();
  return new SupabaseMediaStore(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}
