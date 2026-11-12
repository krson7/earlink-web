"""Independent, rule-derived Hangul oracle for exhaustive tests.

This uses Python's Unicode NFD and written jamo keys, not the firmware's
integer tables, arithmetic decomposition, or translate() output. Dot facts are
transcribed in the official PDF font encoding. This is a second implementation
of our reading of clauses 1-17/44, NOT an independently certified translator.
Generated cases are rule-derived checks, not direct official-example PASSes.
"""
from pathlib import Path
import struct
import unicodedata
from cases_2024 import ASCII_DOTS

INITIAL = dict(zip('ᄀᄁᄂᄃᄄᄅᄆᄇᄈᄉᄊᄋᄌᄍᄎᄏᄐᄑᄒ',
    ['@',',@','c','i',',i','"','e','^',',^',',',',,','','.',',.',';','f','h','d','j']))
VOWEL = dict(zip('ᅡᅢᅣᅤᅥᅦᅧᅨᅩᅪᅫᅬᅭᅮᅯᅰᅱᅲᅳᅴᅵ',
    ['<','r','>','>r','s','n',':','/','u','v','vr','y','+','m','p','pr','mr','%','[','w','o']))
# Split final clusters into written jamo, independently of firmware final indexes.
TAIL_LETTERS = dict(zip('ᆨᆩᆪᆫᆬᆭᆮᆯᆰᆱᆲᆳᆴᆵᆶᆷᆸᆹᆺᆻᆼᆽᆾᆿᇀᇁᇂ',
    ['ㄱ','ㄱㄱ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ',
     'ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']))
FINAL = dict(zip('ㄱㄴㄷㄹㅁㅂㅅㅆㅇㅈㅊㅋㅌㅍㅎ', ['a','3','9','1','5','b',"'",'/','7','k','2','6','8','4','0']))
# K15, printed pp.10-11. Keys use vowels as Unicode NFD letters + final letters.
VC = {'ᅥㄱ':'?','ᅥㄴ':')','ᅥㄹ':'t','ᅧㄴ':'*','ᅧㄹ':'|','ᅧㅇ':'}',
      'ᅩㄱ':'x','ᅩㄴ':'(','ᅩㅇ':'=','ᅮㄴ':'g','ᅮㄹ':'&','ᅳㄴ':'z','ᅳㄹ':'!','ᅵㄴ':'q'}
A = dict(zip('ᄀᄁᄂᄃᄄᄆᄇᄈᄉᄊᄌᄍᄏᄐᄑᄒ',
    ['$',',$','c','i',',i','e','^',',^','l',',l','.',',.','f','h','d','j']))
NO_A_BEFORE_VOWEL = set('ᄂᄃᄄᄆᄇᄈᄌᄍᄏᄐᄑᄒ')
SEONG = {'성':',}', '썽':',,}', '정':'.}', '쩡':',.}', '청':';}'}
SYEONG = set('셩쎵졍쪙쳥')

def ascii_cells(text):
    return bytes(sum(1 << (int(n)-1) for n in ASCII_DOTS[c.upper()]) if ASCII_DOTS[c.upper()] != '0' else 0
                 for c in text)

def spelling(syllable, before_vowel=False):
    letters = unicodedata.normalize('NFD', syllable)
    onset, vowel = letters[:2]
    final = TAIL_LETTERS.get(letters[2:] or '', '')
    if syllable in ('것', '껏'):
        return '_s' if syllable == '것' else ',_s'
    if vowel == 'ᅡ' and onset in A and syllable != '팠':
        if not (before_vowel and not final and onset in NO_A_BEFORE_VOWEL):
            return A[onset] + ''.join(FINAL[c] for c in final)
    if syllable in SEONG:
        return SEONG[syllable]
    if final and syllable not in SYEONG and vowel + final[0] in VC:
        return INITIAL[onset] + VC[vowel + final[0]] + ''.join(FINAL[c] for c in final[1:])
    return INITIAL[onset] + VOWEL[vowel] + ''.join(FINAL[c] for c in final)

def record(syllable):
    letters = unicodedata.normalize('NFD', syllable)
    onset, vowel = letters[:2]
    tail = letters[2:]
    # Previous-vowel class: 0=closed, 1=other open, 2=야/와/우/워 open.
    left = 0 if tail else (2 if vowel in 'ᅣᅪᅮᅯ' else 1)
    # Following-vowel class: 1=예, 2=애 with silent initial; else 0.
    right = (1 if vowel == 'ᅨ' else 2 if vowel == 'ᅢ' else 0) if onset == 'ᄋ' else 0
    numeric_space = onset in 'ᄂᄃᄆᄏᄐᄑᄒ' or (onset == 'ᄋ' and vowel == 'ᅮ' and tail and TAIL_LETTERS[tail].startswith('ㄴ'))
    return ascii_cells(spelling(syllable)), ascii_cells(spelling(syllable, True)), bytes([
        left, right, int(onset == 'ᄋ'), int(bool(numeric_space))])

def write_oracle(path):
    rows = [record(chr(cp)) for cp in range(0xac00, 0xd7a4)]
    data = bytearray(b'ELG1' + struct.pack('<I', len(rows)))
    for plain, before, metadata in rows:
        data += bytes([len(plain)]) + plain + bytes([len(before)]) + before + metadata
    Path(path).write_bytes(data)
    return len(rows)

if __name__ == '__main__':
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.firmware-build/hangul-oracle.bin')
    print('Generated', write_oracle(target), 'rule-derived oracles:', target)
