# Adapters Blueprint — `express-uploader/nest` and `express-uploader/next`

> **Status:** Architecture specification. Read-only. The core (`lib/express-uploader.ts`, `index.ts`) is frozen — adapters consume the public `Uploader` class only.
>
> **Scope:** Two new subpath entry points that expose a Promise-based API on top of the existing callback-based `Uploader.uploadFile()`. Targets: **NestJS + `@nestjs/platform-express`** and **Next.js Pages Router**.

---

## 0. Shared design baseline

Both adapters share a thin Promise wrapper around `Uploader.uploadFile(req, done)`. The core callback contract is preserved verbatim:

- Form path (multer/multiparty-shaped `req.files`) → `UploadResult[]` (always an array, even for one file).
- XHR path (`req.xhr === true` with no `req.files`) → single `UploadResult` (or `FileObject`-shaped error).
- Empty path (`req.files` empty, not XHR) → single synthetic `UploadResult` with `error: 'Not files found!'`.

The Promise wrappers therefore resolve to `UploadResult[] | UploadResult` (union) and **never reject** — errors surface as `result.success === false` / `result.error`. This matches the core's behavior; adapters that need throw-on-error apply that policy at the consumer layer (e.g. in `onError` or in a NestJS service method).

A single helper type is reused by both files:

```ts
// internal to each adapter file — not re-exported from index
export type UploadOutcome = UploadResult | UploadResult[];
```

`UploadResult` and `FileObject` are imported from the package root (`../express-uploader`).

---

## 1. Public API — NestJS adapter (`express-uploader/nest`)

### 1.1 Exported symbols and full signatures

File: `lib/adapters/nest.ts`

```ts
import {
  DynamicModule,
  FactoryProvider,
  Inject,
  Injectable,
  Module,
  ModuleMetadata,
  Type,
  Provider,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import {
  Uploader,
  UploaderOptions,
  UploadResult,
  FileObject,
} from '../express-uploader';

/** Injection token for the resolved `UploaderOptions`. Exported so tests / advanced
 *  consumers can inject the raw options blob. */
export const UPLOADER_OPTIONS: unique symbol = Symbol('UPLOADER_OPTIONS');

/** Injection token for the singleton `Uploader` instance. Optional convenience —
 *  most consumers will inject `UploaderService` instead. */
export const UPLOADER_INSTANCE: unique symbol = Symbol('UPLOADER_INSTANCE');

/** Options object for `UploaderModule.forRootAsync`. Mirrors the standard Nest
 *  async-module shape so `imports`, `inject`, and `useFactory` behave exactly
 *  like users expect from `@nestjs/typeorm`, `@nestjs/config`, etc. */
export interface UploaderModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (...args: unknown[]) => UploaderOptions | Promise<UploaderOptions>;
  inject?: FactoryProvider['inject'];
}

export declare class UploaderModule {
  static forRoot(options: UploaderOptions): DynamicModule;
  static forRootAsync(opts: UploaderModuleAsyncOptions): DynamicModule;
}

@Injectable()
export declare class UploaderService {
  constructor(
    @Inject(UPLOADER_INSTANCE) uploader: Uploader,
    @Inject(UPLOADER_OPTIONS) options: UploaderOptions,
  );

  /** Resolves to `UploadResult[]` for the multer form path (the common case
   *  when using `FilesInterceptor` / `FileInterceptor`), or to a single
   *  `UploadResult` / `FileObject` for the XHR-stream path and the empty-files
   *  path. Never rejects — errors are surfaced via `result.success === false`
   *  and `result.error` on each `UploadResult`. */
  upload(req: ExpressRequest): Promise<UploadResult[] | UploadResult | FileObject>;

  /** Direct access to the underlying instance for advanced cases (e.g. calling
   *  `removeFile`). */
  readonly uploader: Uploader;

  /** Resolved options snapshot. Read-only. */
  readonly options: Readonly<UploaderOptions>;
}
```

