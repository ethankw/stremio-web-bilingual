const fs = require('fs');
const ts = require('typescript');
const path = require('path');
const all = require('langs').all();
const languages = { find: (value) => { const lang = all.find((lang) => [lang['1'], lang['2'], lang['2B'], lang['2T'], lang['3'], lang.ietf].includes(value)); return lang && { code: lang['2'] }; } };
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/routes/Player/useSubtitles.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const moduleExports = {};
new Function('require', 'exports', compiled)((name) => name === 'stremio/common' ? { languages } : {}, moduleExports);
const { buildCandidates, resolveBestCandidate } = moduleExports;
const track = (id, lang) => ({ id, lang });
const choose = (preferred, embedded, external = [], session = null, saved = null) => resolveBestCandidate(buildCandidates(session, saved, preferred), embedded, external);

test('preferred Chinese aliases outrank English and previous movie choices across track sources', () => {
    const zh = track('zh', 'zh');
    const en = track('en', 'eng');
    const fr = track('fr', 'fre');
    expect(choose('chi', [en, fr], [zh], { enabled: true, language: 'fre', source: 'embedded' }, { id: 'fr', language: 'fre', embedded: true }).track).toBe(zh);
    expect(choose('zho', [en], [track('chinese', 'chi')]).track.id).toBe('chinese');
    expect(choose('zh-CN', [en], [track('traditional', 'zh-Hant')]).track.id).toBe('traditional');
});

test('always falls back to English before any other available language', () => {
    const fr = track('fr', 'fre');
    const en = track('en', 'en');
    expect(choose('chi', [fr], [en]).track).toBe(en);
    expect(choose('chi', [fr]).track).toBe(fr);
    expect(choose('chi', [], [track('unknown', 'und')]).track.id).toBe('unknown');
    expect(choose(null, [fr], [en]).track).toBe(en);
    expect(choose('chi', [])).toBeUndefined();
});

test('later preferred tracks replace an initial fallback; exact saved tracks only win within their language', () => {
    const en = track('en', 'eng');
    const zh = track('zh', 'chi');
    const saved = { id: 'en', language: 'eng', embedded: true };
    expect(choose('chi', [en], [], null, saved).track).toBe(en);
    expect(choose('chi', [en], [zh], null, saved).track).toBe(zh);
});
