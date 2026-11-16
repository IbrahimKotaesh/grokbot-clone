"""Bounded document-to-text extraction. Reads stdin; never writes uploaded files."""
import io, json, sys, zipfile, resource, posixpath
import xml.etree.ElementTree as ET
if sys.platform.startswith('linux'):
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
data = sys.stdin.buffer.read(10 * 1024 * 1024 + 1)
if len(data) > 10 * 1024 * 1024:
    raise ValueError('File exceeds 10 MB')
ext = sys.argv[1]
parts, note, count = [], '', 0
LIMIT = 300000

def add(text):
    global count
    if count < LIMIT:
        text = text[:LIMIT-count]
        parts.append(text)
        count += len(text)

if ext == 'pdf':
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted and not reader.decrypt(''):
        raise ValueError('Unlock this password-protected PDF before uploading it.')
    total = len(reader.pages)
    for i, page in enumerate(reader.pages[:200]):
        if count >= LIMIT:
            break
        add(f'\n[Page {i+1}]\n' + (page.extract_text() or ''))
    # Page labels alone are not readable text.
    if not any(any(c.isalpha() for c in p.split(']\n',1)[-1]) for p in parts):
        parts = []
        note = 'No selectable text found. This may be a scanned PDF. Upload photos of its pages for visual analysis.'
    elif total > 200:
        note = f'Only the first 200 of {total} pages were extracted.'
elif ext in ('docx', 'xlsx'):
    z = zipfile.ZipFile(io.BytesIO(data))
    entries = z.infolist()
    if len(entries) > 2000 or sum(e.file_size for e in entries) > 40 * 1024 * 1024:
        raise ValueError('Document expands beyond the supported limit.')
    def xml(name):
        raw = z.read(name)
        if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
            raise ValueError('Unsupported XML declarations in document.')
        return ET.fromstring(raw)
    if ext == 'docx':
        root = xml('word/document.xml')
        for para in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
            add(''.join(t.text or '' for t in para.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')) + '\n')
            if count >= LIMIT: break
        note = 'Extracted Word body text, including table cell text. Images and layout are not included.'
    else:
        ns = {'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(t.text or '' for t in item.iter('{'+ns['s']+'}t')) for item in xml('xl/sharedStrings.xml')]
        rels = {r.attrib['Id']:r.attrib['Target'] for r in xml('xl/_rels/workbook.xml.rels')}
        workbook = xml('xl/workbook.xml')
        sheets = workbook.findall('s:sheets/s:sheet', ns)
        for sheet in sheets[:20]:
            target = rels.get(sheet.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'))
            if not target: continue
            name = posixpath.normpath(target.lstrip('/') if target.startswith('/') else 'xl/'+target)
            if not name.startswith('xl/'): raise ValueError('Invalid worksheet path')
            add('\n[Worksheet: '+sheet.attrib['name']+']\n')
            rows = xml(name).findall('s:sheetData/s:row', ns)
            for row in rows[:5000]:
                values = []
                for cell in list(row)[:100]:
                    value = cell.findtext('s:v', '', ns)
                    if cell.attrib.get('t') == 's': value = strings[int(value)]
                    elif cell.attrib.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in cell.findall('.//s:t',ns))
                    formula = cell.findtext('s:f', '', ns)
                    if formula and not value: value = '[Formula, no cached value: '+formula+']'
                    values.append(cell.attrib.get('r','')+'='+value)
                add('\t'.join(values)+'\n')
                if count >= LIMIT: break
            if len(rows) > 5000: note = 'Worksheet preview is limited to 5000 rows and 100 cells per row.'
            if count >= LIMIT: break
        if len(sheets)>20: note += ' Only the first 20 worksheets were extracted.'
else:
    text = data.decode('utf-8-sig')
    if '\x00' in text or sum(ord(c)<32 and c not in '\n\r\t' for c in text)>max(10,len(text)//100):
        raise ValueError('Choose a UTF-8 text file, PDF, DOCX or XLSX.')
    add(text)
if count >= LIMIT: note += ' Text extraction is limited to the first 300,000 characters.'
text = '\n'.join(parts).strip()
if not text and not note: note = 'This document contains no readable text.'
print(json.dumps({'text':text,'note':note.strip()},ensure_ascii=False))
