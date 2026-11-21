import {rolldown} from 'rolldown';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
/** Same bundler as Vite; avoids a separate esbuild service for small render tests. */
export async function build(options){
 const input=path.join(options.stdin.resolveDir,`.fino-test-${randomUUID()}.${options.stdin.loader??'tsx'}`);
 await fs.writeFile(input,options.stdin.contents);
 let bundle;
 try{bundle=await rolldown({input,platform:options.platform??'node',external:options.external,transform:{jsx:'react-jsx',define:options.define}});await bundle.write({file:options.outfile,format:options.format??'esm',codeSplitting:false});}
 finally{await bundle?.close();await fs.unlink(input);}
}
