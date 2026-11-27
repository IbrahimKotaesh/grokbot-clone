// The "never touch payment details" guard: real IBANs and card numbers are caught, random codes are not.
//   DB_PATH=:memory: node --env-file=.env tests/money-guard.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { moneyText, findIban } = await import('../server/dist/agent/employee-rules.js');
const { importedLibs } = await import('../server/dist/agent/office-tools.js');

// Real bank numbers, with and without spaces, are still blocked.
assert.equal(findIban('Pay to NL91ABNA0417164300 today'), 'NL91ABNA0417164300');
assert.equal(findIban('IBAN: NL91 ABNA 0417 1643 00.'), 'NL91ABNA0417164300');
assert.equal(findIban('de89 3704 0044 0532 0130 00'), 'DE89370400440532013000');
assert.equal(moneyText('echo NL91ABNA0417164300'), 'a bank account number (IBAN)');
assert.equal(moneyText('card 4111 1111 1111 1111'), 'a payment card number');

// Codes that only look like one are not: a wrong check digit, a made-up country, file keys and timestamps.
assert.equal(findIban('NL92ABNA0417164300'), undefined, 'bad check digits');
assert.equal(findIban('BK99OAIEAGXT 20261127T195842Z'), undefined, 'no such country, just a file key and a date');
const karim = fs.readFileSync(new URL('./fixtures/karim-shell-command.txt', import.meta.url), 'utf8');
assert.equal(moneyText(karim), undefined, "Karim's invoice download is not a bank number");

// Python: libraries the code imports are installed for it.
assert.deepEqual(importedLibs('import os, json\nfrom reportlab.lib.pagesizes import A4\nimport pypdf\nfrom PIL import Image'), ['reportlab', 'pypdf', 'PIL']);
assert.deepEqual(importedLibs('import pandas as pd\nimport numpy as np, requests'), ['pandas', 'numpy', 'requests']);
assert.deepEqual(importedLibs('x = "import reportlab"'), [], 'only real import lines');
console.log('PASS: real IBANs/cards still blocked, look-alike codes allowed, imported Python libraries installed');
