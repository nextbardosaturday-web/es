const opposite=side=>side==='TEAM_WEST'?'TEAM_EAST':side==='TEAM_EAST'?'TEAM_WEST':null;
const isOwn=v=>v===true||v===1||v==='1'||v==='true';
// score_progress can use half-local seconds, while game_events uses absolute seconds.
// Match by half, clock and scorer (consuming each raw event once), never by array index.
export function scoreTimeline(events,scores=[],halfLength=300){
 const raw=events.filter(e=>['GOAL','OWN_GOAL'].includes(e.event_type)),used=new Set(),rows=[];
 let west=0,east=0;
 for(const s of scores){
  const w=Number(s.west_score),e=Number(s.east_score),dw=w-west,de=e-east;
  west=w;east=e;
  const side=dw===1&&de===0?'TEAM_WEST':de===1&&dw===0?'TEAM_EAST':null;
  if(!side)continue;
  const half=Number(s.half_no)||1,local=Number(s.half_time??s.match_time),abs=s.half_time!=null?(half-1)*halfLength+local:Number(s.match_time);
  const matches=raw.filter(r=>!used.has(r)&&Number(r.half_no||1)===half&&(r.half_time!=null?Number(r.half_time)===local:Number(r.match_time)===abs)&&(!s.scorer||!r.player_name||r.player_name===s.scorer));
  const ev=matches.find(r=>(r.event_type==='OWN_GOAL')===isOwn(s.own_goal))||matches[0];
  if(ev)used.add(ev);
  const own=isOwn(s.own_goal)||ev?.event_type==='OWN_GOAL';
  rows.push({...s,event:ev||null,absolute_match_time:ev?Number(ev.match_time):abs,ownGoal:own,scorer:s.scorer||ev?.player_name||null,assist:own?null:s.assist||null,teamSide:side,actorSide:own?opposite(side):side});
 }
 if(!scores.length)for(const ev of raw){
  const own=ev.event_type==='OWN_GOAL',side=own?opposite(ev.team_side):ev.team_side;
  if(!side)continue;if(side==='TEAM_WEST')west++;else east++;
  rows.push({event:ev,half_no:ev.half_no,half_time:ev.half_time,absolute_match_time:Number(ev.match_time),teamSide:side,actorSide:ev.team_side,scorer:ev.player_name,assist:null,ownGoal:own,west_score:west,east_score:east});
 }
 return rows;
}
export function ownGoalPlays(timeline){return timeline.filter(g=>g.ownGoal).map(g=>({
 id:g.event?'og-event-'+g.event.event_id:'og-score-'+g.score_id,type:'OWN_GOAL',result:'OWN_GOAL',
 matchTime:g.absolute_match_time,halfNo:Number(g.half_no)||1,halfTime:g.half_time,player:g.scorer,teamSide:g.teamSide,actorTeamSide:g.actorSide,
 sourceEventIds:g.event?[g.event.event_id]:[],flags:{ownGoal:true},evidence:{scoreId:g.score_id??null}
}));}
