# Private document uploads

The composer supports up to three files, 10 MB each and 20 MB combined: PDF, DOCX, XLSX and common UTF-8 text formats (CSV/TSV/JSON/Markdown/code). Files and extracted text are stored in owner-scoped SQLite tables. Only PDF opens inline; other file types download, including HTML. Document contents are source material, never authorization.

Provision on the app host:

```sh
python3 -m venv /opt/fino-documents/venv
/opt/fino-documents/venv/bin/pip install -r infra/documents/requirements.txt
```

The app runs the versioned `server/scripts/extract-document.py` in a separate process, using `DOCUMENT_PYTHON` or `/opt/fino-documents/venv/bin/python`. The extractor reads stdin and writes JSON to stdout; it does not write uploaded files or execute document macros/formulas. It has a 768 MB address-space limit, 25 CPU seconds and a 30-second wall timeout. One upload extraction request is processed at a time. Office archives are capped at 2000 entries and 40 MB expanded size; XML entity/DOCTYPE declarations are rejected.

Extraction limits: first 200 PDF pages, 300,000 characters per file; XLSX first 20 sheets, 5000 rows per sheet and 100 cells per row. Formulas use cached values, and show a note if no cached value exists. DOCX extracts body text/table cells, without images or layout. Scanned PDFs without text receive a visible explanation and can be supplied as page photos for visual analysis; this is not OCR.

The current turn gets a bounded text preview plus file IDs. Both subscription providers can call `read_file` with `next_offset` for more or revisit earlier attachments. Group members can read their room's files; other bots/owners cannot. Truncation and extraction limitations accompany the text and the bot is instructed to disclose them.
