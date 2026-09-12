const key=r=>r.target_type==='BALL'?'BALL':String(r.target_name),order=r=>Number(r.snapshot_id)||0;
export function snapshotBatches(rows){const result=[];let batch=[],seen=new Set(),last=null;for(const row of [...rows].sort((a,b)=>order(a)-order(b))){const changed=last&&(row.event_type!==last.event_type||Number(row.match_time)!==Number(last.match_time)||(row.event_index!=null&&last.event_index!=null&&row.event_index!==last.event_index));if(batch.length&&(changed||seen.has(key(row)))){result.push(batch);batch=[];seen=new Set();}batch.push(row);seen.add(key(row));last=row;}if(batch.length)result.push(batch);return result;}
export function lineOutScenes(rows,events){
 const allBatches=snapshotBatches(rows);const scenes=new Map(),byTime=new Map();for(const row of rows){const t=Number(row.match_time);if(!byTime.has(t))byTime.set(t,[]);byTime.get(t).push(row);}
 for(const[t,rs]of byTime){const batches=snapshotBatches(rs),outs=events.filter(e=>Number(e.match_time)===t&&e.event_type==='BALL_OUT').sort((a,b)=>Number(a.event_id)-Number(b.event_id));let outIndex=0;
  for(let i=0;i<batches.length;i++){if(batches[i][0].event_type!=='BALL_OUT')continue;const event=outs[outIndex++];if(!event||event.event_x==null||event.event_z==null)continue;
   const preceding=batches.slice(0,i).filter(b=>!['INTERVAL','GOAL','ASSIST','BALL_OUT'].includes(b[0].event_type));const earlier=allBatches.filter(b=>order(b[0])<order(batches[i][0])&&!['INTERVAL','GOAL','ASSIST','BALL_OUT'].includes(b[0].event_type));const start=preceding.at(-1)||earlier.at(-1);if(!start)continue;const ball=start.find(r=>r.target_type==='BALL');if(!ball)continue;
   const end=start.map(r=>r===ball?{...r,x:Number(event.event_x),y:Number(event.event_y??r.y),z:Number(event.event_z),event_type:'BALL_OUT'}:{...r});
   if(!scenes.has(t))scenes.set(t,[]);scenes.get(t).push({start,end,event});
  }
 }return scenes;
}
