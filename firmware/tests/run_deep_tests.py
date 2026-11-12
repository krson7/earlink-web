"""Exhaustive rule-derived checks and a timed native/ASan soak (no hardware).

python firmware/tests/run_deep_tests.py --seconds 600
python firmware/tests/run_deep_tests.py --seconds 600 --asan
The full 11,172 squared matrix is mandatory unless --sampled is specified.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from syllable_oracle_2024 import write_oracle

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.firmware-build'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, default=600)
    parser.add_argument('--asan', action='store_true')
    parser.add_argument('--sampled', action='store_true')
    args = parser.parse_args()
    if args.seconds < 0:
        parser.error('--seconds must be nonnegative')
    BUILD.mkdir(exist_ok=True)
    oracle = BUILD / 'hangul-oracle.bin'
    write_oracle(oracle)
    name = 'deep-test-asan' if args.asan else 'deep-test-release'
    extension = '.exe' if os.name == 'nt' else ''
    executable = BUILD / (name + extension)
    compiler = shutil.which('g++') or shutil.which('clang++')
    report = ROOT / 'firmware/validation' / (name + '.json')
    report.parent.mkdir(exist_ok=True)
    # A failed compiler/runtime must never leave an earlier successful report.
    report.write_text(json.dumps(dict(passed=False, error='run has not completed',
        started_utc=datetime.now(timezone.utc).isoformat()), indent=2) + '\n', encoding='utf-8')
    hashed_files = [ROOT/'firmware/tests/deep_test.cpp', ROOT/'firmware/tests/syllable_oracle_2024.py',
                   *sorted((ROOT/'firmware/earlink').glob('*.h'))]
    hashes = {str(path.relative_to(ROOT)).replace('\\','/'):
              hashlib.sha256(path.read_bytes()).hexdigest() for path in hashed_files}
    command = [str(executable), str(oracle), str(report), str(args.seconds), 'sampled' if args.sampled else 'full']
    begin = time.perf_counter()
    if compiler:
        flags = ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-O1' if args.asan else '-O2']
        if args.asan:
            flags += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer', '-g']
        subprocess.run([compiler, *flags, str(ROOT/'firmware/tests/deep_test.cpp'), '-o', str(executable)], cwd=ROOT, check=True)
        completed = subprocess.run(command, cwd=ROOT)
    elif os.name == 'nt':
        vswhere = Path(os.environ.get('ProgramFiles(x86)', 'C:/Program Files (x86)')) / 'Microsoft Visual Studio/Installer/vswhere.exe'
        location = subprocess.run([str(vswhere), '-latest', '-products', '*', '-requires',
            'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'],
            capture_output=True, text=True, check=True).stdout.strip()
        devcmd = Path(location) / 'Common7/Tools/VsDevCmd.bat'
        flags = '/fsanitize=address /Zi /O1 /MD' if args.asan else '/O2 /MD'
        # Run inside the developer environment so the matching ASan DLL is found.
        script = BUILD / (name + '.cmd')
        script.write_text('\n'.join([
            '@echo off', f'call "{devcmd}" -arch=x64 >nul', 'if errorlevel 1 exit /b 1',
            f'cl /nologo /EHsc /std:c++17 /utf-8 /W4 /WX {flags} '
            f'/Fe:.firmware-build\\{name}.exe /Fo:.firmware-build\\{name}.obj '
            f'/Fd:.firmware-build\\{name}.pdb firmware\\tests\\deep_test.cpp',
            'if errorlevel 1 exit /b 1',
            subprocess.list2cmdline(command), 'exit /b %errorlevel%', '']), encoding='utf-8')
        completed = subprocess.run(['cmd.exe', '/d', '/c', str(script)], cwd=ROOT)
    else:
        raise RuntimeError('C++17 compiler required')
    if report.exists():
        data = json.loads(report.read_text(encoding='utf-8'))
        data.update(instrumentation='AddressSanitizer (MSVC)' if args.asan and not compiler else
                    'AddressSanitizer+UndefinedBehaviorSanitizer' if args.asan else 'optimized native',
                    requested_seconds=args.seconds, total_runner_seconds=time.perf_counter()-begin,
                    classification='rule-derived conformance + software invariants; not full official certification',
                    hardware='UNVERIFIED; software-only execution', runner_exit_code=completed.returncode,
                    source_sha256=hashes, oracle_sha256=hashlib.sha256(oracle.read_bytes()).hexdigest(),
                    finished_utc=datetime.now(timezone.utc).isoformat())
        data['passed'] = bool(data.get('passed')) and completed.returncode == 0
        report.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return completed.returncode

if __name__ == '__main__':
    sys.exit(main())
