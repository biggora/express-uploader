export interface UploaderOptions {
    debug?: boolean;
    safeName?: boolean;
    validate?: boolean;
    resize?: boolean;
    crop?: boolean;
    quality?: number;
    thumbnails?: boolean;
    thumbToSubDir?: boolean;
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
    [key: string]: any;
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
    osSep: string;
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
    private osSep;
    constructor(options?: UploaderOptions);
    pathToRoot(): string;
    _existsSync(filePath: string): boolean;
    utf8encode(str: string): string;
    removeFile(filename: string, callback?: () => void): void;
    uploadFile(req: any, done: UploadCallback): void;
    moveFile(file: FileObject, dest: string, inValid: string | false, callback: (info: UploadResult) => void): void;
    safeCreateDirectory(dir: string): void;
    safeName(files: string[], name: string, cb: SafeNameCallback): void;
    validate(file: FileObject): string | false;
    createThumbnail(info: UploadResult, cb: (info: UploadResult) => void): void;
    logging(...args: any[]): void;
    uploadInfo(finfo: UploadResult): void;
}
export {};
//# sourceMappingURL=express-uploader.d.ts.map