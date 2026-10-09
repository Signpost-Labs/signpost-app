import { Readable } from 'stream';

/**
 * Streaming multipart body builder (issue #1295).
 *
 * Pinata's `pinFileToIPFS` takes one complete file in a single multipart
 * POST — no chunked/resumable API of its own — so /complete must still send
 * exactly one file part. This builds that body as a lazily-pulled Node
 * `Readable`: boundary preamble, then each file chunk in order, then the
 * closing boundary. Peak residency is one chunk (~1 MB), never the file.
 *
 * `chunks()` is called lazily on first read so validation gates (MIME,
 * magic bytes) can reject before any byte flows.
 */
export function buildStreamingMultipartBody(
  boundary: string,
  filename: string,
  fileType: string,
  fileSize: number,
  chunks: () => Generator<Buffer, void, void>,
): { stream: Readable; contentLength: number; contentType: string } {
  const safeFilename = filename.replace(/"/g, '_');
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeFilename}"\r\n` +
      `Content-Type: ${fileType}\r\n\r\n`,
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
  const contentLength = preamble.length + fileSize + epilogue.length;

  let phase: 'pre' | 'chunks' | 'post' | 'done' = 'pre';
  let iterator: Generator<Buffer, void, void> | null = null;
  const stream = new Readable({
    read() {
      try {
        if (phase === 'pre') {
          phase = 'chunks';
          this.push(preamble);
          return;
        }
        if (phase === 'chunks') {
          if (!iterator) iterator = chunks();
          const next = iterator.next();
          if (!next.done) {
            // Copy to a plain-ArrayBuffer view for the DOM-lib tsconfig.
            this.push(new Uint8Array(next.value));
            return;
          }
          phase = 'post';
          this.push(epilogue);
          return;
        }
        phase = 'done';
        this.push(null);
      } catch (err) {
        this.destroy(err as Error);
      }
    },
  });

  return {
    stream,
    contentLength,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/** Async byte pieces of streamed file content (no multipart framing). */
export async function* streamFileBytes(
  chunks: () => Generator<Buffer, void, void>,
): AsyncGenerator<Uint8Array, void, void> {
  for (const piece of chunks()) {
    yield new Uint8Array(piece);
  }
}

/**
 * Streams one multipart file part to Pinata's `pinFileToIPFS` and returns
 * the resulting `IpfsHash`. Uses global fetch with `duplex: 'half'` so the
 * request body is the lazily-pulled chunk stream — axios would buffer the
 * whole body before sending.
 *
 * Exported for tests: `__pinStreamedFileToIPFSForTests` overrides the
 * network hop (drain the stream + return a canned CID) while still proving
 * the route streamed the exact file bytes.
 */
export async function pinStreamedFileToIPFS(assembly: {
  filename: string;
  fileType: string;
  totalBytes: number;
  chunks: () => Generator<Buffer, void, void>;
}): Promise<string> {
  const override = (globalThis as unknown as Record<string, unknown>)
    .__pinStreamedFileToIPFSForTests as
    | ((assembly: {
        filename: string;
        fileType: string;
        totalBytes: number;
        chunks: () => Generator<Buffer, void, void>;
      }) => Promise<string>)
    | undefined;
  if (override) return override(assembly);

  const boundary = `----promiscope-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const { stream, contentLength, contentType } = buildStreamingMultipartBody(
    boundary,
    assembly.filename,
    assembly.fileType,
    assembly.totalBytes,
    assembly.chunks,
  );
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(contentLength),
      pinata_api_key: process.env.PINATA_API_KEY ?? '',
      pinata_secret_api_key: process.env.PINATA_SECRET ?? '',
    },
    body: stream as unknown as BodyInit,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
  if (!res.ok) {
    throw new Error(`Pinata upload failed with status ${res.status}`);
  }
  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) {
    throw new Error('Pinata response missing IpfsHash');
  }
  return data.IpfsHash;
}

/** Test helper: drains the streamed file bytes (no framing) into memory. */
export async function collectStreamedFileBytes(
  chunks: () => Generator<Buffer, void, void>,
): Promise<Buffer> {
  const pieces: Uint8Array[] = [];
  for await (const piece of streamFileBytes(chunks)) {
    pieces.push(piece);
  }
  return Buffer.concat(pieces);
}
