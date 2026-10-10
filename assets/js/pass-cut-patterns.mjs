export function passCutPatterns(matches){
 const lists={distance:new Map(),direction:new Map(),zone:new Map(),position:new Map(),combined:new Map()},unknown={distance:0,direction:0,zone:0,position:0,combined:0};let total=0;
 const add=(kind,label,game)=>{if(!label){unknown[kind]++;return;}const rows=lists[kind],r=rows.get(label)||{label,count:0,games:new Set()};r.count++;r.games.add(game);rows.set(label,r);};
 const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
 for(const m of matches){const seen=new Set();for(const e of m.events||[]){if(e.type!=='PASS'||e.result!=='FAILED'||!e.cut||(e.id!=null&&seen.has(e.id)))continue;if(e.id!=null)seen.add(e.id);total++;
 let distance=null,direction=null,zone=null;const cp=e.cut.point;
 if(point(e.start)&&point(cp)){const d=Math.hypot(cp.x-e.start.x,cp.z-e.start.z);distance=d<10?'10m未満':d<25?'10〜25m未満':'25m以上';if([1,-1].includes(e.attackDirection)){const dx=(cp.x-e.start.x)*e.attackDirection;direction=dx>2?'前進':dx< -2?'戻し':'横方向（前後2m以内）';}}
 const f=m.field;if(point(cp)&&f?.corner1&&f?.corner2&&[1,-1].includes(e.cut.attackDirection)){const x0=Math.min(f.corner1.x,f.corner2.x),z0=Math.min(f.corner1.z,f.corner2.z),w=Math.abs(f.corner1.x-f.corner2.x),h=Math.abs(f.corner1.z-f.corner2.z);let x=(cp.x-x0)/w,z=(cp.z-z0)/h;if(w>0&&h>0&&x>=0&&x<=1&&z>=0&&z<=1){if(e.cut.attackDirection===-1){x=1-x;z=1-z;}zone=(x<1/3?'自陣側':x<2/3?'中盤':'敵陣側')+'・'+(z<1/3?'サイドA':z<2/3?'中央':'サイドB');}}
 const position=['GK','DF','MF','FW'].includes(e.cut.position)?e.cut.position:null;add('distance',distance,m.gameId);add('direction',direction,m.gameId);add('zone',zone,m.gameId);add('position',position,m.gameId);add('combined',distance&&direction&&zone?direction+' / '+distance+' / '+zone:null,m.gameId);
 }}return {total,unknown,...Object.fromEntries(Object.entries(lists).map(([k,rows])=>[k,[...rows.values()].map(r=>({...r,games:r.games.size})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label)).slice(0,5)]))};
}
