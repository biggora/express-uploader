/*
 * The MIT License
 *
 * Copyright 2013 Alexey Gordeyev <aleksej@gordejev.lv>.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  RequestHandler,
} from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Uploader } from '../express-uploader';
import type {
  FileObject,
  UploaderOptions,
  UploaderRequest,
  UploadResult,
} from '../express-uploader';

/** Options for {@link withUploader} — extends the core `UploaderOptions` with
 *  Next.js-specific response hooks and a multer limits passthrough. */
export interface WithUploaderOptions extends UploaderOptions {
  /** Called after the core's upload callback fires. Default when omitted:
   *  `res.status(200).json(result)`. Per-file failures (where
   *  `result.success === false`) still flow through here — the core surfaces
   *  them on the result, not via throw. */
  onSuccess?: (
    result: UploadResult[] | UploadResult | FileObject,
    req: NextApiRequest,
    res: NextApiResponse
  ) => void | Promise<void>;

  /** Called when multer or the upload pipeline throws before / instead of the
   *  core's callback. Default when omitted: `res.status(500).json({ error: err.message })`. */
  onError?: (err: Error, req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

  /** Forwarded verbatim to `multer({ limits })`. */
  multerLimits?: multer.Options['limits'];

  /** Multer field name to accept. When set, the handler uses
   *  `upload.array(fieldName)`; otherwise it uses `upload.any()`. */
  fieldName?: string;
}

/**
 * Wraps {@link Uploader} as a Next.js Pages Router `NextApiHandler`. Handles
 * method filtering (POST/PUT only), shims `req.xhr` / `req.header()` so the
 * core's two-branch dispatch works, runs multer for multipart bodies, and
 * delegates the actual move/validate/thumbnail pipeline to `Uploader`.
 *
 * The page that mounts this handler MUST disable Next's body parser:
 * `export const config = { api: { bodyParser: false } }`.
 */
export function withUploader(options: WithUploaderOptions = {}): NextApiHandler {
  const { onSuccess, onError, multerLimits, fieldName, ...uploaderOptions } = options;

  // The core's default tmpDir lives inside __dirname (i.e. node_modules under
  // Next.js) which is read-only on most serverless deploys. Substitute a safe
  // default before constructing Uploader.
  const resolvedTmpDir = uploaderOptions.tmpDir ?? path.join(os.tmpdir(), 'express-uploader');
  // Multer's diskStorage does not auto-create `destination`; create it once at
  // handler-factory time. `recursive: true` is idempotent.
  fs.mkdirSync(resolvedTmpDir, { recursive: true });
  const resolvedOptions: UploaderOptions = { ...uploaderOptions, tmpDir: resolvedTmpDir };
  // Cache a single Uploader for the lifetime of the handler — mirrors the
  // Nest adapter's singleton-via-DI pattern.
  const uploader = new Uploader(resolvedOptions);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb): void => cb(null, resolvedTmpDir),
    filename: (_req, file, cb): void => cb(null, randomUUID() + path.extname(file.originalname)),
  });
  const upload = multer({ storage, limits: multerLimits });
  const multerHandler: RequestHandler =
    typeof fieldName === 'string' ? upload.array(fieldName) : upload.any();

  return async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    try {
      const method = (req.method ?? 'GET').toUpperCase();
      if (method !== 'POST' && method !== 'PUT') {
        res.setHeader('Allow', 'POST, PUT');
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
      }

      applyShim(req);

      if (!isXhrStream(req)) {
        await runMulter(req, res, multerHandler);
      }

      // Boundary cast: NextApiRequest + the shim above structurally satisfies
      // UploaderRequest; TS can't see the shim, so we cross the boundary once.
      const uploaderReq = req as unknown as UploaderRequest;

      const result = await new Promise<UploadResult[] | UploadResult | FileObject>((resolve) => {
        uploader.uploadFile(uploaderReq, (r) => resolve(r));
      });

      if (onSuccess) {
        await onSuccess(result, req, res);
      } else {
        res.status(200).json(result);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await dispatchError(error, req, res, onError);
    }
  };
}

/**
 * Installs `req.xhr` (boolean) and `req.header(name)` on the request instance.
 * Uses `Object.defineProperty` with `configurable: true` so the underlying
 * prototype is never mutated — subsequent handlers see a clean request.
 */
function applyShim(req: NextApiRequest): void {
  Object.defineProperty(req, 'xhr', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: isXhrStream(req),
  });

  Object.defineProperty(req, 'header', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: (name: string): string | undefined => headerString(req, name),
  });
}

/** Reads a header from `req.headers` case-insensitively. If the header is an
 *  array (Node allows it for some headers), returns the first element. */
function headerString(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/** True when the request matches the core's XHR-stream contract: `x-file-name`
 *  header is present AND `content-type` is NOT multipart. */
function isXhrStream(req: NextApiRequest): boolean {
  const contentType = headerString(req, 'content-type');
  const xFileName = headerString(req, 'x-file-name');
  const isMultipart = typeof contentType === 'string' && contentType.startsWith('multipart/');
  return !isMultipart && typeof xFileName === 'string' && xFileName.length > 0;
}

/** Promisified wrapper around the multer middleware. Rejects with an `Error`
 *  on multer failure (size limit, storage error, etc.). */
function runMulter(req: NextApiRequest, res: NextApiResponse, mw: RequestHandler): Promise<void> {
  return new Promise((resolve, reject) => {
    // Boundary cast: multer's signature requires Express's Request/Response.
    // NextApiRequest/Response are structurally compatible at runtime.
    mw(req as unknown as ExpressRequest, res as unknown as ExpressResponse, (err?: unknown) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve();
    });
  });
}

/** Routes an unexpected error through `onError` if provided, otherwise emits
 *  the default `500 { error: err.message }` response. Swallows secondary
 *  failures from `onError` itself to keep the handler from throwing. */
async function dispatchError(
  err: Error,
  req: NextApiRequest,
  res: NextApiResponse,
  onError: WithUploaderOptions['onError']
): Promise<void> {
  if (onError) {
    try {
      await onError(err, req, res);
      return;
    } catch {
      // fall through to default below
    }
  }
  if (!res.writableEnded) {
    res.status(500).json({ error: err.message });
  }
}
