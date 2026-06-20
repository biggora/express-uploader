import * as fs from 'fs';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import * as os from 'os';
import * as path from 'path';
import FormData from 'form-data';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { withUploader } from '../../lib/adapters/next';
import type { WithUploaderOptions } from '../../lib/adapters/next';
import type { UploadResult } from '../../lib/express-uploader';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

function createTempDirs(): { tmpDir: string; uploadDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-adapter-test-'));
  tempRoots.push(root);
  const tmpDir = path.join(root, 'tmp');
  const uploadDir = path.join(root, 'upload');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  return { tmpDir, uploadDir };
}

/**
 * Augments a plain Node ServerResponse with the methods that Next.js's
 * apiResolver adds before invoking the handler. Without these, calling
 * `res.status(200).json(body)` would throw at runtime.
 */
function shimNextApiResponse(res: ServerResponse): NextApiResponse {
  const shimmed = res as ServerResponse & {
    status(code: number): NextApiResponse;
    json(body: unknown): void;
    send(body: unknown): void;
    setPreviewData: unknown;
    clearPreviewData: unknown;
  };

  shimmed.status = function statusShim(code: number): NextApiResponse {
    res.statusCode = code;
    return shimmed as unknown as NextApiResponse;
  };

  shimmed.json = function jsonShim(body: unknown): void {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const payload = JSON.stringify(body);
    res.setHeader('Content-Length', Buffer.byteLength(payload));
    res.end(payload);
  };

  shimmed.send = function sendShim(body: unknown): void {
    if (typeof body === 'string') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(body);
    } else if (Buffer.isBuffer(body)) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(body);
    } else {
      shimmed.json(body);
    }
  };

  // Stub out preview-data methods so the response type is satisfied
  shimmed.setPreviewData = (): NextApiResponse => shimmed as unknown as NextApiResponse;
  shimmed.clearPreviewData = (): NextApiResponse => shimmed as unknown as NextApiResponse;

  return shimmed as unknown as NextApiResponse;
}

/**
 * Creates an HTTP server that drives the given `withUploader` handler.
 * The server shims the ServerResponse to look like NextApiResponse so that
 * `res.status(N).json(body)` works exactly as it would under Next.js.
 */
function buildServer(options: WithUploaderOptions) {
  const handler = withUploader(options);
  return createServer((rawReq: IncomingMessage, rawRes: ServerResponse) => {
    const req = rawReq as unknown as NextApiRequest;
    const res = shimNextApiResponse(rawRes);
    Promise.resolve(handler(req, res)).catch((err: unknown) => {
      if (!rawRes.writableEnded) {
        rawRes.statusCode = 500;
        rawRes.end(String(err));
      }
    });
  });
}

