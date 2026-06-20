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

import type { DynamicModule, FactoryProvider } from '@nestjs/common';
import { Inject, Injectable, Module } from '@nestjs/common';
import type { ModuleMetadata, Provider } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Uploader } from '../express-uploader';
import type { UploaderOptions, UploadResult, FileObject } from '../express-uploader';

/** Injection token for the resolved `UploaderOptions`. Exported so tests and
 *  advanced consumers can inject the raw options blob directly. */
export const UPLOADER_OPTIONS: unique symbol = Symbol('UPLOADER_OPTIONS');

/** Injection token for the singleton `Uploader` instance. Most consumers will
 *  inject `UploaderService` instead; this token is exposed for advanced cases
 *  (e.g. accessing `removeFile` directly). */
export const UPLOADER_INSTANCE: unique symbol = Symbol('UPLOADER_INSTANCE');

/** Options for `UploaderModule.forRootAsync`. Mirrors the standard NestJS
 *  async-module shape — `imports`, `inject`, and `useFactory` behave exactly
 *  as they do in `@nestjs/typeorm`, `@nestjs/config`, etc. */
export interface UploaderModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /** Factory that returns the resolved `UploaderOptions`, optionally async.
   *  Args are typed `unknown[]` because the project lint bans `any`; cast to
   *  your concrete types inside the factory body. */
  useFactory: (...args: unknown[]) => UploaderOptions | Promise<UploaderOptions>;
  /** Tokens to inject into `useFactory` as positional arguments. */
  inject?: FactoryProvider['inject'];
}

/** NestJS service that wraps the `Uploader` instance in a Promise-based API.
 *  Register it by importing `UploaderModule.forRoot(options)` or
 *  `UploaderModule.forRootAsync(opts)` into your application module. */
@Injectable()
export class UploaderService {
  /** Direct access to the underlying `Uploader` instance for advanced cases
   *  (e.g. calling `removeFile`). */
  public readonly uploader: Uploader;

  /** Frozen snapshot of the resolved options. Mutations have no effect on the
   *  running `Uploader`. */
  public readonly options: Readonly<UploaderOptions>;

  constructor(
    @Inject(UPLOADER_INSTANCE) uploader: Uploader,
    @Inject(UPLOADER_OPTIONS) options: UploaderOptions
  ) {
    this.uploader = uploader;
    this.options = Object.freeze({ ...options });
  }

  /** Wraps `Uploader.uploadFile` in a Promise. Never rejects — errors surface
   *  as `result.success === false` / `result.error` on the returned object(s).
   *
   *  Resolves to:
   *  - `UploadResult[]` for the multer form path (even for a single file).
   *  - A single `UploadResult` for the XHR-stream path and empty-files path.
   *  - A `FileObject`-shaped object on XHR stream error.
   *
   *  The result is passed through unchanged — the adapter does NOT normalize
   *  array-vs-single, because callers may rely on the discriminator. */
  upload(req: ExpressRequest): Promise<UploadResult[] | UploadResult | FileObject> {
    return new Promise((resolve) => {
      // ExpressRequest satisfies UploaderRequest at runtime (same shape).
      // The cast via unknown avoids `any` while crossing the structural boundary.
      this.uploader.uploadFile(
        req as unknown as Parameters<Uploader['uploadFile']>[0],
        (result) => {
          resolve(result);
        }
      );
    });
  }
}

/** NestJS dynamic module for `express-uploader`. Provides `UploaderService`,
 *  `UPLOADER_OPTIONS`, and `UPLOADER_INSTANCE` to the host module. */
@Module({})
export class UploaderModule {
  /** Register the uploader with a static options object. */
  static forRoot(options: UploaderOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: UPLOADER_OPTIONS, useValue: options },
      {
        provide: UPLOADER_INSTANCE,
        useFactory: (opts: UploaderOptions) => new Uploader(opts),
        inject: [UPLOADER_OPTIONS],
      },
      UploaderService,
    ];
    return {
      module: UploaderModule,
      providers,
      exports: [UploaderService, UPLOADER_OPTIONS, UPLOADER_INSTANCE],
    };
  }

  /** Register the uploader with an async factory, e.g. to derive options from
   *  a config service. Supports `imports`, `inject`, and `useFactory` in the
   *  same way as `@nestjs/typeorm`'s `forRootAsync`. */
  static forRootAsync(opts: UploaderModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: UPLOADER_OPTIONS,
        useFactory: opts.useFactory,
        inject: opts.inject ?? [],
      },
      {
        provide: UPLOADER_INSTANCE,
        useFactory: (options: UploaderOptions) => new Uploader(options),
        inject: [UPLOADER_OPTIONS],
      },
      UploaderService,
    ];
    return {
      module: UploaderModule,
      imports: opts.imports ?? [],
      providers,
      exports: [UploaderService, UPLOADER_OPTIONS, UPLOADER_INSTANCE],
    };
  }
}
