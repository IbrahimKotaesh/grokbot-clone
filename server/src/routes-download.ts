import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {Hono} from 'hono';

// The public "Download for Mac" file (also what the Mac app updates itself from). desktop/macos/package.sh writes it to the local build folder and to
// web/public/downloads (committed, so the deployed server has it too). FINO_MAC_DOWNLOAD can point elsewhere.
const root=path.resolve(new URL('.', import.meta.url).pathname,'../..');
const macZip=()=>[process.env.FINO_MAC_DOWNLOAD,path.join(root,'desktop/macos/dist/Fino-mac.zip'),path.join(root,'web/public/downloads/Fino-mac.zip')]
 .find((p):p is string=>!!p&&fs.existsSync(p))??'';

export const downloadApi=new Hono();
// Version details written by package.sh next to the zip; the Mac app compares `build` to update itself.
const macMeta=(zip:string):{version?:string;build?:string;notarized?:boolean}=>{try{return JSON.parse(fs.readFileSync(zip.replace(/\.zip$/,'.json'),'utf8'));}catch{return {};}};
downloadApi.get('/mac/info',c=>{
 try{const zip=macZip(),s=fs.statSync(zip),m=macMeta(zip);return c.json({available:true,bytes:s.size,updatedAt:s.mtimeMs,version:m.version??null,build:m.build??null,notarized:!!m.notarized});}
 catch{return c.json({available:false});}
});
downloadApi.get('/mac',c=>{
 let size:number;
 try{size=fs.statSync(macZip()).size;}catch{return c.json({error:'The Mac app is not available yet.'},404);}
 c.header('Content-Type','application/zip');
 c.header('Content-Length',String(size));
 c.header('Content-Disposition','attachment; filename="Fino-mac.zip"');
 if(c.req.method==='HEAD')return c.body(null);
 return c.body(Readable.toWeb(fs.createReadStream(macZip())) as ReadableStream);
});
