import 'reflect-metadata';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  Controller,
  Module,
  Post,
  Req,
  type Type,
  UploadedFiles,
  UseInterceptors,
  ValueProvider,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request as ExpressRequest } from 'express';
import multer from 'multer';
import request from 'supertest';

import type { FileObject, UploaderOptions, UploadResult } from '../../lib/express-uploader';
import { Uploader } from '../../lib/express-uploader';
import {
  UPLOADER_INSTANCE,
  UPLOADER_OPTIONS,
  UploaderModule,
  UploaderService,
} from '../../lib/adapters/nest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-adapter-'));
  tempRoots.push(root);
  return root;
}

function uploaderOptions(root: string, extra: UploaderOptions = {}): UploaderOptions {
  return {
    tmpDir: path.join(root, 'tmp'),
    publicDir: path.join(root, 'public'),
    uploadDir: path.join(root, 'public', 'files'),
    uploadUrl: '/files/',
    ...extra,
  };
}

function writeSourceFile(root: string, name: string, body = 'file contents'): string {
  const sourceDir = path.join(root, 'incoming');
  fs.mkdirSync(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, name);
  fs.writeFileSync(sourcePath, body);
  return sourcePath;
}

interface MockRequest {
  files: Record<string, unknown>;
  xhr: boolean;
  header: (name: string) => string | null | undefined;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
  pipe: (dest: NodeJS.WritableStream) => unknown;
}

function createMockRequest(files: Record<string, unknown> = {}): MockRequest {
  return {
    files,
    xhr: false,
    header: () => null,
    on: () => undefined,
    pipe: () => undefined,
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
// Controller factory used in integration tests.
// We create the controller class inside each test so its FilesInterceptor can
// reference the per-test tmpDir via disk storage.
// Returns Type<unknown> so it is assignable to NestJS's controllers: Type<any>[].
// ---------------------------------------------------------------------------

function makeUploadController(tmpDir: string): Type<unknown> {
  const storage = multer.diskStorage({ destination: tmpDir });

  @Controller('upload')
  class UploadController {
    constructor(private readonly uploader: UploaderService) {}

    @Post()
    @UseInterceptors(FilesInterceptor('files', 10, { storage }))
    async handle(
      @Req() req: ExpressRequest,
      @UploadedFiles() _files: Express.Multer.File[]
    ): Promise<UploadResult[] | UploadResult | FileObject> {
      return this.uploader.upload(req);
    }
  }

  return UploadController;
}

// ---------------------------------------------------------------------------
// describe: UploaderModule — module wiring tests
// ---------------------------------------------------------------------------

describe('UploaderModule', () => {
  it('forRoot registers UPLOADER_OPTIONS and resolves UploaderService with supplied options', async () => {
    const root = createTempRoot();
    const opts = uploaderOptions(root);

    const moduleRef = await Test.createTestingModule({
      imports: [UploaderModule.forRoot(opts)],
    }).compile();

    const service = moduleRef.get(UploaderService);
    expect(service).toBeInstanceOf(UploaderService);

    const resolvedOptions = moduleRef.get<UploaderOptions>(UPLOADER_OPTIONS as symbol);
    expect(resolvedOptions).toMatchObject({
      uploadUrl: '/files/',
    });

    await moduleRef.close();
  });

  it('forRootAsync resolves options via an async useFactory', async () => {
    const root = createTempRoot();

    const moduleRef = await Test.createTestingModule({
      imports: [
        UploaderModule.forRootAsync({
          useFactory: async () => {
            // simulate async resolution (e.g. reading config from disk)
            await Promise.resolve();
            return uploaderOptions(root, { uploadUrl: '/async-files/' });
          },
        }),
      ],
    }).compile();

    const service = moduleRef.get(UploaderService);
    expect(service).toBeInstanceOf(UploaderService);
    expect(service.options.uploadUrl).toBe('/async-files/');

    await moduleRef.close();
  });

  it('forRootAsync respects inject ordering — factory receives injected value as first arg', async () => {
    const root = createTempRoot();

    const UPLOAD_URL_TOKEN = 'UPLOAD_URL_TOKEN';

    // The injected token must live in a module that is imported by UploaderModule
    // via the `imports` field — root-level providers are not visible to dynamic
    // modules' own providers.
    @Module({
      providers: [
        {
          provide: UPLOAD_URL_TOKEN,
          useValue: '/injected-files/',
        } satisfies ValueProvider,
      ],
      exports: [UPLOAD_URL_TOKEN],
    })
    class StubConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        UploaderModule.forRootAsync({
          imports: [StubConfigModule],
          inject: [UPLOAD_URL_TOKEN],
          useFactory: (uploadUrl: unknown) => {
            return uploaderOptions(root, { uploadUrl: uploadUrl as string });
          },
        }),
      ],
    }).compile();

    const service = moduleRef.get(UploaderService);
    expect(service.options.uploadUrl).toBe('/injected-files/');

    await moduleRef.close();
  });

  it('forRootAsync resolves a cross-module factory dependency via imports', async () => {
    const root = createTempRoot();

    const CONFIG_TOKEN = 'CONFIG_TOKEN';

    @Module({
      providers: [
        {
          provide: CONFIG_TOKEN,
          useValue: { uploadUrl: '/cross-module-files/' },
        } satisfies ValueProvider,
      ],
      exports: [CONFIG_TOKEN],
    })
    class ConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        UploaderModule.forRootAsync({
          imports: [ConfigModule],
          inject: [CONFIG_TOKEN],
          useFactory: (config: unknown) => {
            const cfg = config as { uploadUrl: string };
            return uploaderOptions(root, { uploadUrl: cfg.uploadUrl });
          },
        }),
      ],
    }).compile();

    const service = moduleRef.get(UploaderService);
    expect(service.options.uploadUrl).toBe('/cross-module-files/');

    await moduleRef.close();
  });

  it('module exports UPLOADER_INSTANCE token — consumer can inject the raw Uploader', async () => {
    const root = createTempRoot();
    const opts = uploaderOptions(root);

    const moduleRef = await Test.createTestingModule({
      imports: [UploaderModule.forRoot(opts)],
    }).compile();

    const instance = moduleRef.get<Uploader>(UPLOADER_INSTANCE as symbol);
    expect(instance).toBeInstanceOf(Uploader);
    expect(typeof instance.uploadFile).toBe('function');

    await moduleRef.close();
  });
});

