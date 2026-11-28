import { t } from '../lib/i18n';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
type Photo={id:string;url:string;name:string};

export function MessagePhotos({images}:{images:Photo[]}){
 const [selected,setSelected]=useState<Photo|null>(null),dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  if(!selected||!dialog.current)return;
  const element=dialog.current,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';element.showModal();
  return()=>{if(element.open)element.close();document.body.style.overflow=overflow;previous?.focus();};
 },[selected]);
 return <><div className={`message-photos${images.length>1?' is-many':''}`}>{images.map(image=><button type="button" key={image.id} className="message-photos__open" aria-label={`Enlarge ${image.name}`} onClick={()=>setSelected(image)}><img src={image.url} alt={image.name} loading="lazy" onLoad={e=>e.currentTarget.classList.add('is-loaded')} ref={el=>{if(el?.complete&&el.naturalWidth)el.classList.add('is-loaded');}}/></button>)}</div>
 {selected&&createPortal(<dialog ref={dialog} className="photo-viewer" aria-label={`Image preview: ${selected.name}`} onClose={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)setSelected(null);}}>
  <button type="button" className="photo-viewer__close" aria-label={t("Close image preview")} autoFocus onClick={()=>setSelected(null)}><X size={25}/></button>
  <figure><img src={selected.url} alt={selected.name}/><figcaption dir="auto">{selected.name}</figcaption></figure>
 </dialog>,document.body)}</>;
}
