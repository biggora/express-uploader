"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const fs = tslib_1.__importStar(require("fs"));
const os = tslib_1.__importStar(require("os"));
const path = tslib_1.__importStar(require("path"));
const vitest_1 = require("vitest");
const express_uploader_1 = require("../lib/express-uploader");
const tempRoots = [];
function createTempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'express-uploader-'));
    tempRoots.push(root);
    return root;
}
function createUploader(root, options = {}) {
    return new express_uploader_1.Uploader({
        tmpDir: path.join(root, 'tmp'),
        publicDir: path.join(root, 'public'),
        uploadDir: path.join(root, 'public', 'files'),
        uploadUrl: '/files/',
        ...options,
    });
}
function createRequest(files = {}) {
    return {
        files,
        xhr: false,
        header: () => null,
    };
}
function uploadFile(uploader, req) {
    return new Promise((resolve) => {
        uploader.uploadFile(req, (result) => resolve(result));
    });
}
function writeUploadSource(root, name, body = 'file contents') {
    const sourceDir = path.join(root, 'incoming');
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, name);
    fs.writeFileSync(sourcePath, body);
    return sourcePath;
}
(0, vitest_1.afterEach)(() => {
    while (tempRoots.length > 0) {
        const root = tempRoots.pop();
        if (root) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }
});
(0, vitest_1.describe)('Uploader', () => {
    (0, vitest_1.it)('moves an uploaded file into the configured upload directory', async () => {
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
        (0, vitest_1.expect)(Array.isArray(result)).toBe(true);
        (0, vitest_1.expect)(result).toHaveLength(1);
        const [file] = result;
        (0, vitest_1.expect)(file).toMatchObject({
            originalName: 'avatar.txt',
            name: 'avatar.txt',
            size: 16,
            type: 'text/plain',
            url: '/files/avatar.txt',
            success: true,
        });
        (0, vitest_1.expect)(file.error).toBeUndefined();
        (0, vitest_1.expect)(fs.existsSync(sourcePath)).toBe(false);
        (0, vitest_1.expect)(fs.readFileSync(path.join(root, 'public', 'files', 'avatar.txt'), 'utf8')).toBe('uploaded payload');
    });
    (0, vitest_1.it)('returns a no-op error result when no files are present', async () => {
        const root = createTempRoot();
        const uploader = createUploader(root);
        const req = createRequest();
        const result = await uploadFile(uploader, req);
        (0, vitest_1.expect)(result).toMatchObject({
            originalName: '',
            name: '',
            size: 0,
            error: 'Not files found!',
        });
        (0, vitest_1.expect)(req.files).toEqual({});
        (0, vitest_1.expect)(fs.existsSync(path.join(root, 'public', 'files'))).toBe(true);
    });
    (0, vitest_1.it)('rejects invalid uploads when validation is enabled', async () => {
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
        (0, vitest_1.expect)(Array.isArray(result)).toBe(true);
        const [file] = result;
        (0, vitest_1.expect)(file).toMatchObject({
            originalName: 'too-large.txt',
            name: 'too-large.txt',
            success: false,
            error: 'File is too big',
        });
        (0, vitest_1.expect)(fs.existsSync(sourcePath)).toBe(false);
        (0, vitest_1.expect)(fs.existsSync(path.join(root, 'public', 'files', 'too-large.txt'))).toBe(false);
    });
    (0, vitest_1.it)('validates file types against acceptFileTypes', () => {
        const uploader = new express_uploader_1.Uploader({
            validate: true,
            acceptFileTypes: /\.png$/i,
        });
        (0, vitest_1.expect)(uploader.validate({ name: 'document.pdf', size: 10, type: 'application/pdf' })).toBe('Filetype not allowed');
        (0, vitest_1.expect)(uploader.validate({ name: 'photo.png', size: 10, type: 'image/png' })).toBe(false);
    });
    (0, vitest_1.it)('normalizes configured directories and upload URLs', () => {
        const root = createTempRoot();
        const uploader = createUploader(root, {
            safeName: false,
            uploadUrl: '/assets/',
            minFileSize: 3,
            maxFileSize: 30,
        });
        (0, vitest_1.expect)(uploader.settings.safeName).toBe(false);
        (0, vitest_1.expect)(uploader.settings.uploadUrl).toBe('/assets/');
        (0, vitest_1.expect)(uploader.settings.minFileSize).toBe(3);
        (0, vitest_1.expect)(uploader.settings.maxFileSize).toBe(30);
        (0, vitest_1.expect)(uploader.settings.tmpDir.endsWith(path.sep)).toBe(true);
        (0, vitest_1.expect)(uploader.settings.publicDir.endsWith(path.sep)).toBe(true);
        (0, vitest_1.expect)(uploader.settings.uploadDir.endsWith(path.sep)).toBe(true);
    });
    (0, vitest_1.it)('uses the source basename when safeName is disabled', async () => {
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
        const [file] = result;
        (0, vitest_1.expect)(file).toMatchObject({
            originalName: 'original.txt',
            name: 'generated-name.tmp',
            url: '/files/generated-name.tmp',
            success: true,
        });
        (0, vitest_1.expect)(fs.readFileSync(path.join(root, 'public', 'files', 'generated-name.tmp'), 'utf8')).toBe('stored as basename');
    });
    (0, vitest_1.it)('sanitizes unsafe names and avoids collisions', async () => {
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
        const [file] = result;
        (0, vitest_1.expect)(file.name).toBe('avatar_1.txt');
        (0, vitest_1.expect)(file.url).toBe('/files/avatar_1.txt');
        (0, vitest_1.expect)(file.success).toBe(true);
        (0, vitest_1.expect)(fs.readFileSync(path.join(root, 'public', 'files', 'avatar.txt'), 'utf8')).toBe('existing');
        (0, vitest_1.expect)(fs.readFileSync(path.join(root, 'public', 'files', 'avatar_1.txt'), 'utf8')).toBe('new content');
    });
});
//# sourceMappingURL=uploader.test.js.map