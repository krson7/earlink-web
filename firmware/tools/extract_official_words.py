"""Extract same-row Korean example/font pairs from the pinned NIKL PDF.

Optional source preparation only: requires PyMuPDF for --pdf. --layout accepts
the saved font/bounding-box JSON for development. Never reads translator output.
New data must be reviewed; this tool does not edit the fixed test corpus.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
PDF_HASH = 'cb04780710a4b90f93b574d47afee7c01fa4a5593ad65414ec7857cdc1327612'

def extract(pages):
    candidates = []
    for page in pages:
        rows = {}
        for block in page['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    rows.setdefault(round(span.get('origin', [0, span['bbox'][1]])[1], 1), []).append(span)
        for spans in rows.values():
            slots = []
            for span in sorted(spans, key=lambda item: item['bbox'][0]):
                text = span['text'].strip()
                if not text:
                    continue
                is_braille = 'HSBRL' in span['font']
                if slots and slots[-1]['braille'] == is_braille and span['bbox'][0] - slots[-1]['bbox'][2] < (8 if is_braille else 3):
                    slots[-1]['text'] += text
                    slots[-1]['bbox'][2] = span['bbox'][2]
                else:
                    slots.append(dict(text=text, braille=is_braille, bbox=list(span['bbox'])))
            for label, braille in zip(slots, slots[1:]):
                if not label['braille'] and braille['braille'] and re.fullmatch(r'[\uac00-\ud7a3]{1,6}', label['text']):
                    candidates.append(dict(text=label['text'], source_ascii=braille['text'].replace(' ', ''),
                        printed_page=page['printed_page'], source_bbox=label['bbox'], braille_bbox=braille['bbox']))
    return candidates

def main():
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--pdf', type=Path)
    source.add_argument('--layout', type=Path)
    parser.add_argument('--pymupdf-path', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT/'.firmware-build/rules/word-candidates.json')
    args = parser.parse_args()
    if args.pdf:
        if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != PDF_HASH:
            raise ValueError('The pinned NIKL PDF hash does not match')
        if args.pymupdf_path:
            sys.path.insert(0, str(args.pymupdf_path))
        import pymupdf
        document = pymupdf.open(args.pdf)
        pages = [dict(printed_page=page, blocks=document[page+5].get_text('dict')['blocks']) for page in range(3,14)]
    else:
        pages = json.loads(args.layout.read_text(encoding='utf-8'))
    words = extract(pages)
    args.output.write_text(json.dumps(dict(pdf_sha256=PDF_HASH, review='REQUIRED',
        method='Same-row Korean label followed by HSBRL font run; retains source coordinates.',
        limitation='Word examples only; PDF-inserted ASCII spaces in glyph runs are removed, actual blank glyphs are retained.',
        words=words), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Extracted', len(words), 'candidate word/font pairs')
    for page in range(3,14):
        print(page, [(w['text'], w['source_ascii']) for w in words if w['printed_page'] == page])

if __name__ == '__main__':
    main()