> **Note on `unknown[]` in `useFactory`:** NestJS itself types factory args as `any[]`. Project lint forbids `any`. Using `unknown[]` is the strictest safe choice; users cast to their concrete types inside the factory body. This is the only signature where `unknown` is required.

### 1.2 Internal wiring (specification, not implementation)

`UploaderModule.forRoot(options)` returns:

```
{
  module: UploaderModule,
  providers: [
    { provide: UPLOADER_OPTIONS, useValue: options },
    { provide: UPLOADER_INSTANCE, useFactory: (o: UploaderOptions) => new Uploader(o), inject: [UPLOADER_OPTIONS] },
    UploaderService,
  ],
  exports: [UploaderService, UPLOADER_OPTIONS, UPLOADER_INSTANCE],
}
```

`UploaderModule.forRootAsync(opts)` returns the same shape with `UPLOADER_OPTIONS` provided by `useFactory` + `inject` + `imports` from `opts`.

`UploaderService.upload(req)` calls `this.uploader.uploadFile(req, (result) => resolve(result))`. The result is passed through unchanged — the adapter does NOT normalize array-vs-single, because callers may legitimately rely on the discriminator. Documented in JSDoc.

### 1.3 Injection token name(s)

- `UPLOADER_OPTIONS` — resolved `UploaderOptions`.
- `UPLOADER_INSTANCE` — singleton `Uploader` instance.

Both are `unique symbol`. `Inject(UPLOADER_OPTIONS)` and `Inject(UPLOADER_INSTANCE)` are the supported usage.

### 1.4 Required peer dependencies

| Package                    | Range                              | Why                                                                                                                                                                                     |
| -------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common`           | `^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0` | DI primitives (`@Injectable`, `@Module`, `DynamicModule`, `@Inject`). Wide range covers Nest 9/10/11 — all share the same DI surface this adapter uses.                                 |
| `@nestjs/core`             | `^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0` | Required transitively by `@nestjs/common` runtime; declared explicitly so module bootstrap works.                                                                                       |
| `@nestjs/platform-express` | `^9.0.0 \|\| ^10.0.0 \|\| ^11.0.0` | Adapter is Express-platform-only by decision. Provides the `ExpressRequest` shape consumed by `upload()`.                                                                               |
| `express`                  | `^4.17.0 \|\| ^5.0.0`              | Source of the `Request` type used in the signature. Already a transitive of `platform-express`; declared so type-only imports resolve in consumer projects that don't list it directly. |
| `reflect-metadata`         | `^0.1.13 \|\| ^0.2.0`              | Required by Nest decorators at runtime. Standard Nest peer.                                                                                                                             |

All five are marked **optional** via `peerDependenciesMeta` — consumers using only the Next.js adapter (or no adapter at all) must not see install warnings.

### 1.5 Sample consumer code

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { UploaderModule } from 'express-uploader/nest';
import { UploadController } from './upload.controller';

@Module({
  imports: [
    UploaderModule.forRoot({
      tmpDir: '/tmp/uploads',
      uploadDir: '/var/www/files',
      uploadUrl: '/files/',
      thumbnails: true,
      thumbSizes: [[100, 100], 200],
    }),
  ],
  controllers: [UploadController],
})
export class AppModule {}
```

```ts
// upload.controller.ts
import { Controller, Post, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
import { UploaderService } from 'express-uploader/nest';
import type { UploadResult, FileObject } from 'express-uploader';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploader: UploaderService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 10))
  async handle(
    @Req() req: ExpressRequest,
    @UploadedFiles() _files: Express.Multer.File[]
  ): Promise<UploadResult[] | UploadResult | FileObject> {
    return this.uploader.upload(req);
  }
}
```

The user supplies their own `FilesInterceptor` (or `FileInterceptor`, or a custom one) configured with the multer disk storage of their choice. The adapter does **not** wire multer for Nest — Nest's own ecosystem owns that.

---

## 2. Public API — Next.js Pages Router adapter (`express-uploader/next`)

