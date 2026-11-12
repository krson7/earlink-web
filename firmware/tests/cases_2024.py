"""Independent fixed oracles, transcribed from the NIKL 2024 PDF.

Braille ASCII here is the PDF's *font encoding*, not firmware output.
The explicit dot chart below was checked against rendered PDF pp.3-12,20,27-31.
No expected value is obtained by calling translate(), decomposing text, or using
the firmware's rule tables. Rule-derived cases are individually composed here.
"""
ASCII_DOTS = {
    'A':'1','B':'12','C':'14','D':'145','E':'15','F':'124','G':'1245',
    'H':'125','I':'24','J':'245','K':'13','L':'123','M':'134','N':'1345',
    'O':'135','P':'1234','Q':'12345','R':'1235','S':'234','T':'2345',
    'U':'136','V':'1236','W':'2456','X':'1346','Y':'13456','Z':'1356',
    '@':'4','[':'246',']':'12456','^':'45','_':'456','!':'2346',
    '"':'5','#':'3456','$':'1246','%':'146','&':'12346',"'":'3',
    '(':'12356',')':'23456','*':'16','+':'346',',':'6','-':'36',
    '.':'46','/':'34','0':'356','1':'2','2':'23','3':'25','4':'256',
    '5':'26','6':'235','7':'2356','8':'236','9':'35',':':'156',
    ';':'56','<':'126','=':'123456','>':'345','?':'1456',
    '{':'246','|':'1256','}':'12456','~':'45','`':'0',' ':'0',
}
CASES = []
def add(text, source_ascii, clauses, evidence='official-example', verified=True, issues=0):
    CASES.append(dict(text=text, expected_dots=None if source_ascii is None else
        [ASCII_DOTS.get(c.upper(), ASCII_DOTS.get(c)) for c in source_ascii],
        source_ascii=source_ascii, clauses=clauses, evidence=evidence,
        verified=verified, issues=issues))

# Complete clause-13 table, printed p.9.
for text, sign in zip('가나다마바사자카타파하', '$cie^l.fhdj'):
    add(text, sign, 'K13 p.9', 'official-table')
add('가나다', '$ci', 'K13 p.9', 'manual-rule-composition')
add('강산', '$7l3', 'K13 p.9')
add('안녕하세요', '<3c}j,n+', 'K1,3,7,13,15 pp.3-11', 'manual-rule-composition')
add('대한민국', 'irj3eq@ma', 'K1,3,7,13,15 pp.3-11', 'manual-rule-composition')
add('학교', 'ja@+', 'K1,3,6,13 pp.3-9', 'manual-rule-composition')
add('한글', 'j3@!', 'K13,15 pp.9-11', 'manual-rule-composition')
add('것', '_s', 'K15 p.10', 'official-table')
# All 7 abbreviation entries, plus actual exceptions (pp.12-13).
for text, sign in [('그래서','as'),('그러나','ac'),('그러면','a3'),('그러므로','a5'),
                   ('그런데','an'),('그리고','au'),('그리하여','a:')]:
    add(text, sign, 'K18 p.12', 'official-table')
for text, sign in [('그래서인지','asq.o'),('그러나저러나','ac.s"sc'),('그러면서','a3,s'),
                   ('그런데도','aniu'),('그리하여도','a:iu'),('왜 그러나요?','vr`ac+8'),
                   ('오그리고','u@{"o@u'),('우그리고','m@{"o@u'),
                   ('쭈그리고',',.m@{"o@u'),('찡그리고',',.o7@{"o@u')]:
    add(text, sign, 'K18 suffix/preceding-letter exception p.13')
add('그림을 그리고 있다.', '@{"o5!`au`o/i4', 'K18 p.12')
add('그림을 그리고서 밥을 먹었다.', '@{"o5!`au,s`^b!`e?s/i4', 'K18 p.13')
add('비가 왔다. 그래서 소풍 계획은 취소되었다.',
    '~o$`v/i4`as`,udm7`@/jyaz`;mr,uiys/i4', 'K18 p.12')
add('아내는 조용히 그러나 단호하게 말했다.',
    '<crcz`.u+7jo`ac`i3juj@n`e1jr/i4', 'K18 p.12')
