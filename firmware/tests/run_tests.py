"""Run from any directory: python firmware/tests/run_tests.py.
Requires Python 3, Node 22.18+, and MSVC C++ tools or g++/clang++.
No third-party Python packages are needed for tests.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from collections import Counter
from cases_2024 import CASES
from syllable_oracle_2024 import write_oracle

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.firmware-build'
REPORT = ROOT / 'firmware' / 'validation'
BUILD.mkdir(exist_ok=True)
REPORT.mkdir(exist_ok=True)

def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)

def compile_tests():
    compiler = shutil.which('g++') or shutil.which('clang++')
    extension = '.exe' if os.name == 'nt' else ''
    programs = ['core_test', 'braille_cli', 'context_test', 'input_test']
    if compiler:
        for program in programs:
            run([compiler, '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
                 str(ROOT / 'firmware/tests' / (program + '.cpp')),
                 '-o', str(BUILD / (program + extension))])
    elif os.name == 'nt':
        vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
        if vswhere.exists():
            location = run([str(vswhere), '-latest', '-products', '*', '-requires',
                'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
                capture_output=True, text=True).stdout.strip()
            devcmd = Path(location) / 'Common7/Tools/VsDevCmd.bat'
        else:
            devcmd = Path('C:/Program Files/Microsoft Visual Studio/18/Community/Common7/Tools/VsDevCmd.bat')
        if not devcmd.exists():
            raise RuntimeError('Install MSVC C++ Build Tools or g++/clang++. No tests have run.')
        lines = ['@echo off', f'call "{devcmd}" -arch=x64 >nul', 'if errorlevel 1 exit /b 1']
        for program in programs:
            lines += [f'cl /nologo /EHsc /std:c++17 /utf-8 /W4 /WX /O2 '
                      f'/Fe:.firmware-build\\{program}.exe /Fo:.firmware-build\\{program}.obj '
                      f'firmware\\tests\\{program}.cpp', 'if errorlevel 1 exit /b 1']
        script = BUILD / 'compile-tests.cmd'
        script.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        run(['cmd.exe', '/d', '/c', str(script)])
    else:
        raise RuntimeError('g++/clang++ required. No tests have run.')
    return [BUILD / (p + extension) for p in programs]

def mask(pattern):
    if pattern == '0':
        return 0
    if not pattern or any(c not in '123456' for c in pattern):
        raise ValueError(f'Invalid independently authored oracle: {pattern!r}')
    return sum(1 << (int(c) - 1) for c in pattern)

def braille(cells):
    return ''.join(chr(0x2800 + cell) for cell in cells)

def table_text(value):
    return str(value).replace('|', '\\|').replace('\r', '\\r').replace('\n', '\\n')

def main():
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node required for the real browser-packet fixtures.')
    run([node, '--experimental-strip-types', '--test', 'tests/earlink-protocol.test.mjs'])
    oracle = BUILD / 'hangul-oracle.bin'
    write_oracle(oracle)
    core, cli, context, keys = compile_tests()
    run([str(core), str(BUILD / 'protocol-fixture.bin'), str(BUILD / 'protocol-text.txt')])
    run([str(context), str(oracle), str(REPORT / 'context-coverage.json')])
    # Perkins key input: braille -> text, chords, and real device packets for the web test.
    run([str(keys), str(BUILD / 'input-fixture.bin'), str(BUILD / 'input-expected.json')])
    run([node, '--experimental-strip-types', '--test', 'tests/earlink-input.test.mjs'])
    inputs = BUILD / 'braille-inputs.hex'
    inputs.write_text(''.join(case['text'].encode('utf-8').hex() + '\n' for case in CASES), encoding='ascii')
    output = run([str(cli), str(inputs)], capture_output=True, text=True).stdout.splitlines()
    if len(output) != len(CASES):
        raise AssertionError('Native translator did not return every test case')
    results = []
    for case, line in zip(CASES, output):
        unsupported, encoded, encoded_trace = line.split('\t')
        cells = [int(c) for c in encoded.split(',') if c]
        expected = None if case['expected_dots'] is None else [mask(p) for p in case['expected_dots']]
        trace = []
        for record in encoded_trace.split('|'):
            if record:
                byte, character, cp, begin, end, rule, issue = record.split(',')
                trace.append(dict(byte_offset=int(byte), character_offset=int(character),
                    codepoint=f'U+{int(cp):04X}', cell_begin=int(begin), cell_end=int(end),
                    rule=rule, issue=bool(int(issue))))
        equal = expected is None or expected == cells
        regression = equal and int(unsupported) == case['issues'] and all(0 <= c < 64 for c in cells)
        status = ('PASS' if regression else 'FAIL') if case['verified'] else 'UNVERIFIED'
        per_cell = []
        for index, cell in enumerate(cells):
            per_cell.append(dict(index=index, braille=chr(0x2800 + cell),
                dots=''.join(str(dot) for dot in range(1, 7) if cell & (1 << (dot - 1))) or '0',
                mask=cell, binary=f'{cell:06b}',
                rules=list(dict.fromkeys(e['rule'] for e in trace if e['cell_begin'] <= index < e['cell_end']))))
        results.append(dict(**case, status=status, regression='PASS' if regression else 'FAIL',
            expected_braille=None if expected is None else braille(expected), actual_braille=braille(cells),
            cell_count=len(cells), unsupported=int(unsupported), cells=per_cell, trace=trace))
    counts = Counter(r['status'] for r in results)
    report = dict(standard='MCST 2024-0005 / NIKL 2024 revised Korean Braille',
        source='https://www.korean.go.kr/front/etcData/etcDataView.do?etc_seq=710&mn_id=207',
        scope='PC/software; PASS is only for the tested spelling and cited clauses. No general certification.',
        hardware='UNVERIFIED: no upload, physical BLE, T1-T18, tactile reading, power or coil temperature test.',
        summary=dict(counts), regression_failures=sum(r['regression'] == 'FAIL' for r in results), cases=results)
    (REPORT / 'braille-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lines = ['# 점역 검증 결과', '', 'PC에서 실제 C++ 점역기를 실행한 결과입니다. 실제 하드웨어 검증은 **UNVERIFIED**입니다.', '',
        'PASS는 해당 입력과 명시한 조항의 대조 결과이며 규정 전체 구현·인증을 뜻하지 않습니다.',
        '공식 예시 전사와 수작업 규칙 조합을 `evidence`에서 구분합니다. 미대조 항목은 UNVERIFIED로 유지합니다.', '',
        f"결과: {dict(counts)} / 회귀 검사 실패: {report['regression_failures']}", '',
        '6비트 표시는 **bit5 → bit0**이며, 점 번호 1은 bit0입니다. 빈칸의 점 번호는 0입니다.', '',
        '| 입력 | 예상 점자 | 실제 점자 | 칸 | 점 번호(칸별) | 6비트(칸별) | 판정 | 근거 / 대조 방식 |',
        '|---|---|---|---:|---|---|---|---|']
    for r in results:
        values = [r['text'], r['expected_braille'] if r['expected_braille'] is not None else '미대조',
            r['actual_braille'], r['cell_count'], ' / '.join(c['dots'] for c in r['cells']),
            ' / '.join(c['binary'] for c in r['cells']), r['status'], r['clauses'] + ' / ' + r['evidence']]
        lines.append('| ' + ' | '.join(table_text(v) for v in values) + ' |')
    lines += ['', '## 적용 규칙과 원문 위치', '',
        'JSON 보고서의 각 입력에는 모든 칸의 점 번호·비트마스크·적용 규칙과 원문 바이트/문자 위치를 기록합니다.',
        '검증기에서 번역 결과로 정답을 생성하거나 정답을 자동 갱신하지 않습니다.', '']
    (REPORT / 'BRAILLE_RESULTS.md').write_text('\n'.join(lines), encoding='utf-8')
    print('Braille:', dict(counts), 'regression failures:', report['regression_failures'])
    for r in results:
        if r['regression'] == 'FAIL':
            print('FAIL', repr(r['text']), 'expected', r['source_ascii'], 'actual dots', [c['dots'] for c in r['cells']],
                  'unsupported', r['unsupported'], 'expected', r['issues'])
    return 1 if report['regression_failures'] else 0

if __name__ == '__main__':
    sys.exit(main())