### 2.1 Exported symbols and full signatures

File: `lib/adapters/next.ts`

```ts
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import type multer from 'multer';
import { UploaderOptions, UploadResult, FileObject } from '../express-uploader';

/** Options for `withUploader` — extends core `UploaderOptions` with Next.js-
 *  specific response hooks and multer limits passthrough. */
export interface WithUploaderOptions extends UploaderOptions {
  /** Called after a successful (or partially successful) upload. Default
   *  behavior when omitted: `res.status(200).json(result)`. */
  onSuccess?: (
    result: UploadResult[] | UploadResult | FileObject,
    req: NextApiRequest,
    res: NextApiResponse
  ) => void | Promise<void>;

  /** Called when multer or the underlying stream throws synchronously /
   *  asynchronously before the core callback fires. Default behavior when
   *  omitted: `res.status(500).json({ error: err.message })`. Note: per-file
   *  upload failures from the core (where `result.success === false`) do NOT
   *  trigger `onError` — they go through `onSuccess` because the core surfaces
   *  them via the result object, not via throw. */
  onError?: (err: Error, req: NextApiRequest, res: NextApiResponse) => void | Promise<void>;

  /** Forwarded verbatim to `multer({ limits })`. */
  multerLimits?: multer.Options['limits'];

  /** Multer field name to accept. Defaults to accepting any field via
   *  `multer().any()`. Set to a string for `.array(fieldName)` semantics. */
  fieldName?: string;
}

/** Default export style: `export default withUploader({ ... })`. */
export declare function withUploader(options?: WithUploaderOptions): NextApiHandler;
```

The handler returned by `withUploader` is a standard `NextApiHandler` (i.e. `(req: NextApiRequest, res: NextApiResponse) => void | Promise<void>`).

### 2.2 `req.xhr` / `req.header()` shim — precise behavior

The core's `UploaderRequest` interface requires `req.xhr: boolean | undefined` and `req.header(name): string | null | undefined`. `NextApiRequest` provides neither directly. The adapter shims them **before** invoking the multer middleware:

- `req.xhr` → set to `false` unconditionally for the form path; set to `true` only if `req.headers['x-file-name']` is present AND `req.headers['content-type']` does NOT start with `multipart/`. This preserves the core's two-branch dispatch logic.
- `req.header(name)` → defined as a one-line getter that reads `req.headers[name.toLowerCase()]`. If the header value is an array (Node allows that for some headers), the shim returns the first element; otherwise the string or `undefined`.

Both properties are assigned with `Object.defineProperty` with `configurable: true`, so the original request object is not mutated permanently in a way that breaks downstream Next.js handlers.

A second shim addresses `req.files`: multer populates it during its `.any()` callback. The core's `UploaderRequest.files` is typed `unknown` and the runtime expects either `{field: file}`, `{field: file[]}`, or `file[]` — multer's `.any()` produces `Express.Multer.File[]`, which the core's `collectFiles()` already normalizes. No additional shim needed.

### 2.3 How multer is wired internally

- `multer({ storage: multer.diskStorage({ destination: options.tmpDir, filename: (req, file, cb) => cb(null, randomUUID() + extname(file.originalname)) }), limits: options.multerLimits })`.
- If `options.fieldName` is provided → `upload.array(options.fieldName)`. Otherwise → `upload.any()`.
- Multer is invoked manually as a function `(req, res, callback) => void` (Next.js does not provide an Express-style `next()`), wrapped in a Promise. On callback error → `onError` (or default 500). On success → continue to `Uploader.uploadFile`.
- `tmpDir` defaults to `os.tmpdir()` joined with `'express-uploader'` when not provided. The core's own default (`path.join(__dirname, 'tmp')`) would point into `node_modules` under Next.js, which is read-only in serverless deploys — so the adapter substitutes a safe default **before** constructing `Uploader`.

### 2.4 Behavior summary

