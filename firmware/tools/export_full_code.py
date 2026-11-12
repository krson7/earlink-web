"""Export complete copyable files, in dependency order. No ZIP or elisions."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'firmware/earlink/Config.h',
    'firmware/earlink/EarlinkLimits.h',
    'firmware/earlink/Utf8.h',
    'firmware/earlink/BrailleRules.h',
    'firmware/earlink/BrailleText.h',
    'firmware/earlink/BrailleMapping.h',
    'firmware/earlink/BrailleOutput.h',
    'firmware/earlink/Protocol.h',
    'firmware/earlink/Pager.h',
    'firmware/earlink/earlink.ino',
    'firmware/tests/core_test.cpp',
    'firmware/tests/cases_2024.py',
    'firmware/tests/braille_cli.cpp',
    'firmware/tests/run_tests.py',
    'firmware/tests/official_words_2024.json',
    'firmware/tests/syllable_oracle_2024.py',
    'firmware/tests/deep_test.cpp',
    'firmware/tests/context_test.cpp',
    'firmware/tests/run_deep_tests.py',
    'firmware/tools/export_full_code.py',
    'firmware/tools/check_official_source.py',
    'firmware/tools/extract_official_words.py',
    'package.json',
    '.gitignore',
]

def main():
    lines = ['# EARLINK 파일별 전체 코드', '',
        '실제 프로젝트 파일을 그대로 읽어 생성한 문서입니다. 파일별 전체 내용을 생략 없이 수록합니다.',
        '`earlink`의 헤더 9개와 `earlink.ino`를 같은 스케치 폴더에 둡니다. 테스트·도구·웹 설정은 해당 경로를 따릅니다.',
        '지원 범위와 미구현 사항은 [RULES_2024.md](RULES_2024.md), 검증은 [결과 표](validation/BRAILLE_RESULTS.md)를 참조하세요.', '',
        '코드 수정 후 `python firmware/tools/export_full_code.py`로 다시 생성합니다.', '']
    manifest = []
    for name in FILES:
        data = (ROOT / name).read_bytes()
        content = data.decode('utf-8').replace('\r\n', '\n')
        language = 'python' if name.endswith('.py') else 'json' if name.endswith('.json') else 'cpp' if name.endswith(('.h', '.cpp', '.ino')) else 'gitignore'
        lines += [f'## {name}', '', f'```{language}', content.rstrip('\n'), '```', '']
        manifest.append(dict(path=name, sha256=hashlib.sha256(content.encode('utf-8')).hexdigest()))
    (ROOT / 'firmware/FULL_CODE.md').write_text('\n'.join(lines), encoding='utf-8')
    import json
    target = ROOT / 'firmware/validation'
    target.mkdir(exist_ok=True)
    (target / 'code-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Exported {len(FILES)} complete files to firmware/FULL_CODE.md')

if __name__ == '__main__':
    main()
