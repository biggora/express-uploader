import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { Uploader, UploadResult } from '../lib/express-uploader';

interface MockRequest {
  files: Record<string, unknown>;
  xhr: boolean;
  header: (name: string) => string | null;
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
  };
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
});
