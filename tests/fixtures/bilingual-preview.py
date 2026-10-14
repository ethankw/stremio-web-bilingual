#!/usr/bin/env python3
"""Local-only stage B fixture. Synthetic descriptions never enter a release build."""

import argparse
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse


SAMPLES = {
    ('movie', 'tt0012349'): ('[TEST] The Kid', '[测试] 双语电影标题'),
    ('series', 'tt10986410'): ('[TEST] Ted Lasso', '[测试] 双语剧集标题'),
}


def text_field(text, locale):
    return {
        'text': text, 'requestedLocale': locale, 'effectiveLocale': locale,
        'source': 'tmdb', 'status': 'available', 'evidence': 'translation-exact',
    }


class FixtureHandler(SimpleHTTPRequestHandler):
    unavailable = False

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Bilingual-Fixture', 'synthetic-local-only')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path not in ('/api/bilingual/v1/meta', '/api/bilingual/v1/episode'):
            if parsed.path.startswith('/api/'):
                return self.send_json(404, {'error': {'code': 'NOT_FOUND'}})
            return super().do_GET()
        if type(self).unavailable:
            return self.send_json(503, {'error': {'code': 'FIXTURE_OFFLINE'}})
        query = parse_qs(parsed.query)
        allowed_keys = {'type', 'id', 'zh', 'season', 'episode'}
        if set(query) - allowed_keys or any(len(values) != 1 for values in query.values()):
            return self.send_json(400, {'error': {'code': 'INVALID_FIXTURE_QUERY'}})
        media_type = query.get('type', [''])[0]
        imdb_id = query.get('id', [''])[0]
        sample = SAMPLES.get((media_type, imdb_id))
        episode_scope = parsed.path.endswith('/episode')
        titles = sample if sample else ('', '')
        if episode_scope and sample:
            titles = ('[TEST] Pilot', '[测试] 单集标题')
        fields = {
            'title': {
                'en': text_field(titles[0], 'en-US'),
                'zh': text_field(titles[1], 'zh-CN'),
            },
            'overview': {
                'en': text_field('[TEST] This is a synthetic English description for the local UI experiment.', 'en-US'),
                'zh': text_field('[测试] 这是用于本地界面实验的合成中文简介，不是真实影视资料。', 'zh-CN'),
            },
        }
        result = {
            'schemaVersion': 1,
            'identity': {'stremioType': media_type, 'stremioId': imdb_id, 'tmdbId': 100 if sample else None},
            'matchStatus': 'matched' if sample else 'unmatched',
            'scope': 'episode' if episode_scope else 'meta',
            'fetchedAt': datetime.now(timezone.utc).isoformat(),
            **fields,
        }
        if not sample:
            for group in ('title', 'overview'):
                for language in ('en', 'zh'):
                    result[group][language].update(text=None, effectiveLocale=None, source=None, status='missing', evidence=None)
        if episode_scope:
            try:
                result['season'] = int(query.get('season', ['0'])[0])
                result['episode'] = int(query.get('episode', ['1'])[0])
                if result['season'] < 0 or result['episode'] < 1:
                    raise ValueError('Invalid episode coordinates')
            except ValueError:
                return self.send_json(400, {'error': {'code': 'INVALID_FIXTURE_EPISODE'}})
        self.send_json(200, result)

    def do_POST(self):
        if self.path == '/__test/fail':
            type(self).unavailable = True
        elif self.path == '/__test/recover':
            type(self).unavailable = False
        else:
            return self.send_json(404, {'error': {'code': 'NOT_FOUND'}})
        self.send_json(200, {'fixtureUnavailable': type(self).unavailable})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--port', type=int, default=18432)
    args = parser.parse_args()
    expected_directory = Path(__file__).resolve().parents[2] / 'build'
    if Path(args.directory).resolve() != expected_directory or not (expected_directory / 'index.html').is_file():
        parser.error('Only this project\'s build/ directory may be served.')
    if not 1024 <= args.port <= 65535:
        parser.error('Use an unprivileged local port between 1024 and 65535.')
    handler = partial(FixtureHandler, directory=args.directory)
    print(f'Synthetic stage B preview: http://localhost:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), handler).serve_forever()