| Scenario                         | Default response                                                     | Override                      |
| -------------------------------- | -------------------------------------------------------------------- | ----------------------------- |
| Form upload, all files succeeded | `200 { …result… }` (array)                                           | `onSuccess(result, req, res)` |
| Form upload, some files failed   | `200 { …result… }` (array, some entries with `success:false`)        | `onSuccess`                   |
| No files in body                 | `200 { error: 'Not files found!', … }` (single object)               | `onSuccess`                   |
| Multer/stream threw              | `500 { error: err.message }`                                         | `onError(err, req, res)`      |
| Method not POST/PUT              | `405 { error: 'Method Not Allowed' }` with `Allow: POST, PUT` header | not overridable in v1         |

Next.js Pages Router config requirement (documented in sample): `export const config = { api: { bodyParser: false } }` — multer must own the body stream. The adapter does NOT auto-emit this config (impossible at runtime); the README + sample call it out.

### 2.5 Required peer dependencies

| Package         | Range                                            | Why                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next`          | `^12.0.0 \|\| ^13.0.0 \|\| ^14.0.0 \|\| ^15.0.0` | Pages Router types (`NextApiHandler`, `NextApiRequest`, `NextApiResponse`). Pages Router stable from Next 9, but bodyParser disabling pattern is stable from 12.                                                                                                     |
| `multer`        | `^1.4.5 \|\| ^2.0.0`                             | Embedded by the adapter. Both v1 (long-standing) and v2 (current stable, already in devDeps) supported — APIs used (`diskStorage`, `.any()`, `.array()`, `limits`) are identical across both.                                                                        |
| `@types/multer` | `^1.4.0`                                         | Type-only peer for `multer.Options` consumers — optional.                                                                                                                                                                                                            |
| `express`       | `^4.17.0 \|\| ^5.0.0`                            | Multer's middleware signature is Express-shaped; `NextApiRequest`/`Response` are duck-compatible but type intersections need it. Optional (consumer rarely installs Express in Next.js projects — the type-only peer is marked optional via `peerDependenciesMeta`). |

`next` and `multer` are **required** peers. `@types/multer` and `express` are **optional** peers via `peerDependenciesMeta` (consumers without TypeScript or without strict type-checking don't need them).

### 2.6 Sample consumer code

```ts
// pages/api/upload.ts
import { withUploader } from 'express-uploader/next';

export const config = {
  api: { bodyParser: false }, // multer must own the stream
};

