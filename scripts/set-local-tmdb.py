#!/usr/bin/env python3
"""Read a TMDB token privately and create this project's ignored local file."""

import getpass
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    project_root = Path(__file__).resolve().parent.parent
    target = project_root / '.dev.vars'
    if not sys.stdin.isatty():
        raise SystemExit('请在交互式 Terminal 中运行；不会使用可见输入读取凭证。')
    if not (project_root / 'docs/Stremio_Bilingual_Codex_Plan_0001.md').is_file():
        raise SystemExit('项目身份检查失败，未写入任何凭证。')
    ignored = subprocess.run(
        ['git', 'check-ignore', '-q', '--', '.dev.vars'], cwd=project_root,
        check=False,
    )
    if ignored.returncode != 0:
        raise SystemExit('Git 忽略检查失败，未写入任何凭证。')
    if os.path.lexists(target):
        raise SystemExit('.dev.vars 已存在，已保留现有文件；不会覆盖。')
    token = getpass.getpass('TMDB API Read Access Token（隐藏输入，不含 Bearer 前缀）：').strip()
    if not token:
        raise SystemExit('未输入令牌，未创建文件。')
    if len(token) > 4096 or re.fullmatch(r'[A-Za-z0-9._-]{20,}', token) is None:
        raise SystemExit('令牌格式不正确，未创建文件。请使用 TMDB 只读令牌本体。')
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(target, flags, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
        handle.write('TMDB_READ_TOKEN=' + json.dumps(token) + '\n')
        handle.flush()
        os.fsync(handle.fileno())
    print('已安全保存到本项目 .dev.vars，权限 0600；令牌未显示，也未上传。')


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        raise SystemExit('\n输入已取消。')
