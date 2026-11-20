export type ChatChart={type:'bar'|'line'|'pie';title:string;labels:string[];series:{name:string;values:number[]}[];unit?:string};
/** Model output is data only: never HTML, scripts, URLs or chart-library options. */
export function parseChart(raw:string):ChatChart|null{
 if(raw.length>24000)return null;
 try{
  const c=JSON.parse(raw);
  if(!c||!['bar','line','pie'].includes(c.type)||typeof c.title!=='string'||!c.title.trim()||c.title.length>120||!Array.isArray(c.labels)||!c.labels.length||c.labels.length>24||!c.labels.every((s:unknown)=>typeof s==='string'&&s.length>0&&s.length<=60)||!Array.isArray(c.series)||!c.series.length||c.series.length>3)return null;
  if(c.unit!==undefined&&(typeof c.unit!=='string'||c.unit.length>20))return null;
  if(!c.series.every((s:any)=>s&&typeof s.name==='string'&&s.name.length<=60&&Array.isArray(s.values)&&s.values.length===c.labels.length&&s.values.every((v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12)))return null;
  if(c.type==='pie'&&(c.series.length!==1||c.labels.length>12||c.series[0].values.some((v:number)=>v<0)||!c.series[0].values.some((v:number)=>v>0)))return null;
  return {type:c.type,title:c.title,labels:c.labels,series:c.series.map((s:any)=>({name:s.name,values:s.values})),unit:c.unit};
 }catch{return null;}
}
