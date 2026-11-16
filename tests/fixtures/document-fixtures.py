import io,zipfile,json,base64

def zipped(files):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for name,text in files.items():z.writestr(name,text)
    return base64.b64encode(out.getvalue()).decode()
print(json.dumps({
'docx':zipped({'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>FINO_WORD_615 مرحبا</w:t></w:r></w:p></w:body></w:document>'}),
'xlsx':zipped({'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>FINO_SHEET_927</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>'}),
'bomb':zipped({'padding':b'0'*(41*1024*1024)}),
'entities':zipped({'word/document.xml':'<!DOCTYPE d [<!ENTITY x "bad">]><d>&x;</d>'})
}))
