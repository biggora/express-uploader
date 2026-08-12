import * as fs from 'fs';
import { createRequire } from 'module';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { afterEach, describe, expect, it } from 'vitest';
import { Uploader, UploadResult } from '../lib/express-uploader';

const requireFromTest = createRequire(__filename);

interface MockRequest {
  files: Record<string, unknown>;
  xhr: boolean;
  header: (name: string) => string | null | undefined;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
  pipe: (dest: NodeJS.WritableStream) => unknown;
}

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'express-uploader-'));
  tempRoots.push(root);
  return root;
}

function createUploader(root: string, options: ConstructorParameters<typeof Uploader>[0] = {}) {
  return new Uploader({
    tmpDir: path.join(root, 'tmp'),
    publicDir: path.join(root, 'public'),
    uploadDir: path.join(root, 'public', 'files'),
    uploadUrl: '/files/',
    ...options,
  });
}

function createRequest(files: Record<string, unknown> = {}): MockRequest {
  return {
    files,
    xhr: false,
    header: () => null,
    on: () => undefined,
    pipe: () => undefined,
  };
}

function createXhrRequest(name: string, body: string, declaredSize = Buffer.byteLength(body)) {
  const request = Readable.from([Buffer.from(body)]) as Readable & MockRequest;
  request.files = {};
  request.xhr = true;
  request.header = (headerName: string) => {
    const normalized = headerName.toLowerCase();
    if (normalized === 'x-file-name') return name;
    if (normalized === 'x-file-size') return String(declaredSize);
    return null;
  };
  return request;
}

function uploadFile(uploader: Uploader, req: MockRequest): Promise<UploadResult | UploadResult[]> {
  return new Promise((resolve) => {
    uploader.uploadFile(req, (result) => resolve(result as UploadResult | UploadResult[]));
  });
}

