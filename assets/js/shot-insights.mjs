import {fieldKey} from './duel-insights.mjs?v=20261010direction';
export const shotKinds={dribble:{label:'ドリブル → シュート',color:'#cc79a7',shape:'circle'},pass:{label:'パス → シュート',color:'#56b4e9',shape:'triangle'},regain:{label:'ボール奪取 → シュート',color:'#e69f00',shape:'square'},other:{label:'その他・判定不明',color:'#f0e442',shape:'diamond'}};
export function shotSummary(matches,{field='all',position='all',show='all'}={}){
 const shots=[];let missingPosition=0,missingDirection=0;
 for(const m of matches){if(field!=='all'&&fieldKey(m.field)!==field)continue;const seen=new Set();for(const e of m.events||[]){if(e.type!=='SHOT'||!['GOAL','SAVED','OFF_TARGET','BLOCKED','WOODWORK'].includes(e.result)||(e.id!=null&&seen.has(e.id)))continue;if(e.id!=null)seen.add(e.id);if(position!=='all'&&e.position!==position)continue;
 const kind=Object.hasOwn(shotKinds,e.shotBuildUp?.kind)?e.shotBuildUp.kind:'other',goal=e.result==='GOAL';if(show==='goals'&&!goal||Object.hasOwn(shotKinds,show)&&(!goal||show!==kind))continue;
 let point=null;const f=m.field,k=fieldKey(f);if(k&&Number.isFinite(e.start?.x)&&Number.isFinite(e.start?.z)){const [x0,x1,z0,z1]=JSON.parse(k);let x=(e.start.x-x0)/(x1-x0),z=(e.start.z-z0)/(z1-z0);if(x1>x0&&z1>z0&&x>=0&&x<=1&&z>=0&&z<=1){if([1,-1].includes(e.attackDirection)){if(e.attackDirection===-1){x=1-x;z=1-z;}point={x,z};}else missingDirection++;}else missingPosition++;}else missingPosition++;
 const length=f?Math.abs(f.corner2.x-f.corner1.x):null,width=f?Math.abs(f.corner2.z-f.corner1.z):null;
 const distance=point?Math.hypot((1-point.x)*length,(point.z-.5)*width):null;
 shots.push({player:e.player,distance,length,width,fieldKey:k,id:e.id,gameId:m.gameId,time:e.time,goal,result:e.result,kind,point,assisted:!!e.assistPlayer});
 }}return{shots,goals:shots.filter(s=>s.goal).length,positioned:shots.filter(s=>s.point).length,missingPosition,missingDirection,kinds:Object.fromEntries(Object.keys(shotKinds).map(k=>[k,shots.filter(s=>s.goal&&s.kind===k).length]))};
}

export const shotResultLabels={GOAL:'ゴール',SAVED:'枠内・セーブ',OFF_TARGET:'枠外',BLOCKED:'ブロック',WOODWORK:'ポスト・バー'};
export function shotRates(shots){
 const row=(label,a)=>({label,shots:a.length,goals:a.filter(s=>s.goal).length,rate:a.length?a.filter(s=>s.goal).length/a.length:null});
 return {distance:[[0,10,'10未満'],[10,20,'10〜20未満'],[20,30,'20〜30未満'],[30,Infinity,'30以上']].map(([lo,hi,l])=>row(l,shots.filter(s=>Number.isFinite(s.distance)&&s.distance>=lo&&s.distance<hi))),unknownDistance:shots.filter(s=>!Number.isFinite(s.distance)).length,kinds:Object.entries(shotKinds).map(([k,v])=>row(v.label,shots.filter(s=>s.kind===k))),zones:Array.from({length:18},(_,i)=>({...row(String(i),shots.filter(s=>s.point&&Math.min(5,Math.floor(s.point.x*6))+Math.min(2,Math.floor(s.point.z*3))*6===i)),index:i})),results:Object.entries(shotResultLabels).map(([k,l])=>row(l,shots.filter(s=>k==='UNKNOWN'?!Object.hasOwn(shotResultLabels,s.result)||s.result==='UNKNOWN':s.result===k)))};
}