add('만약 결과가 그러면 어떻게 할 거니?',
    'e3>a`@|@v$`a3`s,is0@n`j1`@sco8', 'K18 p.12')
add('그러므로 오늘 저녁에 와야 한다.', 'a5`uc!`.sc:an`v>`j3i4', 'K18 p.12')
add('내 잘못이 크다. 그런데 누구를 원망하겠나.',
    'cr`.1eu\'o`f{i4`an`cm@m"!`p3e7j@n/c4', 'K18 p.12')
add('그리하여 그들은 친구 사이가 되었다.', 'a:`@{i!z`;q@m`lo$`iys/i4', 'K18 p.13')
# Explicit K14 exceptions, including 팠 (not the superficially similar 파+ㅆ).
for text, sign in [('나이','c<o'),('다음','i<[5'),('마우스','e<m,{'),('바위','^<mr'),
                   ('자아','.<<'),('카이로','f<o"u'),('넥타이','cnah<o'),
                   ('파이프','d<od{'),('하얀','j<>3'),('땅을 팠다.',',i7!`d</i4')]:
    add(text, sign, 'K14 pp.9-10')
for text, sign in [('가이','$o'),('사이','lo'),('밥이','^bo'),('까이',',$o'),
                   ('따이',',i<o'),('껐',',@s/'),('겄','@s/'),('갔','$/')]:
    add(text, sign, 'K4,13-16 pp.4,9-11', 'manual-rule-composition')
# VC contractions and remaining cluster finals, transcribed p.11.
for text, sign in [('억','?'),('언',')'),('얼','t'),('연','*'),('열','|'),('영','}'),
                   ('옥','x'),('온','('),('옹','='),('운','g'),('울','&'),('은','z'),('을','!'),('인','q')]:
    add(text,sign,'K15 p.10','official-table')
for text, sign in [('덕망','i?e7'),('기적','@o.?'),('꺾다',',@?ai'),('넋',"c?'"),
                   ('건전지','@).).o'),('얹다',')ki'),('벌레','~t"n'),('얽다','tai'),
                   ('젊다','.t5i'),('넓다','ctbi'),('변화','~*jv'),('수련',',m"*'),
                   ('별자리','~|."o'),('엷다','|bi'),('평화','d}jv'),('안녕','<3c}'),
                   ('복덕방','~xi?~7'),('볶다','~xai'),('논두렁','c(im"s7'),
                   ('동그라미','i=@{"<eo'),('순두부',',gim~m'),('불고기','~&@u@o'),
                   ('붉다','^&ai'),('굶다','@&5i'),('훑다','j&8i'),('근로','@z"u'),
                   ('끊다',',@z0i'),('글씨','@!,,o'),('긁다','@!ai'),('읊다','!4i'),
                   ('끓다',',@!0i'),('진실','.q,o1')]:
    add(text, sign, 'K15 p.11')
for text, sign in [('까치',',$;o'),('힘껏','jo5,_s'),('마음껏','e<{5,_s'),
                   ('불을 껐다.','~&!`,@s/i4'),('성가',',}$'),('말썽','e1,,]'),
                   ('정성','.},}'),('어정쩡','s.},.}'),('청년',';}c*'),('얄라셩','>1"<,:7')]:
    add(text, sign, 'K16-17 pp.11-12')
for text, sign in [('아예','<-/'),('도예','iu-/'),('뭐예요','ep-/+'),('서예',',s-/'),
                   ('야애','>-r'),('소화액',',ujv-ra'),('수액',',m-ra'),('파워앰프','d<p-r5d{')]:
    add(text, sign, 'K11-12 p.8')
for text, sign in [('ㄱ','=a'),('ㄱㄴㄷ','=a=3=9'),('ㅏ','=<'),('ㅖ','=/'),
                   ('ㄱ자','=a.'),('아이ㅅ','<o_\''),('ㄳ',"=a'"),('ㅆ','=/'),
                   ('꿇',',@&0'),('있','o/')]:
    add(text, sign, 'K3-10 pp.4-7', 'manual-rule-composition')
