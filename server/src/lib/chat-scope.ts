import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage<{botId:string;generation:number}>();
export const scopedGeneration=(botId:string,fallback:number):number=>{const value=scope.getStore();return value?.botId===botId?value.generation:fallback;};
export function inChat<T>(botId:string,generation:number,run:()=>T):T{return scope.run({botId,generation},run);}