export default withUploader({
  tmpDir: '/tmp/express-uploader',
  uploadDir: './public/files',
  uploadUrl: '/files/',
  thumbnails: true,
  thumbSizes: [[100, 100]],
  multerLimits: { fileSize: 10 * 1024 * 1024 },
  fieldName: 'files',
  onSuccess: (result, _req, res) => {
    res.status(201).json({ ok: true, result });
  },
  onError: (err, _req, res) => {
    res.status(400).json({ ok: false, error: err.message });
  },
});
```

---

## 3. Package layout

### 3.1 New files (absolute paths)

| Path                                                           | Purpose                              |
| -------------------------------------------------------------- | ------------------------------------ |
| `E:\Projects\npm\express-uploader\lib\adapters\nest.ts`        | NestJS adapter source.               |
| `E:\Projects\npm\express-uploader\lib\adapters\next.ts`        | Next.js Pages Router adapter source. |
| `E:\Projects\npm\express-uploader\tests\adapters\nest.test.ts` | Vitest spec for the Nest adapter.    |
| `E:\Projects\npm\express-uploader\tests\adapters\next.test.ts` | Vitest spec for the Next adapter.    |

### 3.2 `index.ts` re-exports — **NO**

The root `index.ts` must **NOT** re-export from `lib/adapters/*`. Rationale:

- Importing `lib/adapters/nest.ts` from `index.ts` would force TypeScript / bundlers to resolve `@nestjs/common` and `reflect-metadata` even for consumers using only the core. This breaks projects that don't have Nest installed.
- Same applies for `next` and `multer` — pulling them in via root would balloon bundle size for non-Next consumers (e.g. plain Express users).
- Subpath imports (`express-uploader/nest`, `express-uploader/next`) keep optional-peer cost truly opt-in.

### 3.3 Resulting directory tree

```
lib/
  express-uploader.ts        (unchanged, FROZEN)
  adapters/
    nest.ts                  (new)
    next.ts                  (new)
tests/
  uploader.test.ts           (unchanged)
  adapters/
    nest.test.ts             (new)
    next.test.ts             (new)
dist/                        (regenerated by tsc — will mirror the above)
  lib/
    express-uploader.js
    express-uploader.d.ts
    adapters/
      nest.js
      nest.d.ts
      next.js
      next.d.ts
```

---

## 4. `package.json` changes

### 4.1 `exports` field — ADD

```diff
   "main": "./dist/index.js",
   "types": "./dist/index.d.ts",
+  "exports": {
+    ".": {
+      "types": "./dist/index.d.ts",
+      "import": "./dist/index.js",
+      "require": "./dist/index.js",
+      "default": "./dist/index.js"
+    },
+    "./nest": {
+      "types": "./dist/lib/adapters/nest.d.ts",
+      "import": "./dist/lib/adapters/nest.js",
+      "require": "./dist/lib/adapters/nest.js",
+      "default": "./dist/lib/adapters/nest.js"
+    },
+    "./next": {
+      "types": "./dist/lib/adapters/next.d.ts",
+      "import": "./dist/lib/adapters/next.js",
+      "require": "./dist/lib/adapters/next.js",
+      "default": "./dist/lib/adapters/next.js"
+    },
+    "./package.json": "./package.json"
+  },
```

Both `import` and `require` point to the same `.js` (CJS output from `tsc module: commonjs`); the `types` condition is listed first per Node resolution rules. `./package.json` is exposed explicitly to satisfy tooling that reads it (some bundlers).

### 4.2 `files` field — ADD adapter glob

The existing `"dist/lib/**/*"` already covers `dist/lib/adapters/**`, so no change is strictly required. To make intent explicit:

```diff
   "files": [
     "dist/index.js",
     "dist/index.js.map",
     "dist/index.d.ts",
     "dist/index.d.ts.map",
     "dist/lib/**/*",
+    "dist/lib/adapters/**/*",
     "README.md"
   ],
```

(The added line is redundant against `dist/lib/**/*` but documents the intent; either keep both or drop the new line — recommendation: keep both for clarity.)

### 4.3 `peerDependencies` and `peerDependenciesMeta` — ADD

```diff
   "dependencies": {
     "gm": "^1.25.1",
     "tslib": "^2.8.1"
   },
+  "peerDependencies": {
+    "@nestjs/common": "^9.0.0 || ^10.0.0 || ^11.0.0",
+    "@nestjs/core": "^9.0.0 || ^10.0.0 || ^11.0.0",
+    "@nestjs/platform-express": "^9.0.0 || ^10.0.0 || ^11.0.0",
+    "reflect-metadata": "^0.1.13 || ^0.2.0",
+    "express": "^4.17.0 || ^5.0.0",
+    "next": "^12.0.0 || ^13.0.0 || ^14.0.0 || ^15.0.0",
+    "multer": "^1.4.5 || ^2.0.0",
+    "@types/multer": "^1.4.0"
+  },
+  "peerDependenciesMeta": {
+    "@nestjs/common": { "optional": true },
+    "@nestjs/core": { "optional": true },
+    "@nestjs/platform-express": { "optional": true },
+    "reflect-metadata": { "optional": true },
+    "express": { "optional": true },
+    "next": { "optional": true },
+    "multer": { "optional": true },
+    "@types/multer": { "optional": true }
+  },
```

All eight are marked optional. Rationale:

