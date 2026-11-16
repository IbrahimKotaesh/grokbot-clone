export interface AlertItem{id:string;botId:string|null;kind:string;title:string;body:string;createdAt:number;readAt:number|null}
export async function pushRequest<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch('/api/push'+path,{method,credentials:'include',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error??'Notifications are unavailable.');return data;
}
export function pushSupport(){
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone;
 return {needsInstall:ios&&!standalone,supported:'Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator&&isSecureContext};
}
export async function currentPush(){
 if(!pushSupport().supported)return null;
 const registration=await navigator.serviceWorker.getRegistration();return registration?registration.pushManager.getSubscription():null;
}
export async function enableDevicePush(){
 const support=pushSupport();if(support.needsInstall)throw Error('Add Fino to your iPhone Home Screen, open its icon, then enable notifications.');
 if(!support.supported)throw Error('This browser cannot receive push. Open Fino in Safari, Chrome, Edge or Firefox.');
 // Request permission directly from the click gesture, before fetching configuration.
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 if(permission!=='granted')throw Error('Notifications are blocked. Allow Fino in your browser notification settings.');
 const {publicKey}=await pushRequest<{publicKey:string}>('/config');
 const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('Refresh Fino, then try enabling notifications again.')),10000))]);
 const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)key[i]=raw.charCodeAt(i);
 const subscription=await registration.pushManager.getSubscription()??await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 await pushRequest('/device','POST',{subscription:subscription.toJSON()});return subscription;
}
export async function disableDevicePush(){
 const subscription=await currentPush();if(!subscription)return;
 try{await pushRequest('/device','DELETE',{endpoint:subscription.endpoint});}finally{await subscription.unsubscribe();}
}