function defaultOptions(dirs: { tmpDir: string; uploadDir: string }): WithUploaderOptions {
  return {
    tmpDir: dirs.tmpDir,
    uploadDir: dirs.uploadDir,
    uploadUrl: '/files/',
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// 1. Handler shape
// ---------------------------------------------------------------------------

describe('withUploader — handler shape', () => {
  it('withUploader({}) returns a function with arity 2 (NextApiHandler)', () => {
    const handler = withUploader({});
    expect(typeof handler).toBe('function');
    // NextApiHandler signature: (req, res) => ...
    expect(handler.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. Method gating
// ---------------------------------------------------------------------------

describe('withUploader — method gating', () => {
  it('GET request returns 405 with Allow: POST, PUT header and error body', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    const res = await request(server).get('/upload');

    expect(res.status).toBe(405);
    expect(res.headers['allow']).toBe('POST, PUT');
    expect(res.body).toMatchObject({ error: 'Method Not Allowed' });
  });
});

// ---------------------------------------------------------------------------
// 3. Form path (POST multipart)
// ---------------------------------------------------------------------------

describe('withUploader — form path', () => {
  it('POST multipart single file returns 200 array with one success entry; file written to uploadDir', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    const form = new FormData();
    form.append('files', Buffer.from('hello world'), {
      filename: 'hello.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);

    const [entry] = res.body as UploadResult[];
    expect(entry.success).toBe(true);
    expect(entry.originalName).toBe('hello.txt');

    const uploadedPath = path.join(dirs.uploadDir, entry.name);
    expect(fs.existsSync(uploadedPath)).toBe(true);
    expect(fs.readFileSync(uploadedPath, 'utf8')).toBe('hello world');
  });

  it('POST multipart multiple files returns 200 array with N success entries', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    const form = new FormData();
    form.append('files', Buffer.from('file one'), {
      filename: 'one.txt',
      contentType: 'text/plain',
    });
    form.append('files', Buffer.from('file two'), {
      filename: 'two.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const results = res.body as UploadResult[];
    expect(results.every((r) => r.success === true)).toBe(true);

    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['one.txt', 'two.txt'].sort());
  });

  it('POST with no files returns 200 with single object containing error: Not files found!', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    // Empty multipart body — multer parses nothing, so req.files is empty
    const form = new FormData();

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body).toMatchObject({ error: 'Not files found!' });
  });

  it('fieldName option: uploading under wrong field name triggers multer LIMIT_UNEXPECTED_FILE error', async () => {
    const dirs = createTempDirs();
    let capturedError: Error | null = null;

    const server = buildServer({
      ...defaultOptions(dirs),
      fieldName: 'avatar', // handler expects "avatar" field
      onError: (err, _req, res) => {
        capturedError = err;
        res.status(422).json({ uploadError: err.message });
      },
    });

    // Send under "files" instead of "avatar" — multer v2 rejects unexpected fields
    const form = new FormData();
    form.append('files', Buffer.from('content'), {
      filename: 'test.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    // multer v2 with .array('avatar') throws LIMIT_UNEXPECTED_FILE for the "files" field
    expect(res.status).toBe(422);
    expect(capturedError).not.toBeNull();
    expect((capturedError as unknown as Error).message).toMatch(/unexpected field/i);
  });
});

// ---------------------------------------------------------------------------
// 4. XHR path (PUT raw body)
// ---------------------------------------------------------------------------

describe('withUploader — XHR path', () => {
  it('PUT with x-file-name header and raw body triggers XHR path; returns single UploadResult', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    const body = Buffer.from('binary content');
    const res = await request(server)
      .put('/upload')
      .set('x-file-name', 'upload.bin')
      .set('x-file-size', String(body.length))
      .set('content-type', 'application/octet-stream')
      .send(body);

    expect(res.status).toBe(200);
    // XHR path returns a single object, not an array
    expect(Array.isArray(res.body)).toBe(false);

    const result = res.body as UploadResult;
    expect(result.success).toBe(true);
    expect(result.originalName).toBe('upload.bin');

    const uploadedPath = path.join(dirs.uploadDir, result.name);
    expect(fs.existsSync(uploadedPath)).toBe(true);
    expect(fs.readFileSync(uploadedPath, 'utf8')).toBe('binary content');
  });
});

// ---------------------------------------------------------------------------
// 5. Hooks: onSuccess and onError
// ---------------------------------------------------------------------------

describe('withUploader — hooks', () => {
  it('onSuccess override is called with result; custom status code is what reaches the client', async () => {
    const dirs = createTempDirs();
    const server = buildServer({
      ...defaultOptions(dirs),
      onSuccess: (result, _req, res) => {
        res.status(201).json({ custom: true, result });
      },
    });

    const form = new FormData();
    form.append('files', Buffer.from('data'), {
      filename: 'hook.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    // Custom status from onSuccess, not the default 200
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ custom: true });
    expect(Array.isArray(res.body.result)).toBe(true);

    const [entry] = res.body.result as UploadResult[];
    expect(entry.success).toBe(true);
  });

  it('onError override is called when multer rejects an oversized file', async () => {
    const dirs = createTempDirs();
    let capturedError: Error | null = null;

    const server = buildServer({
      ...defaultOptions(dirs),
      multerLimits: { fileSize: 1 }, // 1 byte — file below will exceed this
      onError: (err, _req, res) => {
        capturedError = err;
        res.status(400).json({ uploadError: err.message });
      },
    });

    const form = new FormData();
    // 100 bytes — well above the 1-byte multer limit
    form.append('files', Buffer.alloc(100, 'x'), {
      filename: 'big.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(400);
    expect(capturedError).not.toBeNull();
    expect(res.body).toHaveProperty('uploadError');
  });
});

// ---------------------------------------------------------------------------
// 6. Shims and prototype safety
// ---------------------------------------------------------------------------

describe('withUploader — shims and prototype safety', () => {
  it('req.header shim performs case-insensitive lookup: X-FILE-NAME returns same value as x-file-name', async () => {
    const dirs = createTempDirs();
    let capturedHeaderValue: string | undefined;

    const server = buildServer({
      ...defaultOptions(dirs),
      onSuccess: (result, req, res) => {
        // The shim installs req.header(); test case-insensitive access
        type ShimmedReq = typeof req & { header(name: string): string | undefined };
        capturedHeaderValue = (req as ShimmedReq).header('X-FILE-NAME');
        res.status(200).json(result);
      },
    });

    const body = Buffer.from('shim test data');
    const res = await request(server)
      .put('/upload')
      .set('x-file-name', 'shim.bin')
      .set('x-file-size', String(body.length))
      .set('content-type', 'application/octet-stream')
      .send(body);

    expect(res.status).toBe(200);
    expect(capturedHeaderValue).toBe('shim.bin');
  });

  it('req.xhr shim is false for multipart POST', async () => {
    const dirs = createTempDirs();
    let capturedXhr: unknown;

    const server = buildServer({
      ...defaultOptions(dirs),
      onSuccess: (result, req, res) => {
        type ShimmedReq = typeof req & { xhr: boolean };
        capturedXhr = (req as ShimmedReq).xhr;
        res.status(200).json(result);
      },
    });

    const form = new FormData();
    form.append('files', Buffer.from('data'), {
      filename: 'xhr-test.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(200);
    expect(capturedXhr).toBe(false);
  });

  it('req.xhr shim is true for PUT with x-file-name and non-multipart content-type', async () => {
    const dirs = createTempDirs();
    let capturedXhr: unknown;

    const server = buildServer({
      ...defaultOptions(dirs),
      onSuccess: (result, req, res) => {
        type ShimmedReq = typeof req & { xhr: boolean };
        capturedXhr = (req as ShimmedReq).xhr;
        res.status(200).json(result);
      },
    });

    const body = Buffer.from('raw body data');
    const res = await request(server)
      .put('/upload')
      .set('x-file-name', 'raw.bin')
      .set('x-file-size', String(body.length))
      .set('content-type', 'application/octet-stream')
      .send(body);

    expect(res.status).toBe(200);
    expect(capturedXhr).toBe(true);
  });

  it('handler does not permanently mutate the IncomingMessage prototype', async () => {
    const dirs = createTempDirs();
    const server = buildServer(defaultOptions(dirs));

    const form = new FormData();
    form.append('files', Buffer.from('proto-test'), {
      filename: 'proto.txt',
      contentType: 'text/plain',
    });

    await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    // The shim uses Object.defineProperty on the instance (not the prototype).
    // Verify IncomingMessage.prototype itself was not mutated.
    expect(Object.prototype.hasOwnProperty.call(IncomingMessage.prototype, 'xhr')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(IncomingMessage.prototype, 'header')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Default tmpDir fallback
// ---------------------------------------------------------------------------

describe('withUploader — default tmpDir fallback', () => {
  it('upload succeeds when tmpDir is not provided; adapter uses os.tmpdir()-based path not __dirname', async () => {
    const dirs = createTempDirs();

    // The adapter resolves tmpDir to os.tmpdir()/express-uploader when not provided.
    // Pre-create that directory so multer can write temp files there (the adapter's
    // Uploader would normally create it too, but multer runs first).
    const fallbackTmpDir = path.join(os.tmpdir(), 'express-uploader');
    fs.mkdirSync(fallbackTmpDir, { recursive: true });

    // Deliberately omit tmpDir — adapter should use os.tmpdir() + 'express-uploader'
    // rather than the core's default of path.join(__dirname, 'tmp') (which would be
    // inside node_modules and read-only on serverless deploys).
    const server = buildServer({
      uploadDir: dirs.uploadDir,
      uploadUrl: '/files/',
    });

    const form = new FormData();
    form.append('files', Buffer.from('default tmp content'), {
      filename: 'default.txt',
      contentType: 'text/plain',
    });

    const res = await request(server).post('/upload').set(form.getHeaders()).send(form.getBuffer());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const [entry] = res.body as UploadResult[];
    expect(entry.success).toBe(true);

    // File lands in the uploadDir, confirming the full pipeline ran successfully
    const uploadedPath = path.join(dirs.uploadDir, entry.name);
    expect(fs.existsSync(uploadedPath)).toBe(true);
  });
});