- A pure-Express consumer wants nothing from Nest or Next.
- A Nest-only consumer wants nothing from Next/multer (multer is wired via Nest's own `FilesInterceptor`).
- A Next-only consumer wants nothing from Nest.
- Marking everything optional prevents npm/yarn/pnpm install warnings; runtime errors when the consumer imports an adapter without its peer installed are acceptable and clearly attributable.

### 4.4 `devDependencies` — ADD

```diff
   "devDependencies": {
     "@types/body-parser": "^1.19.6",
     "@types/cookie-parser": "^1.4.3",
     "@types/express": "^4.17.17",
     "@types/gm": "^1.25.4",
     "@types/method-override": "^0.0.32",
     "@types/morgan": "^1.9.4",
     "@types/multer": "^1.4.12",
+    "@types/supertest": "^6.0.2",
     "@types/node": "^22.19.19",
     "body-parser": "2.2.1",
     "compression": "^1.7.0",
     "cookie-parser": "^1.4.3",
     "errorhandler": "^1.5.0",
     "eslint": "^9.38.0",
     "express": "^5.1.0",
     "express-session": "^1.15.4",
+    "@nestjs/common": "^11.0.0",
+    "@nestjs/core": "^11.0.0",
+    "@nestjs/platform-express": "^11.0.0",
+    "@nestjs/testing": "^11.0.0",
+    "form-data": "^4.0.0",
     "method-override": "^3.0.0",
     "morgan": "^1.10.1",
     "multer": "^2.1.1",
+    "next": "^14.2.0",
     "prettier": "^3.6.2",
+    "reflect-metadata": "^0.2.2",
+    "rxjs": "^7.8.1",
+    "supertest": "^7.0.0",
     "typescript": "^5.9.3",
     "typescript-eslint": "^8.46.2",
     "vitest": "^4.1.6"
   }
```

Notes:

- `rxjs` is required at runtime by `@nestjs/common` (tests bootstrap a Nest module).
- `supertest` + `form-data` for HTTP-level integration tests of both adapters.
- `next` pinned to a stable LTS line (14.x) for tests; the peer range remains wider.
- `@nestjs/testing` only used by tests, never imported by adapter source.

### 4.5 `main` / `types` — CONFIRMED UNCHANGED

`main: "./dist/index.js"` and `types: "./dist/index.d.ts"` remain as-is. The `exports` field takes precedence for modern resolvers; `main`/`types` are kept as fallback for older tooling (Node < 12.7, ancient TypeScript). The dual entry-point story does not require changing them.

---

## 5. `tsconfig.json` impact

**No changes required.**

Verification:

- `include` already contains `"lib/**/*"` → `lib/adapters/*.ts` matches.
- `include` already contains `"tests/**/*"` → `tests/adapters/*.test.ts` matches.
- `exclude` is `["node_modules", "dist", "build"]` — does not exclude `lib/adapters` or `tests/adapters`.
- `outDir: "./dist"` + `rootDir: "."` will place compiled output at `dist/lib/adapters/nest.js` and `dist/lib/adapters/next.js`, which is exactly what the new `exports` block points to.
- `strict: true`, `noImplicitAny: true`, `strictNullChecks: true` already enforce the bar the adapter signatures are written against.
- `paths: { "*": ["node_modules/*"] }` resolves the new peer-dep type imports without further config.

If `@nestjs/common` is not installed during local development, `tsc` will fail to type-check `nest.ts`. Since `@nestjs/common` is added to `devDependencies`, this is fine for the repo. Consumers who never install the Nest adapter peer get a runtime error on `require('express-uploader/nest')` — that is the expected behavior for optional peers.

---

## 6. Risks and tradeoffs

### 6.1 Bundle size impact

- **As peer deps:** zero impact on consumers of the core. A consumer doing `import Uploader from 'express-uploader'` pulls in nothing from `lib/adapters/*` — Node's resolver only loads what is imported. This is the whole reason for the subpath-only design (Section 3.2).
- **As regular deps (rejected):** would force every install to fetch Nest (~5 MB), Next (~30 MB), and multer transitively — unacceptable for a 660-LOC upload helper.
- **Net:** peer-deps + optional metadata is the only viable layout.

### 6.2 ESLint `@typescript-eslint/no-explicit-any: 'error'`

Two friction points, both resolvable without `any`:

1. **`UploaderModuleAsyncOptions.useFactory`** — Nest's own `FactoryProvider['useFactory']` type uses `any[]`. The blueprint specifies `unknown[]` for our public surface. Users cast at the factory boundary.
2. **Multer error type** — `multer({...})(req, res, callback)` calls the callback with `any` (no `Error` type in `@types/multer`). The adapter wraps it as `(err: Error | null) => void` in a Promise; the cast happens via a narrow type-guard (`err instanceof Error ? err : new Error(String(err))`), not `as any`.

No `as any` casts anywhere in the proposed adapter signatures. Implementation may need one or two `as unknown as T` casts at runtime boundaries (multer → Express request), which are linted as `no-explicit-any`-clean.

### 6.3 NestJS optional-peer handling

When a consumer installs `express-uploader` but not `@nestjs/common`:

- **Install time:** no npm warning (optional peer).
- **TypeScript:** `import { UploaderModule } from 'express-uploader/nest'` fails at compile time with `Cannot find module '@nestjs/common'`. This is the desired signal — the consumer must install Nest to use the Nest adapter.
- **Runtime:** `require('express-uploader/nest')` throws `MODULE_NOT_FOUND` from the top-level `import ... from '@nestjs/common'`. Clear error message. Acceptable per the design baseline.

Same model applies to `next` + `multer` for the Next adapter.

No defensive `try { require } catch` patterns: they hide real failure modes and add complexity. If you import the adapter, you must have its peers installed — full stop.

### 6.4 Multer version straddle (v1 vs v2)

Multer v1.x and v2.x have identical surface for the APIs used (`diskStorage`, `.any()`, `.array()`, `limits`). The v2 release notes confirm no breaking changes in this area. Peer range covers both. Tests run against v2 (already in devDeps).

### 6.5 NestJS Fastify exclusion

Explicit non-goal per task decisions. The Nest adapter signature references `express.Request`. A Fastify adapter would need a separate file (`lib/adapters/nest-fastify.ts`) and a separate subpath export — out of scope for v1.

### 6.6 Next.js App Router exclusion

Explicit non-goal. App Router's `Request` / `Response` are Web-standard `Request`/`Response`, not Node `IncomingMessage` — the core's stream-based pipeline (`req.pipe(ws)`) cannot consume them without a separate adapter that materializes the body first. Out of scope for v1.

### 6.7 The `req.xhr` shim on Next.js

The shim heuristic (Section 2.2) classifies as XHR only when `x-file-name` is present and content-type is not multipart. This is the same contract the core advertises today. Risk: a consumer sending a multipart body with a stray `x-file-name` header would be classified as form (correct). A consumer sending XHR with no `content-type` and `x-file-name` would be classified as XHR (correct). Edge case: an empty body with `x-file-name` and a multipart content-type — classified as form, multer parses nothing, returns empty `req.files`, the core then emits the `'Not files found!'` synthetic error. Acceptable.

---

## 7. Test strategy outline

### 7.1 `tests/adapters/nest.test.ts`

Bootstrap pattern: `Test.createTestingModule({ imports: [UploaderModule.forRoot({ ...tmp options... })] }).compile()` per test, then resolve `UploaderService`. For end-to-end paths: bootstrap with `app.useStaticAssets`-free configuration and drive via `supertest`.

Test cases:

- `forRoot` registers `UPLOADER_OPTIONS` provider and resolves `UploaderService` with the supplied options.
- `forRootAsync` resolves options via `useFactory` (async factory awaited correctly).
- `forRootAsync` respects `inject` ordering by injecting a stub config provider.
- `forRootAsync` respects `imports` (cross-module factory dependency resolved).
- `UploaderService.upload(req)` returns `UploadResult[]` for a multer-shaped `req.files` (mirrors core form-path test).
- `UploaderService.upload(req)` returns a single `UploadResult` for the XHR-stream path.
- `UploaderService.upload(req)` returns `'Not files found!'` synthetic result for empty `req.files` and non-XHR.
- Integration: full Nest app with `FilesInterceptor`, POST multipart via supertest, asserts file landed in `uploadDir`.
- Integration: per-file validation error (`maxFileSize`) surfaces as `success:false` on the corresponding `UploadResult` element.
- Module exports `UPLOADER_INSTANCE` token and consumers can inject the raw `Uploader`.
- `UploaderService.options` is read-only snapshot — mutating it does not affect the running `Uploader`.

### 7.2 `tests/adapters/next.test.ts`

Driven by invoking the handler with mock `NextApiRequest`/`NextApiResponse` (using `node-mocks-http` is one option, but to avoid adding another dep, hand-rolled mocks based on the existing test patterns in `tests/uploader.test.ts` are sufficient — supertest cannot easily drive a Next handler without a Next dev server).

Test cases:

- `withUploader({})` returns a function with arity 2 (`NextApiHandler`).
- POST multipart with a single file → default response is `200` + array result with one `success:true` entry.
- POST multipart with multiple files → default response is `200` + array with N entries.
- POST with no files → default response is `200` + single object with `error: 'Not files found!'`.
- PUT request with `x-file-name` header and raw body → XHR path, response is single `UploadResult`.
- GET request → `405 Method Not Allowed` with `Allow: POST, PUT` header.
- `onSuccess` override called with the result; default 200 not emitted.
- `onError` override called when multer throws (e.g. body exceeds `multerLimits.fileSize`).
- `req.header('x-file-name')` shim returns the raw header value (case-insensitive lookup).
- `req.xhr` shim is `false` for multipart, `true` for raw-body + `x-file-name` + non-multipart content-type.
- `multerLimits` is honored (oversized file → `onError` / 500).
- `fieldName: 'avatar'` configures `multer().array('avatar')` (file under wrong field name → no files parsed → `'Not files found!'`).
- Default `tmpDir` falls back to `os.tmpdir()`-derived path when not provided (not `__dirname`-derived).
- Handler does not permanently mutate the request prototype (subsequent handlers see clean `req`).

---

## Implementation sequence (recommended build order)

1. Add `peerDependencies`, `peerDependenciesMeta`, and `devDependencies` to `package.json`. Run `npm install` to confirm clean resolution.
2. Add `exports` block to `package.json`. Confirm `npm pack --dry-run` lists the expected files.
3. Create `lib/adapters/next.ts` (smaller surface, no DI — fastest win).
4. Create `tests/adapters/next.test.ts` covering the cases in 7.2.
5. Verify `npm run build` produces `dist/lib/adapters/next.{js,d.ts}` and `npm test` passes.
6. Create `lib/adapters/nest.ts`.
7. Create `tests/adapters/nest.test.ts` covering the cases in 7.1.
8. Verify `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` all pass.
9. Update README with subpath import documentation and the two sample snippets from Sections 1.5 and 2.6.
10. Run `npm pack --dry-run` one more time, inspect the tarball file list, confirm only `dist/**` + `README.md` ship.

---

## Acceptance criteria (for the implementor)

- All signatures in Sections 1.1 and 2.1 compile under `strict: true`.
- Zero `any` in adapter source files. `unknown[]` allowed only in `useFactory` per Section 6.2.
- `lib/express-uploader.ts` and `index.ts` byte-identical before and after.
- `npm test` green on Node 18 / 22 / 24.
- `npm run lint` green.
- `npm pack` produces a tarball that, when installed in a scratch project, allows:
  - `import Uploader from 'express-uploader'` — works.
  - `import { UploaderModule, UploaderService } from 'express-uploader/nest'` — works (with Nest peers installed).
  - `import { withUploader } from 'express-uploader/next'` — works (with Next + multer peers installed).
  - `import { UploaderModule } from 'express-uploader/nest'` without Nest installed — fails with clear `MODULE_NOT_FOUND` on `@nestjs/common`.