function writeUploadSource(root: string, name: string, body = 'file contents') {
  const sourceDir = path.join(root, 'incoming');
  fs.mkdirSync(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, name);
  fs.writeFileSync(sourcePath, body);
  return sourcePath;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('Uploader', () => {
  it('moves an uploaded file into the configured upload directory', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const sourcePath = writeUploadSource(root, 'avatar.txt', 'uploaded payload');
    const req = createRequest({
      avatar: {
        path: sourcePath,
        name: 'avatar.txt',
        size: 16,
        type: 'text/plain',
      },
    });

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'avatar.txt',
      name: 'avatar.txt',
      size: 16,
      type: 'text/plain',
      url: '/files/avatar.txt',
      success: true,
    });
    expect(file.error).toBeUndefined();
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'avatar.txt'), 'utf8')).toBe(
      'uploaded payload'
    );
  });

  it('returns a no-op error result when no files are present', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const req = createRequest();

    const result = await uploadFile(uploader, req);

    expect(result).toMatchObject({
      originalName: '',
      name: '',
      size: 0,
      error: 'Not files found!',
    });
    expect(req.files).toEqual({});
    expect(fs.existsSync(path.join(root, 'public', 'files'))).toBe(true);
  });

  it('rejects invalid uploads when validation is enabled', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root, {
      validate: true,
      maxFileSize: 5,
    });
    const sourcePath = writeUploadSource(root, 'too-large.txt', 'oversized');
    const req = createRequest({
      attachment: {
        path: sourcePath,
        name: 'too-large.txt',
        size: 9,
        type: 'text/plain',
      },
    });

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'too-large.txt',
      name: 'too-large.txt',
      success: false,
      error: 'File is too big',
    });
    expect(fs.existsSync(sourcePath)).toBe(false);
    expect(fs.existsSync(path.join(root, 'public', 'files', 'too-large.txt'))).toBe(false);
  });

  it('validates file types against acceptFileTypes', () => {
    const uploader = new Uploader({
      validate: true,
      acceptFileTypes: /\.png$/i,
    });

    expect(uploader.validate({ name: 'document.pdf', size: 10, type: 'application/pdf' })).toBe(
      'Filetype not allowed'
    );
    expect(uploader.validate({ name: 'photo.png', size: 10, type: 'image/png' })).toBe(false);
  });

  it('normalizes configured directories and upload URLs', () => {
    const root = createTempRoot();
    const uploader = createUploader(root, {
      safeName: false,
      uploadUrl: '/assets/',
      minFileSize: 3,
      maxFileSize: 30,
    });

    expect(uploader.settings.safeName).toBe(false);
    expect(uploader.settings.uploadUrl).toBe('/assets/');
    expect(uploader.settings.minFileSize).toBe(3);
    expect(uploader.settings.maxFileSize).toBe(30);
    expect(uploader.settings.tmpDir.endsWith(path.sep)).toBe(true);
    expect(uploader.settings.publicDir.endsWith(path.sep)).toBe(true);
    expect(uploader.settings.uploadDir.endsWith(path.sep)).toBe(true);
  });

  it('uses the source basename when safeName is disabled', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root, {
      safeName: false,
    });
    const sourcePath = writeUploadSource(root, 'generated-name.tmp', 'stored as basename');
    const req = createRequest({
      upload: {
        path: sourcePath,
        name: 'original.txt',
        size: 18,
        type: 'text/plain',
      },
    });

    const result = await uploadFile(uploader, req);

    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'original.txt',
      name: 'generated-name.tmp',
      url: '/files/generated-name.tmp',
      success: true,
    });
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'generated-name.tmp'), 'utf8')).toBe(
      'stored as basename'
    );
  });

  it('sanitizes unsafe names and avoids collisions', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    fs.mkdirSync(path.join(root, 'public', 'files'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public', 'files', 'avatar.txt'), 'existing');
    const sourcePath = writeUploadSource(root, 'incoming-avatar.txt', 'new content');
    const req = createRequest({
      avatar: {
        path: sourcePath,
        name: '../.avatar.txt',
        size: 11,
        type: 'text/plain',
      },
    });

    const result = await uploadFile(uploader, req);

    const [file] = result as UploadResult[];
    expect(file.name).toBe('avatar_1.txt');
    expect(file.url).toBe('/files/avatar_1.txt');
    expect(file.success).toBe(true);
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'avatar.txt'), 'utf8')).toBe(
      'existing'
    );
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'avatar_1.txt'), 'utf8')).toBe(
      'new content'
    );
  });

  it('sanitizes direct XHR upload names before moving files', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const req = createXhrRequest('../escape.txt', 'xhr payload');

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(false);
    const file = result as UploadResult;
    expect(file).toMatchObject({
      originalName: 'escape.txt',
      name: 'escape.txt',
      url: '/files/escape.txt',
      success: true,
    });
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'escape.txt'), 'utf8')).toBe(
      'xhr payload'
    );
    expect(fs.existsSync(path.join(root, 'public', 'escape.txt'))).toBe(false);
  });

  it('rejects direct XHR uploads whose streamed bytes exceed the configured limit', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root, {
      validate: true,
      maxFileSize: 4,
    });
    const req = createXhrRequest('too-large.txt', 'oversized payload', 1);

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(false);
    const file = result as UploadResult;
    expect(file).toMatchObject({
      originalName: 'too-large.txt',
      name: 'too-large.txt',
      success: false,
      error: 'File is too big',
    });
    expect(fs.existsSync(path.join(root, 'public', 'files', 'too-large.txt'))).toBe(false);
  });

  it('reserves safe names for duplicate files in the same request', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const firstSource = writeUploadSource(root, 'first-upload.tmp', 'first');
    const secondSource = writeUploadSource(root, 'second-upload.tmp', 'second');
    const req = createRequest({
      first: {
        path: firstSource,
        name: 'duplicate.txt',
        size: 5,
        type: 'text/plain',
      },
      second: {
        path: secondSource,
        name: 'duplicate.txt',
        size: 6,
        type: 'text/plain',
      },
    });

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const files = result as UploadResult[];
    expect(files.map((file) => file.name).sort()).toEqual(['duplicate.txt', 'duplicate_1.txt']);
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'duplicate.txt'), 'utf8')).toBe(
      'first'
    );
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'duplicate_1.txt'), 'utf8')).toBe(
      'second'
    );
  });

  it('normalizes Multer-style file arrays', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const sourcePath = writeUploadSource(root, 'multer-generated.tmp', 'multer payload');
    const req = {
      files: [
        {
          path: sourcePath,
          originalname: 'multer-name.txt',
          size: 14,
          mimetype: 'text/plain',
        },
      ],
      xhr: false,
      header: () => null,
    } as unknown as MockRequest;

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'multer-name.txt',
      name: 'multer-name.txt',
      type: 'text/plain',
      success: true,
    });
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'multer-name.txt'), 'utf8')).toBe(
      'multer payload'
    );
  });

  it('supports the documented CommonJS constructor entrypoint', () => {
    const CommonJsUploader = requireFromTest('..');

    expect(typeof CommonJsUploader).toBe('function');
    expect(CommonJsUploader.Uploader).toBe(CommonJsUploader);
    expect(CommonJsUploader.default).toBe(CommonJsUploader);
    expect(new CommonJsUploader().uploadFile).toBeTypeOf('function');
  });

  it('reports Invalid upload headers when XHR x-file-name is missing', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const request = Readable.from([Buffer.from('payload')]) as Readable & MockRequest;
    request.files = {};
    request.xhr = true;
    request.header = () => null;

    const result = await uploadFile(uploader, request);

    expect(Array.isArray(result)).toBe(false);
    const file = result as UploadResult;
    expect(file.error).toBe('Invalid upload headers');
  });

  it('reports Invalid upload headers when XHR x-file-size is non-numeric', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const request = Readable.from([Buffer.from('payload')]) as Readable & MockRequest;
    request.files = {};
    request.xhr = true;
    request.header = (name: string) => {
      if (name.toLowerCase() === 'x-file-name') return 'broken.txt';
      if (name.toLowerCase() === 'x-file-size') return 'not-a-number';
      return null;
    };

    const result = await uploadFile(uploader, request);

    expect(Array.isArray(result)).toBe(false);
    const file = result as UploadResult;
    expect(file.error).toBe('Invalid upload headers');
  });

  it('returns a validation error for oversized files on the form path', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root, { validate: true, maxFileSize: 4 });
    const sourcePath = writeUploadSource(root, 'oversized.tmp', 'this is too big');
    const req = createRequest({
      big: { path: sourcePath, name: 'oversized.txt', size: 15, type: 'text/plain' },
    });

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'oversized.txt',
      success: false,
      error: 'File is too big',
    });
    expect(fs.existsSync(path.join(root, 'public', 'files', 'oversized.txt'))).toBe(false);
  });

  it('keeps numbering safe names beyond the first collision', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const uploadDir = path.join(root, 'public', 'files');
    fs.mkdirSync(uploadDir, { recursive: true });
    for (let i = 0; i <= 9; i++) {
      const name = i === 0 ? 'avatar.txt' : `avatar_${i}.txt`;
      fs.writeFileSync(path.join(uploadDir, name), 'existing');
    }
    const sourcePath = writeUploadSource(root, 'fresh-upload.tmp', 'new');
    const req = createRequest({
      avatar: { path: sourcePath, name: 'avatar.txt', size: 3, type: 'text/plain' },
    });

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const [file] = result as UploadResult[];
    expect(file.name).toBe('avatar_10.txt');
    expect(fs.readFileSync(path.join(uploadDir, 'avatar_10.txt'), 'utf8')).toBe('new');
  });

  it('accepts a single Multer file passed under req.files directly', async () => {
    const root = createTempRoot();
    const uploader = createUploader(root);
    const sourcePath = writeUploadSource(root, 'single-multer.tmp', 'one shot');
    const req = {
      files: {
        path: sourcePath,
        originalname: 'single.txt',
        size: 8,
        mimetype: 'text/plain',
      },
      xhr: false,
      header: () => null,
    } as unknown as MockRequest;

    const result = await uploadFile(uploader, req);

    expect(Array.isArray(result)).toBe(true);
    const [file] = result as UploadResult[];
    expect(file).toMatchObject({
      originalName: 'single.txt',
      name: 'single.txt',
      success: true,
    });
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'single.txt'), 'utf8')).toBe(
      'one shot'
    );
  });
});