for text, sign in [('ㅑ','>'),('ㅓ','s'),('ㅕ',':'),('ㅗ','u'),('ㅛ','+'),('ㅜ','m'),
                   ('ㅠ','%'),('ㅡ','{'),('ㅣ','o'),('ㅐ','r'),('ㅒ','>r'),('ㅔ','n'),
                   ('ㅘ','v'),('ㅙ','vr'),('ㅚ','y'),('ㅝ','p'),('ㅞ','pr'),('ㅟ','mr'),('ㅢ','w')]:
    add(text,'='+sign,'K6-8 pp.5-6','manual-rule-composition')
# Numbers: unchanged numeric state only through decimal/comma, K43.
add('12345','#abcde','K40 p.27','manual-rule-composition')
for text, sign in [('0.48','#j4dh'),('1,000','#a1jjj'),('9,375명','#i1cge`e}'),
                   ('5,700,000원','#e1gjj1jjjp3'),('02)799-1000','#jb,0#gii-#ajjj'),
                   ('3·1 운동','#c"2#a`gi='),('5:3','#e"1#c'),
                   ('10/1~10/9','#aj_/#a@9#aj_/#i'),
                   ('1가','#a$'),('2권','#b@p3'),('3반','#c^3'),('4선','#d,)'),
                   ('5월','#ep1'),('6일','#fo1'),('7자루','#g."m'),('8꾸러미','#h,@m"seo'),
                   ('1년','#a`c*'),('2도','#b`iu'),('3명','#c`e]'),('4칸','#d`f3'),
                   ('5톤','#e`h('),('6평','#f`d]'),('7항','#g`j7'),('5운6기','#e`g#f@o')]:
    add(text, sign, 'K40-44 pp.27-28')
add('Hello','0,hello4','K28-29 pp.19-20','manual-rule-composition')
add('HELLO','0,,hello4','K28-29 pp.19-20','manual-rule-composition')
add('안녕하세요 123','<3c}j,n+`#abc','K13,15,40','manual-rule-composition')
add('Hello 안녕하세요','0,hello4`<3c}j,n+','K28-29,13,15','manual-rule-composition')
add('오늘 날씨가 좋습니다.','uc!`c1,,o$`.u0,{bcoi4','K1-7,13,15,49','manual-rule-composition')
add('안녕하세요!','<3c}j,n+6','K1-7,13,15,49','manual-rule-composition')
add('정말 감사합니다.','.}e1`$5ljbcoi4','K13,15,17,49','manual-rule-composition')
for text, sign in [('New York','0,new`,york4'),('NEW YORK','0,,new`,,york4'),
                   ('McDonald','0,mc,donald4'),('IoT','0,io,t4'),('iOS','0i,,os4'),
                   ('MP3','0,,mp#c'),('A4용지','0,a#d+7.o'),('LP 1장','0,,lp`#a.7'),
                   ('KBS 1 TV','0,,kbs`#a`,,tv4'),('WHO: 세계보건기구','0,,who"1`,n@/~u@)@o@m')]:
    add(text, sign, 'K28-35 pp.19-24','manual-rule-composition')
add('Hello123a','0,hello#abc;a4','K28-29,32,35,40','manual-rule-composition')
add('A4B','0,a#d,b4','K28-29,32,35,40','manual-rule-composition')
add('D-100','0,d-#ajj','K35 p.23','manual-rule-composition')
add('CD 1장','0;,,cd`#a.7','K35 p.24','manual-rule-composition')
add('a, b, c','0a1`;b1`;c4','K32 p.21','manual-rule-composition')
add('Hello-HELLO','0,hello-,,hello4','K29,32','manual-rule-composition')
add('WELCOME TO KOREA',"0,,,welcome`to`korea,'4",'K28-29 pp.19-20','manual-rule-composition')
add('123a','#abc0a4','K28-29,40','manual-rule-composition')
add('“Hello”','80,hello0','K34,49','manual-rule-composition')
add('Hello!','0,hello6','K33,49','manual-rule-composition')
add('Hello, 안녕','0,hello"`<3c}','K33 p.22','manual-rule-composition')
add('Hello, Hello','0,hello1`,hello4','K29,32','manual-rule-composition')
add('가\n나','$`c','display newline policy (not paper layout)','application-policy',False)
add('가\r\n나','$`c','display CRLF policy (not paper layout)','application-policy',False)
for text, sign in [('가, 나.','$"`c4'),('“가”','8$0'),('‘나’',",8c0'"),
                   ('(가)',"8'$,0"),('[나]','82c;0'),('{다}','81i"0'),
                   ('『가』',';8$02'),('「나」','"8c01'),('《다》',';7i72'),('〈마〉','"7e71'),
                   ('가―나','$--c'),('가-나','$-c'),('가…나','$,,,c'),('가……나','$,,,c'),
                   ('가...나','$444c'),('가......나','$444c'),('5%에','#e0p`n'),
                   ('밤ː나무',"^5,'cem")]:
    add(text, sign, 'K49,53-55,63,69 pp.31-45','manual-rule-composition')
