import {useId,useMemo,useState} from 'react';
import {parseChart,type ChatChart as Spec} from '../lib/chart';
const colors=['#238bff','#f52b94','#ff8b18','#17ba83','#985bff','#f04d44','#16b8c7','#d7a700'];
const number=(v:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2,notation:Math.abs(v)>=10000?'compact':'standard'}).format(v);
export function ChatChart({raw}:{raw:string}){
 const chart=useMemo(()=>parseChart(raw),[raw]);
 if(!chart&&!raw.trim().endsWith('}'))return <div className="chat-chart-error" role="status">Preparing chart…</div>;
 if(!chart)return <div className="chat-chart-error" role="note">The chart data is incomplete or invalid. Ask the bot to resend the chart.</div>;
 return <Chart chart={chart}/>;
}
function Chart({chart:c}:{chart:Spec}){
 const id=useId(),[selected,setSelected]=useState('');
 const describe=(s:number,i:number)=>`${c.labels[i]} · ${c.series[s].name}: ${number(c.series[s].values[i])}${c.unit?' '+c.unit:''}`;
 const hit=(s:number,i:number)=>({tabIndex:0,role:'button' as const,'aria-label':describe(s,i),onClick:()=>setSelected(describe(s,i)),onFocus:()=>setSelected(describe(s,i)),onKeyDown:(e:React.KeyboardEvent<SVGElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(describe(s,i));}}});
 const values=c.series.flatMap(s=>s.values),low=Math.min(0,...values),high=Math.max(0,...values),range=high-low||1;
 const y=(v:number)=>240-(v-low)/range*200,x=(i:number)=>58+(i+.5)*550/c.labels.length,zero=y(0),stride=Math.ceil(c.labels.length/6);
 const ticks=Array.from({length:5},(_,i)=>low+range*i/4),total=c.series[0].values.reduce((a,b)=>a+b,0);let offset=0;
 return <figure className="chat-chart" aria-labelledby={id}>
  <figcaption id={id} dir="auto">{c.title}</figcaption>
  {c.type==='pie'?<svg className="chat-chart__pie" viewBox="0 0 280 245" role="group" aria-label={c.title}>
   {c.series[0].values.map((v,i)=>{const length=v/total*2*Math.PI*78,start=offset;offset+=length;return v>0?<circle key={i} cx="140" cy="118" r="78" fill="none" stroke={colors[i%colors.length]} strokeWidth="35" strokeDasharray={`${length} ${2*Math.PI*78-length}`} strokeDashoffset={-start} transform="rotate(-90 140 118)" {...hit(0,i)}><title>{describe(0,i)}</title></circle>:null;})}
   <text x="140" y="115" textAnchor="middle" className="chat-chart__total">{number(total)}</text><text x="140" y="139" textAnchor="middle">{c.unit??'Total'}</text>
  </svg>:<svg viewBox="0 0 640 292" role="group" aria-label={c.title}>
   {ticks.map((v,i)=><g key={i}><line x1="58" x2="608" y1={y(v)} y2={y(v)} className="chat-chart__grid"/><text x="49" y={y(v)+4} textAnchor="end">{number(v)}</text></g>)}
   {c.labels.map((label,i)=>(i%stride===0||i===c.labels.length-1)&&<text key={i} x={x(i)} y="269" textAnchor="middle"><title>{label}</title>{label.length>8?label.slice(0,7)+'…':label}</text>)}
   {c.series.map((s,j)=>c.type==='line'?<g key={j}><polyline points={s.values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')} fill="none" stroke={colors[j]} strokeWidth="3"/>{s.values.map((v,i)=><circle key={i} cx={x(i)} cy={y(v)} r="6" fill={colors[j]} {...hit(j,i)}><title>{describe(j,i)}</title></circle>)}</g>:<g key={j}>{s.values.map((v,i)=>{const width=550/c.labels.length*.7/c.series.length;return <rect key={i} x={x(i)-550/c.labels.length*.35+j*width} y={Math.min(zero,y(v))} width={Math.max(1,width-2)} height={Math.max(1,Math.abs(zero-y(v)))} rx="3" fill={colors[j]} {...hit(j,i)}><title>{describe(j,i)}</title></rect>;})}</g>)}
  </svg>}
  <div className="chat-chart__legend">{(c.type==='pie'?c.labels:c.series.map(s=>s.name)).map((label,i)=><span key={i}><i style={{background:colors[i%colors.length]}}/><span dir="auto">{label}</span>{c.type==='pie'&&<strong>{number(c.series[0].values[i]/total*100)}%</strong>}</span>)}</div>
  <div className="chat-chart__value" role="status" aria-live="polite" dir="auto">{selected||'Select a point to see its value'}</div>
  <details className="chat-chart__data"><summary>View data</summary><div className="md-table"><table><thead><tr><th>Category</th>{c.series.map((s,i)=><th key={i} dir="auto">{s.name}{c.unit?' ('+c.unit+')':''}</th>)}</tr></thead><tbody>{c.labels.map((label,i)=><tr key={i}><th dir="auto">{label}</th>{c.series.map((s,j)=><td key={j}>{number(s.values[i])}</td>)}</tr>)}</tbody></table></div></details>
 </figure>;
}
