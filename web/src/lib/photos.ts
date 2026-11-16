export interface Photo { name: string; dataUrl: string }
export async function preparePhoto(file: File): Promise<Photo> {
  if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
  const url=URL.createObjectURL(file);
  try {
    const image=new Image(); image.src=url;
    try { await image.decode(); } catch { throw new Error('This image format could not be opened. Try JPEG, PNG or WebP.'); }
    const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx) throw new Error('Could not prepare this photo.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const dataUrl=canvas.toDataURL('image/jpeg',0.9);
    if(dataUrl.length>4*1024*1024) throw new Error('This photo is too large. Choose a smaller image.');
    return {name:file.name.slice(0,120)||'Photo',dataUrl};
  } finally { URL.revokeObjectURL(url); }
}
