const valid=p=>['GK','DF','MF','FW'].includes(p);
export function positionTimeline(snapshots,name,end){
 const rows=snapshots.filter(r=>r.target_type==='PLAYER'&&r.target_name===name&&valid(r.position)&&Number.isFinite(Number(r.match_time))).sort((a,b)=>Number(a.match_time)-Number(b.match_time)||Number(a.snapshot_id)-Number(b.snapshot_id));
 const intervals=[];for(const row of rows){const time=Math.max(0,Math.min(end,Number(row.match_time)));const previous=intervals.at(-1);if(previous?.position===row.position)continue;if(previous)previous.end=time;intervals.push({position:row.position,start:time,end});}
 const kept=intervals.filter(r=>r.end>r.start),durations=new Map();for(const r of kept)durations.set(r.position,(durations.get(r.position)||0)+r.end-r.start);
 const order=[...durations.keys()],countPosition=order.reduce((best,p)=>!best||durations.get(p)>durations.get(best)?p:best,null);
 return{intervals:kept,initialPosition:kept[0]?.position||null,countPosition,positionLabel:kept.map(r=>r.position).filter((p,i,a)=>i===0||p!==a[i-1]).join('→'),seconds:Object.fromEntries(durations),totalSeconds:[...durations.values()].reduce((a,b)=>a+b,0)};
}
export const inIntervals=(time,intervals)=>intervals.some(s=>Number(time)>=s.start&&Number(time)<s.end);
export function positionAt(timeline,time){return timeline.intervals.find(s=>Number(time)>=s.start&&Number(time)<s.end)?.position||null;}
// Merge additive statistics. Means, ratios, and ratings require weights rather than addition.
export function combinePositionStats(parts){
 if(!parts.length)return{};if(parts.length===1)return structuredClone(parts[0].stats);
 const combine=(values,key='')=>{const known=values.filter(v=>v!=null);if(!known.length)return null;if(known.every(v=>typeof v==='number'))return known.reduce((a,b)=>a+b,0);if(Array.isArray(known[0])){if(known[0].every(v=>typeof v==='number'))return known[0].map((_,i)=>known.reduce((s,a)=>s+(a[i]||0),0));return known.flat();}if(typeof known[0]==='object'){const result={};for(const k of new Set(known.flatMap(Object.keys)))result[k]=combine(known.map(v=>v[k]),k);return result;}return known[0];};
 const out=combine(parts.map(p=>p.stats));let weight=0,rx=0;for(const p of parts)if(Number.isFinite(p.stats?.rating?.value)){weight+=p.seconds;rx+=p.stats.rating.value*p.seconds;}out.rating={value:weight?Math.round(rx/weight*100)/100:null,revision:'position-duration-weighted',provisional:true};
 const weighted=path=>{const vs=parts.map(p=>({v:path.split('.').reduce((v,k)=>v?.[k],p.stats.rating),w:p.seconds})).filter(p=>Number.isFinite(p.v));const n=vs.reduce((s,p)=>s+p.w,0);return n?Number((vs.reduce((s,p)=>s+p.v*p.w,0)/n).toFixed(4)):null;};
 for(const k of ['base','ball','positioning','result','ballRaw'])out.rating[k]=weighted(k);
 out.rating.categories=Object.fromEntries([...new Set(parts.flatMap(p=>Object.keys(p.stats.rating?.categories||{})))].map(k=>[k,weighted('categories.'+k)]));
 if(parts.every(p=>Number.isFinite(p.stats.rating?.ball)&&Number.isFinite(p.stats.rating?.positioning)&&Number.isFinite(p.stats.rating?.result))){
  const sum=key=>Number(parts.reduce((s,p)=>s+(p.stats.rating[key]||0),0).toFixed(4));
  for(const key of ['ball','positioning','result','ballRaw'])out.rating[key]=sum(key);
  out.rating.base=6;out.rating.value=Number(Math.max(5.3,Math.min(8.8,6+out.rating.ball+out.rating.positioning+out.rating.result)).toFixed(2));out.rating.revision='position-actions-summed-results-prorated';
  for(const key of Object.keys(out.rating.categories))out.rating.categories[key]=Number(parts.reduce((s,p)=>s+(p.stats.rating.categories?.[key]||0),0).toFixed(4));
 }
 out.rating.context={situation:{details:parts.flatMap(p=>(p.stats.rating?.context?.situation?.details||[]).map(d=>({...d,position:p.position})))}};
 const positions=parts.filter(p=>p.stats.averagePosition?.samples);if(positions.length){const n=positions.reduce((s,p)=>s+p.stats.averagePosition.samples,0);out.averagePosition={samples:n};for(const k of ['x','z','normalizedX','normalizedZ','attackingNormalizedX','attackingNormalizedY']){const vs=positions.filter(p=>Number.isFinite(p.stats.averagePosition[k]));out.averagePosition[k]=vs.length?vs.reduce((s,p)=>s+p.stats.averagePosition[k]*p.stats.averagePosition.samples,0)/vs.reduce((s,p)=>s+p.stats.averagePosition.samples,0):null;}}
 if(out.chances)out.chances.averageScore=out.chances.shots?out.chances.totalScore/out.chances.shots:0;
 if(out.positionHeatmap){out.positionHeatmap.cols=parts[0].stats.positionHeatmap?.cols;out.positionHeatmap.rows=parts[0].stats.positionHeatmap?.rows;}
 if(out.fieldHeatmap){out.fieldHeatmap.cols=parts[0].stats.fieldHeatmap?.cols;out.fieldHeatmap.rows=parts[0].stats.fieldHeatmap?.rows;}
 for(const k of ['scoreOrigins','concedeOrigins'])if(out[k])out[k].avgDistance=out[k].count?out[k].totalDistance/out[k].count:null;
 out.teamPossession=structuredClone(parts[0].stats.teamPossession||null);out.positionStyle=null;
 return out;
}
export function selectPositionAppearance(p,selected){
 const parts=p.stats?.positionStats;if(!parts?.length)return selected.has(p.position)?{...p,appearanceCount:1}:null;
 const kept=parts.filter(s=>selected.has(s.position));if(!kept.length)return null;
 return{...p,stats:kept.length===parts.length?p.stats:{...combinePositionStats(kept),positionStats:kept},appearanceCount:selected.has(p.countPosition||p.position)?1:0,positionLabel:p.positionLabel||p.stats.positionLabel};
}
