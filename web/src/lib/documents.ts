export interface DocumentUpload {name:string;dataUrl:string;size:number}
export const DOCUMENT_ACCEPT='.pdf,.docx,.xlsx,.txt,.md,.csv,.tsv,.json,.log,.yaml,.yml,.xml,.html,.css,.js,.ts,.py';
export async function prepareDocument(file:File):Promise<DocumentUpload>{
 if(!file.size||file.size>10*1024*1024)throw Error('Choose a file under 10 MB.');
 const ext=file.name.split('.').pop()?.toLowerCase();if(!ext||!DOCUMENT_ACCEPT.split(',').includes('.'+ext))throw Error('Choose PDF, DOCX, XLSX, CSV, JSON or a UTF-8 text file.');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Could not read this file. Please choose it again.'));reader.readAsDataURL(file);});
 return {name:file.name,dataUrl,size:file.size};
}
