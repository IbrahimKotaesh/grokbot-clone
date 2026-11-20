import {useSyncExternalStore} from 'react';
export type DesktopState={environment:'server'|'browser'|'mac';connected:boolean;panelOpen:boolean};
type NativeWindow=Window&{__finoDesktopState?:DesktopState;__FINO_DESKTOP__?:boolean;webkit?:{messageHandlers?:{finoUI?:{postMessage:(value:unknown)=>void}}}};
export const isMacDesktop=()=>typeof window!=='undefined'&&!!(window as NativeWindow).__FINO_DESKTOP__;
export const desktopState=()=>typeof window==='undefined'?null:(window as NativeWindow).__finoDesktopState??null;
const subscribe=(callback:()=>void)=>{window.addEventListener('fino-desktop-state',callback);return()=>window.removeEventListener('fino-desktop-state',callback);};
export const useDesktopState=()=>useSyncExternalStore(subscribe,desktopState,()=>null);
export function openDesktopComputer(botId?:string){const bridge=(window as NativeWindow).webkit?.messageHandlers?.finoUI;if(!isMacDesktop()||!bridge)return false;bridge.postMessage({action:'showComputer',botId});return true;}
export const executionEnvironment=()=>isMacDesktop()?{desktopEnvironment:desktopState()?.environment??'server'}:{};

export function notifyDesktopContext(botId?:string){if(isMacDesktop())(window as NativeWindow).webkit?.messageHandlers?.finoUI?.postMessage({action:'context',botId});}
