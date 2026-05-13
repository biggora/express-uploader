export interface UploaderOptions {
    debug?: boolean;
    safeName?: boolean;
    validate?: boolean;
    resize?: boolean;
    crop?: boolean;
    quality?: number;
    thumbnails?: boolean;
    thumbToSubDir?: boolean;
    /** @deprecated No longer used — paths now use Node's `path.sep`/`path.join`. */
    osSep?: string;
    tmpDir?: string;
    publicDir?: string;
    uploadDir?: string;
    uploadUrl?: string;
    maxPostSize?: number;
    minFileSize?: number;
    maxFileSize?: number;
    acceptFileTypes?: RegExp;
    thumbSizes?: Array<number | [number, number]>;
    newSize?: [number, number];
    coordinates?: {
        width: number;
        height: number;
        x: number;
        y: number;
    };
    inlineFileTypes?: RegExp;
    imageTypes?: RegExp;
}
export interface FileObject {
    path?: string;
    name: string;
    size: number;
    type: string;
    success?: boolean;
    error?: string;
    safeName?: string;
    [key: string]: unknown;
}
type UploaderRequestListener = (...args: never[]) => void;
export interface UploaderRequest {
    xhr?: boolean;
    files?: unknown;
    header(name: string): string | null | undefined;
    on(event: string, listener: UploaderRequestListener): unknown;
    pipe(dest: NodeJS.WritableStream): unknown;
    unpipe?(dest?: NodeJS.WritableStream): void;
}
export interface UploadResult {
    originalName: string;
    name: string;
    size: number;
    type: string;
    destinationDir: string;
    url: string;
    thumbnails: string[];
    thumbnailObj: {
        [key: string]: string;
    };
    success?: boolean;
    error?: string;
}
export interface SafeNameCallback {
    (name: string): void;
}
export interface UploadCallback {
    (result: UploadResult | UploadResult[] | FileObject): void;
}
interface DefaultOptions extends UploaderOptions {
    debug: boolean;
    safeName: boolean;
    validate: boolean;
    resize: boolean;
    crop: boolean;
    quality: number;
    thumbnails: boolean;
    thumbToSubDir: boolean;
    tmpDir: string;
    publicDir: string;
    uploadDir: string;
    uploadUrl: string;
    maxPostSize: number;
    minFileSize: number;
    maxFileSize: number;
    acceptFileTypes: RegExp;
    thumbSizes: Array<number | [number, number]>;
    newSize: [number, number];
    coordinates: {
        width: number;
        height: number;
        x: number;
        y: number;
    };
    inlineFileTypes: RegExp;
    imageTypes: RegExp;
    nameCountRegexp: RegExp;
    nameCountFunc: (match: string, index: string, ext: string) => string;
}
export declare class Uploader {
    settings: DefaultOptions;
    constructor(options?: UploaderOptions);
    pathToRoot(): string;
    _existsSync(filePath: string): boolean;
    private sanitizeFileName;
    private createResult;
    private safeUnlink;
    private destinationPath;
    private normalizeFile;
    private collectFiles;
    removeFile(filename: string, callback?: () => void): void;
    uploadFile(req: UploaderRequest, done: UploadCallback): void;
    private uploadXhrFile;
    private processUploadedFile;
    moveFile(file: FileObject, dest: string, inValid: string | false, callback: (info: UploadResult) => void): void;
    safeCreateDirectory(dir: string): void;
    safeName(files: string[], name: string, cb: SafeNameCallback): void;
    validate(file: FileObject): string | false;
    createThumbnail(info: UploadResult, cb: (info: UploadResult) => void): void;
    logging(...args: unknown[]): void;
    uploadInfo(finfo: UploadResult): void;
}
export {};
//# sourceMappingURL=express-uploader.d.ts.map