# Normalization/compatibility errors are explicitly not certified literary tests.
add('한글','j3@!','Unicode modern NFD composition','application-policy',False)
add('간','$3','Unicode partial decomposition LV+T','application-policy',False)
add('⠁⠂⠄',None,'raw cell compatibility, not K67 printed-dot notation','application-policy',False)
for text, reason in [('😀','unsupported Unicode'),('ㄸ','standalone final form not verified'),
                     ('ㆆ','old Hangul not implemented'),('α','Greek not implemented'),
                     ('school','UEB contractions not implemented'),('Table of Contents','UEB contractions not implemented'),
                     ('청군:백군','colon semantics need human interpretation')]:
    add(text,None,reason,'unsupported/unverified',False,1 if text != 'Table of Contents' else 3)
add('who',None,'UEB strong wordsign context not implemented','unsupported/unverified',False,1)
add('?는',"_8`,\'e&[5d+,\'cz",'K49 attachment p.34','official-example')
add('?는 대개 앞말에 붙여 쓴다.',
    "_8`,\'e&[5d+,\'cz`ir@r`<4e1n`^m8:`,,zi4",'K49 attachment p.34','official-example')

# Further actual K8-K10 examples: independent jamo must not be confused with
# the attached consonants used inside phonetic spellings.
add('낫 놓고 ㄱ자도 모른다.', "c'`cu0@u`=a.iu`eu\"zi4", 'K8 attachment p.6')
add('ㅂ은 여섯 번째 자음이다.', "=bz`:,s'`~),.r`.<[5oi4", 'K8 attachment p.7')
add('삼각형 ㄱㄴㄷ','l5$aj}`=a=3=9','K8 p.6')
for text, sign in [('ㄱ. 유아기','=a4`%<@o'),('ㄴ. 아동기','=34`<i=@o'),
                   ('ㄷ. 청년기','=94`;]c*@o'),('ㄹ. 장년기','=14`.7c*@o'),('ㅁ. 노년기','=54`cuc*@o')]:
    add(text,sign,'K9 p.7')
for text, sign in [('[ㄹㄹ로마]','82_1_1"ue;0'),('[까ㄹㄹ로]','82,$_1_1"u;0'),
                   ('[봉주ㄹ흐]','82~=.m_1j{;0'),('[ㅅ떠디이]',"82_',isioo;0"),('[아이ㅅ]',"82<o_';0")]:
    add(text,sign,'K10 p.7','official-example-fragment')

# Additional independent oracles from exact, reviewed same-row PDF font pairs.
# The source coordinates and pinned PDF hash remain in the fixed corpus.
import json as _json
from pathlib import Path as _Path
_font_corpus = _json.loads(_Path(__file__).with_name('official_words_2024.json').read_text(encoding='utf-8'))
_page_clauses = {3:'K1',4:'K2-4',5:'K5-7',6:'K7-8',8:'K11-12',9:'K13-14',
                 10:'K14-15',11:'K15-16',12:'K16-18',13:'K18'}
for _word in _font_corpus['words']:
    _existing = [case for case in CASES if case['text'] == _word['text']]
    if _existing:
        if any(case['expected_dots'] != _word['expected_dots'] for case in _existing):
            raise ValueError('Conflicting independently authored oracles: ' + _word['text'])
        continue
    add(_word['text'],_word['source_ascii'],_page_clauses[_word['printed_page']] + ' p.' + str(_word['printed_page']),
        'official-coordinate-example')
    CASES[-1]['source_bbox'] = _word['source_bbox']
    CASES[-1]['braille_bbox'] = _word['braille_bbox']
