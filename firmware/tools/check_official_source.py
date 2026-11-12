"""Optional oracle audit, independent of the C++ translator and its output.

python firmware/tools/check_official_source.py --pdf ORIGINAL.pdf
Requires pypdf only for this optional source audit (not run_tests.py).
Only nonblank dot sequences are checked mechanically; spacing/layout and rule
interpretation remain separately reviewed. This is not full transcription QA.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
EXPECTED_PDF_SHA256 = 'cb04780710a4b90f93b574d47afee7c01fa4a5593ad65414ec7857cdc1327612'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True, type=Path)
    parser.add_argument('--pypdf-path', type=Path)
    args = parser.parse_args()
    if args.pypdf_path:
        sys.path.insert(0, str(args.pypdf_path))
    from pypdf import PdfReader
    sys.path.insert(0, str(ROOT / 'firmware/tests'))
    from cases_2024 import ASCII_DOTS, CASES
    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if digest != EXPECTED_PDF_SHA256:
        raise ValueError('This audit requires the pinned original NIKL 2024 PDF; hash differs.')
    reader = PdfReader(args.pdf)
    pages = {}
    for printed in range(3, 50):
        runs = []
        def visitor(text, cm, tm, font, size):
            if font and 'HSBRL' in str(font.get('/BaseFont', '')):
                runs.append(text)
        reader.pages[printed + 5].extract_text(visitor_text=visitor)
        # Normalize equivalent uppercase/lowercase Braille font encodings and
        # retain only known nonblank Braille glyphs. No firmware tables loaded.
        pages[printed] = [ASCII_DOTS[c.upper()] for c in ''.join(runs)
                          if c.upper() in ASCII_DOTS and ASCII_DOTS[c.upper()] != '0']
    results = []
    for index, case in enumerate(CASES):
        if case['evidence'] not in ('official-table', 'official-example', 'official-coordinate-example', 'official-example-fragment'):
            continue
        match = re.search(r'pp?\.(\d+)(?:-(\d+))?', case['clauses'])
        if not match:
            results.append(dict(case_index=index, input=case['text'], status='UNVERIFIED', reason='no pinned page'))
            continue
        start = int(match[1]); end = int(match[2] or match[1])
        expected = [p for p in case['expected_dots'] if p != '0']
        candidates = []
        for page in range(start, end + 1):
            source = pages.get(page, [])
            if any(source[at:at+len(expected)] == expected for at in range(len(source) - len(expected) + 1)):
                candidates.append(page)
        results.append(dict(case_index=index, input=case['text'], clauses=case['clauses'],
            status='MATCH' if candidates else 'UNVERIFIED', matched_printed_pages=candidates))
    summary = dict(matched=sum(r['status'] == 'MATCH' for r in results),
                   unverified=sum(r['status'] != 'MATCH' for r in results))
    output = dict(pdf_sha256=digest, summary=summary,
        method='Pinned official PDF HSBRL glyphs vs fixed test oracles. Translator output is never read.',
        limitation='Nonblank glyph-sequence presence only; not spacing, exact word alignment or semantic/rule certification.',
        cases=results)
    target = ROOT / 'firmware/validation/official-source-audit.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary))
    for record in results:
        if record['status'] != 'MATCH':
            print(record['case_index'], ascii(record['input']), record.get('clauses', record.get('reason')))
    return 0 if not summary['unverified'] else 1

if __name__ == '__main__':
    sys.exit(main())
