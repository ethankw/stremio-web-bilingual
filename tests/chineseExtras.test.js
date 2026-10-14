const fs = require('fs');
const path = require('path');
const english = require('stremio-translations/en-US.json');
const chinese = require('../src/locales/zh-CN.json');
const extra = require('../src/locales/zh-CN-extra.json');

function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filename = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(filename) : /\.[jt]sx?$/.test(entry.name) ? [filename] : [];
    });
}

test('new interface fallback messages have Chinese translations with their variables intact', () => {
    const messages = sourceFiles(path.join(__dirname, '..', 'src')).flatMap((filename) => (
        [...fs.readFileSync(filename, 'utf8').matchAll(/t\('([^']+)',\s*\{\s*defaultValue:\s*'([^']*)'/g)]
    )).filter(([, key]) => !Object.hasOwn(english, key));
    expect(messages.length).toBeGreaterThan(0);
    for (const [, key, fallback] of messages) {
        const translated = extra[key] || chinese[key];
        expect(translated).toEqual(expect.any(String));
        expect(translated).toMatch(/[\u4e00-\u9fff]/);
        expect((translated.match(/{{[^}]+}}/g) || []).sort()).toEqual((fallback.match(/{{[^}]+}}/g) || []).sort());
    }
});
