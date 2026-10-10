export const fieldKey=f=>f?.corner1&&f?.corner2?JSON.stringify([Math.min(f.corner1.x,f.corner2.x),Math.max(f.corner1.x,f.corner2.x),Math.min(f.corner1.z,f.corner2.z),Math.max(f.corner1.z,f.corner2.z)]):'';
export function duelSummary(matches,{position='all',field='all'}={}){
 const events=[];for(const m of matches){if(field!=='all'&&fieldKey(m.field)!==field)continue;const seen=new Set();for(const e of m.events||[]){if(!['TACKLE','DRIBBLE'].includes(e.type)||e.result==='REJECTED'||(e.id!=null&&seen.has(e.id)))continue;if(e.id!=null)seen.add(e.id);if(position!=='all'&&e.position!==position)continue;events.push({...e,gameId:m.gameId,field:m.field});}}
 const summarize=rows=>({attempts:rows.length,success:rows.filter(e=>e.type==='TACKLE'?e.result==='WON':e.result==='SUCCESS').length,games:new Set(rows.map(e=>e.gameId)).size});
 const totals=Object.fromEntries(['TACKLE','DRIBBLE'].map(t=>[t,summarize(events.filter(e=>e.type===t))]));
 const tackles=events.filter(e=>e.type==='TACKLE'),positions=['GK','DF','MF','FW','unknown'].map(pos=>({name:pos,...summarize(tackles.filter(e=>(['GK','DF','MF','FW'].includes(e.position)?e.position:'unknown')===pos))}));
 const cells=Array.from({length:18},(_,i)=>({index:i,events:[]}));let positioned=0,unknownDirection=0;
 for(const e of tackles){const k=fieldKey(e.field);if(!k||!Number.isFinite(e.start?.x)||!Number.isFinite(e.start?.z))continue;const [x0,x1,z0,z1]=JSON.parse(k);if(x1<=x0||z1<=z0)continue;let x=(e.start.x-x0)/(x1-x0),z=(e.start.z-z0)/(z1-z0);if(x<0||x>1||z<0||z>1)continue;if(![1,-1].includes(e.attackDirection)){unknownDirection++;continue;}if(e.attackDirection===-1){x=1-x;z=1-z;}cells[Math.min(2,Math.floor(z*3))*6+Math.min(5,Math.floor(x*6))].events.push(e);positioned++;}
 return {totals,positions,cells:cells.map(c=>({index:c.index,...summarize(c.events)})),positioned,unknownDirection,missing:tackles.length-positioned-unknownDirection};
}
