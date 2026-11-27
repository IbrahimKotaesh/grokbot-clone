import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {Hono} from 'hono';

// Public desktop downloads: the landing page offers them before sign-in, and the Mac app updates itself from /mac.
// desktop/macos/package.sh writes the Mac zip, the "Badr for Windows" GitHub workflow writes the Windows installer;
// both land in web/public/downloads (committed, so the deployed server has them). FINO_MAC_DOWNLOAD can point elsewhere.
const root=path.resolve(new URL('.', import.meta.url).pathname,'../..');
const pub=(f:string)=>path.join(root,'web/public/downloads',f);
const first=(list:(string|undefined)[])=>list.find((p):p is string=>!!p&&fs.existsSync(p))??'';
const macZip=()=>first([process.env.FINO_MAC_DOWNLOAD,path.join(root,'desktop/macos/dist/Badr-mac.zip'),pub('Badr-mac.zip'),path.join(root,'desktop/macos/dist/Fino-mac.zip'),pub('Fino-mac.zip')]);
const winExe=()=>first([process.env.BADR_WINDOWS_DOWNLOAD,pub('Badr-windows-setup.exe')]);

export const downloadApi=new Hono();
// Version details written next to each file; the Mac app compares `build` to update itself.
const meta=(file:string):{version?:string;build?:string;notarized?:boolean;sha256?:string}=>{try{return JSON.parse(fs.readFileSync(file.replace(/(-setup)?\.(zip|exe)$/,'.json'),'utf8'));}catch{return {};}};
const info=(file:string)=>{const s=fs.statSync(file),m=meta(file);return {available:true,bytes:s.size,updatedAt:s.mtimeMs,version:m.version??null,build:m.build??null,notarized:!!m.notarized,sha256:m.sha256??null};};

downloadApi.get('/mac/info',c=>{try{return c.json(info(macZip()));}catch{return c.json({available:false});}});
downloadApi.get('/windows/info',c=>{try{return c.json(info(winExe()));}catch{return c.json({available:false});}});

const serve=(file:string,type:string,name:string,missing:string)=>(c:any)=>{
 const f=file==='mac'?macZip():winExe();
 let size:number;
 try{size=fs.statSync(f).size;}catch{return c.json({error:missing},404);}
 c.header('Content-Type',type);
 c.header('Content-Length',String(size));
 c.header('Content-Disposition',`attachment; filename="${name}"`);
 if(c.req.method==='HEAD')return c.body(null);
 return c.body(Readable.toWeb(fs.createReadStream(f)) as ReadableStream);
};
downloadApi.get('/mac',serve('mac','application/zip','Badr-mac.zip','The Mac app is not available yet.'));
downloadApi.get('/windows',serve('windows','application/vnd.microsoft.portable-executable','Badr-Setup.exe','The Windows app is not available yet.'));