// ---------------------------------------------------------------------------
// describe: UploaderService — unit-level upload tests
// ---------------------------------------------------------------------------

describe('UploaderService', () => {
  let root: string;
  let service: UploaderService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    root = createTempRoot();
    moduleRef = await Test.createTestingModule({
      imports: [UploaderModule.forRoot(uploaderOptions(root))],
    }).compile();
    service = moduleRef.get(UploaderService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('upload(req) returns UploadResult[] for a multer-shaped req.files', async () => {
    const sourcePath = writeSourceFile(root, 'upload-src.tmp', 'hello world');
    const req = createMockRequest({
      upload: {
        path: sourcePath,
        name: 'hello.txt',
        size: 11,
        type: 'text/plain',
      },
    });

    const result = await service.upload(req as unknown as ExpressRequest);

    expect(Array.isArray(result)).toBe(true);
    const files = result as UploadResult[];
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      originalName: 'hello.txt',
      name: 'hello.txt',
      size: 11,
      type: 'text/plain',
      url: '/files/hello.txt',
      success: true,
    });
    expect(fs.readFileSync(path.join(root, 'public', 'files', 'hello.txt'), 'utf8')).toBe(
      'hello world'
    );
  });

  it('upload(req) returns a single synthetic result for empty req.files', async () => {
    const req = createMockRequest();
    const result = await service.upload(req as unknown as ExpressRequest);

    expect(Array.isArray(result)).toBe(false);
    const single = result as UploadResult;
    expect(single).toMatchObject({
      originalName: '',
      name: '',
      size: 0,
      error: 'Not files found!',
    });
  });

  it('UploaderService.options is a frozen snapshot — mutating it does not affect the running Uploader', () => {
    const originalUrl = service.options.uploadUrl;

    // Attempt to mutate the frozen options object — TypeScript prevents this at
    // compile time via `Readonly<>`, but we verify the runtime invariant too.
    expect(() => {
      (service.options as Record<string, unknown>)['uploadUrl'] = '/hacked/';
    }).toThrow();

    // The running Uploader is unaffected.
    expect(service.uploader.settings.uploadUrl).not.toBe('/hacked/');
    // The service's own snapshot is also unchanged.
    expect(service.options.uploadUrl).toBe(originalUrl);
  });
});

// ---------------------------------------------------------------------------
// describe: Integration — full Nest app via supertest
// ---------------------------------------------------------------------------

describe('Integration', () => {
  let root: string;
  let app: Awaited<ReturnType<typeof NestFactory.create>>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST multipart via supertest lands the file in uploadDir', async () => {
    root = createTempRoot();
    const tmpDir = path.join(root, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });

    const UploadController = makeUploadController(tmpDir);

    const moduleRef = await Test.createTestingModule({
      imports: [UploaderModule.forRoot(uploaderOptions(root))],
      controllers: [UploadController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/upload')
      .attach('files', Buffer.from('integration test content'), 'integration.txt');

    expect(res.status).toBe(201);
    const body = res.body as UploadResult[];
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ success: true, name: 'integration.txt' });
    expect(fs.existsSync(path.join(root, 'public', 'files', 'integration.txt'))).toBe(true);
  });

  it('maxFileSize exceeded surfaces as success:false on UploadResult — no throw', async () => {
    root = createTempRoot();
    const sourcePath = writeSourceFile(root, 'oversized.tmp', 'oversized content');

    const moduleRef = await Test.createTestingModule({
      imports: [UploaderModule.forRoot(uploaderOptions(root, { validate: true, maxFileSize: 4 }))],
    }).compile();

    // Use UploaderService directly (no HTTP stack needed — this exercises the
    // validation branch without involving multer's own size limit).
    const service = moduleRef.get(UploaderService);
    const req = createMockRequest({
      upload: {
        path: sourcePath,
        name: 'oversized.txt',
        size: 17,
        type: 'text/plain',
      },
    });

    const result = await service.upload(req as unknown as ExpressRequest);

    expect(Array.isArray(result)).toBe(true);
    const files = result as UploadResult[];
    expect(files[0]).toMatchObject({
      originalName: 'oversized.txt',
      success: false,
      error: 'File is too big',
    });
    expect(fs.existsSync(path.join(root, 'public', 'files', 'oversized.txt'))).toBe(false);

    await moduleRef.close();
  });
});
