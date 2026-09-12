import {snapshotBatches,lineOutScenes} from "./replay-boundaries.mjs";
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const gameId = params.get("id") || "2026080101";
const base = `data/matches/${encodeURIComponent(gameId)}`;

const state = {
  time: 0, playing: false, lastFrame: 0, speed: 1,
  duration: 1, matchDuration: 1,
  frames: new Map(), eventFrames: new Map(), intervalFrames: new Map(), intervalBatchCounts: new Map(),
  timeline: [], matchToVirtual: new Map(), events: [], scores: [], goals: [], nodes: new Map(), field: null, ballGenerations: [],
  playerTracking: new Map(), selectedSpatialPlayers: new Set(), heatmapEnabled: false, averageEnabled: false,
  momentum: [], momentumMaxAbs: 1, momentumCursor: null, directContacts: new Map(), snapshotRows: [], outScenes: new Map()
};

const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};
async function json(name){ const r=await fetch(`${base}/${name}`); if(!r.ok) throw new Error(`${name}: HTTP ${r.status}`); return r.json(); }
const pct=(v,min,max)=>((v-min)/(max-min))*100;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const order=(r)=>Number(r.snapshot_id)||0;
const key=(r)=>String(r.target_type).toUpperCase()==="BALL"?"__ACTIVE_BALL__":String(r.target_name);
function buildBallGenerations(rows){
  const first=new Map();
  for(const r of rows){
    if(String(r.target_type).toUpperCase()!=="BALL") continue;
    const name=String(r.target_name), marker={time:Number(r.match_time)||0,order:order(r)};
    const cur=first.get(name);
    if(!cur||marker.time<cur.time||(marker.time===cur.time&&marker.order<cur.order)) first.set(name,marker);
  }
  state.ballGenerations=[...first.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>(a.time-b.time)||(a.order-b.order));
}
function activeBallNameAt(time,maxOrder=Infinity){
  let active=null;
  for(const g of state.ballGenerations){
    if(g.time<time||(g.time===time&&g.order<=maxOrder)) active=g.name; else break;
  }
  return active;
}
function latestByTarget(rows){
  const m=new Map();
  const maxOrder=rows.length?Math.max(...rows.map(order)):Infinity;
  const time=rows.length?Number(rows[0].match_time)||0:0;
  const activeBall=activeBallNameAt(time,maxOrder);
  for(const r of rows){
    if(String(r.target_type).toUpperCase()==="BALL"&&String(r.target_name)!==activeBall) continue;
    const k=key(r),c=m.get(k); if(!c||order(r)>order(c))m.set(k,r);
  }
  return m;
}

function drawField(raw){
  const d=raw?.definition||raw||{}, f=d.field||{}, c1=f.corner1,c2=f.corner2;
  if(!c1||!c2) throw new Error("field.jsonにcorner1/corner2がありません");
  const b={minX:Math.min(c1.x,c2.x),maxX:Math.max(c1.x,c2.x),minZ:Math.min(c1.z,c2.z),maxZ:Math.max(c1.z,c2.z)};
  state.field={...b,centerX:Number(f.center.x),centerZ:Number(f.center.z),baseY:Number(f.y),goals:d.goals||{}};
  const el=$("field");
  el.innerHTML='<div id="heatmapLayer" class="heatmap-layer"></div><div id="averageLayer" class="average-layer"></div><div class="center-line"></div><svg id="goalTrajectory" class="goal-trajectory" viewBox="0 0 1000 660" preserveAspectRatio="none" hidden aria-hidden="true"><polyline id="goalTrajectoryLine" points=""></polyline><polygon id="goalTrajectoryArrow" points=""></polygon><text id="goalTrajectoryDistance" x="0" y="0"></text></svg><div id="goalShotPoint" class="goal-shot-point" hidden></div><div id="goalLinePoint" class="goal-line-point" hidden></div><div id="intervalCue" class="interval-cue" hidden></div>';
  const radius=f["center-circle-radius"]||9, cx=pct(f.center.x,b.minX,b.maxX), cz=pct(f.center.z,b.minZ,b.maxZ);
  const circle=document.createElement("div"); circle.className="center-circle"; circle.style.left=`${cx}%`; circle.style.top=`${cz}%`; circle.style.width=`${radius*2/(b.maxX-b.minX)*100}%`; circle.style.aspectRatio="1"; el.append(circle);
  for(const side of ["west","east"]){
    const pa=d["penalty-areas"]?.[side];
    if(pa){const box=document.createElement("div");box.className="line";box.style.left=`${pct(pa.origin.x,b.minX,b.maxX)}%`;box.style.top=`${pct(pa.origin.z,b.minZ,b.maxZ)}%`;box.style.width=`${pa.dx/(b.maxX-b.minX)*100}%`;box.style.height=`${pa.dz/(b.maxZ-b.minZ)*100}%`;el.append(box);}
    const gd=d.goals?.[side];
    if(gd){
      const g=document.createElement("div");g.className="goal";g.style.left=`${pct(gd.origin.x,b.minX,b.maxX)}%`;g.style.top=`${pct(gd.origin.z,b.minZ,b.maxZ)}%`;g.style.width=`${Math.max(.45,gd.dx/(b.maxX-b.minX)*100)}%`;g.style.height=`${gd.dz/(b.maxZ-b.minZ)*100}%`;el.append(g);
      const mouth=document.createElement("div");mouth.className=`goal-mouth-field goal-mouth-field-${side}`;mouth.style.left=`${pct(side==="west"?b.minX:b.maxX,b.minX,b.maxX)}%`;mouth.style.top=`${pct(gd.origin.z,b.minZ,b.maxZ)}%`;mouth.style.height=`${gd.dz/(b.maxZ-b.minZ)*100}%`;mouth.title=`ゴール幅 ${Number(gd.dz).toFixed(1)} m`;el.append(mouth);
      for(const z of [Number(gd.origin.z),Number(gd.origin.z)+Number(gd.dz)]){const post=document.createElement("div");post.className="goal-post";post.style.left=`${pct(side==="west"?b.minX:b.maxX,b.minX,b.maxX)}%`;post.style.top=`${pct(z,b.minZ,b.maxZ)}%`;el.append(post);}
    }
  }
}

const RESTART_KICK_TYPES=new Set(["KICKOFF_KICK","THROW_IN_KICK","POWER_KICK","DIRECT_KICK","AUTO_PASS","CORNER_KICK","GOAL_KICK"]);
const RESTART_TRANSITION_SEC=0.45;
const DIRECT_GOAL_FLIGHT_SEC=0.45;
function restartFrameAt(t){
  for(const type of RESTART_KICK_TYPES){
    const f=state.eventFrames.get(`${t}|${type}`);
    if(f&&f.size) return f;
  }
  const rows=state.frames.get(t);
  if(!rows) return null;
  const restart=[...rows.values()].filter(r=>RESTART_KICK_TYPES.has(String(r.event_type||"").toUpperCase()));
  return restart.length?latestByTarget(restart):null;
}


const DIRECT_EVENT_TYPES=new Set(["DIRECT_KICK","DIRECT_SHOT"]);
const GOAL_ORIGIN_TYPES=new Set(["DIRECT_SHOT","SHOT","DIRECT_KICK","POWER_KICK"]);
function directEventAt(t){
  return state.events.find(e=>Number(e.match_time)===Number(t)&&DIRECT_EVENT_TYPES.has(String(e.event_type||"").toUpperCase()))||null;
}
function closestContactForEvent(event){
  const t=Number(event?.match_time)||0;
  const type=String(event?.event_type||"").toUpperCase();
  const playerName=String(event?.player_name||event?.target_name||"");

  // DIRECT_KICK / DIRECT_SHOT のイベントスナップショットは、
  // ボールがキッカーへ到達して接触した瞬間を記録している。
  // 通常フレームや前後秒を候補に混ぜると、パス途中の中間位置を
  // 「接触点」と誤認するため、まず完全一致のイベントフレームだけを見る。
  const exactFrames=[];
  const exact=state.eventFrames.get(`${t}|${type}`);
  if(exact) exactFrames.push(exact);

  // 同一秒・同種イベントが複数ある場合に備え、元スナップショットを
  // event_index 単位で分け、キッカーとボールが最も近いグループを選ぶ。
  for(const batch of snapshotBatches((state.snapshotRows||[]).filter(r=>Number(r.match_time)===t&&String(r.event_type).toUpperCase()===type)))exactFrames.push(latestByTarget(batch));

  let best=null;
  for(const frame of exactFrames){
    const rows=[...frame.values()];
    const ball=rows.find(r=>String(r.target_type).toUpperCase()==="BALL");
    const player=rows.find(r=>String(r.target_type).toUpperCase()==="PLAYER"&&String(r.target_name)===playerName);
    if(!ball||!player) continue;
    const distance=Math.hypot(Number(ball.x)-Number(player.x),Number(ball.z)-Number(player.z));
    if(!Number.isFinite(distance)) continue;
    if(!best||distance<best.distance) best={event,time:t,distance,frame,ball,player};
  }
  if(best) return best;

  // 古いログなどでイベント専用スナップショットが欠けている場合のみ、
  // 同秒の通常フレームへフォールバックする。前後秒は採用しない。
  const fallback=state.frames.get(t);
  if(!fallback) return null;
  const rows=[...fallback.values()];
  const ball=rows.find(r=>String(r.target_type).toUpperCase()==="BALL");
  const player=rows.find(r=>String(r.target_type).toUpperCase()==="PLAYER"&&String(r.target_name)===playerName);
  if(!ball||!player) return null;
  const distance=Math.hypot(Number(ball.x)-Number(player.x),Number(ball.z)-Number(player.z));
  return Number.isFinite(distance)?{event,time:t,distance,frame:fallback,ball,player}:null;
}
function buildDirectContacts(){
  state.directContacts=new Map();
  for(const event of state.events){
    if(!DIRECT_EVENT_TYPES.has(String(event.event_type||"").toUpperCase())) continue;
    const contact=closestContactForEvent(event);
    if(contact&&!state.directContacts.has(Number(event.match_time)||0)) state.directContacts.set(Number(event.match_time)||0,contact);
  }
}
function playbackFrameAt(t){
  return state.directContacts.get(Number(t))?.frame||state.frames.get(Number(t));
}


function buildPlayerTracking(rows){
  const latest=new Map();
  for(const r of rows){
    if(String(r.target_type).toUpperCase()!=="PLAYER") continue;
    if(String(r.event_type||"").toUpperCase()==="INTERVAL") continue;
    const x=Number(r.x),z=Number(r.z),t=Number(r.match_time)||0;
    if(!Number.isFinite(x)||!Number.isFinite(z)) continue;
    if(x<state.field.minX||x>state.field.maxX||z<state.field.minZ||z>state.field.maxZ) continue;
    const id=`${t}|${String(r.target_name)}`;
    const cur=latest.get(id);
    if(!cur||order(r)>order(cur)) latest.set(id,r);
  }
  state.playerTracking=new Map();
  for(const r of latest.values()){
    const name=String(r.target_name),team=String(r.team_side||"");
    if(!state.playerTracking.has(name)) state.playerTracking.set(name,{name,team,points:[]});
    state.playerTracking.get(name).points.push({x:Number(r.x),z:Number(r.z),time:Number(r.match_time)||0});
  }
  for(const item of state.playerTracking.values()) item.points.sort((a,b)=>a.time-b.time);
  state.selectedSpatialPlayers=new Set(state.playerTracking.keys());
  buildSpatialControls();
}
function buildSpatialControls(){
  const root=$("playerSpatialControls");
  if(!root) return;
  root.innerHTML="";
  for(const team of ["TEAM_WEST","TEAM_EAST"]){
    const players=[...state.playerTracking.values()].filter(p=>p.team===team).sort((a,b)=>a.name.localeCompare(b.name,"ja"));
    if(!players.length) continue;
    const box=document.createElement("section"); box.className="spatial-team-box";
    const head=document.createElement("div"); head.className="spatial-team-head";
    head.innerHTML=`<b class="${team==="TEAM_WEST"?"west":"east"}">${team==="TEAM_WEST"?"WEST":"EAST"}</b><span><button type="button" data-action="all">全選択</button><button type="button" data-action="none">解除</button></span>`;
    const checks=document.createElement("div"); checks.className="spatial-checks";
    for(const p of players){
      const label=document.createElement("label"); label.className="spatial-player-check";
      const input=document.createElement("input"); input.type="checkbox"; input.checked=state.selectedSpatialPlayers.has(p.name); input.value=p.name;
      input.addEventListener("change",()=>{input.checked?state.selectedSpatialPlayers.add(p.name):state.selectedSpatialPlayers.delete(p.name);renderSpatialOverlays();});
      label.append(input,document.createTextNode(` ${p.name}`)); checks.append(label);
    }
    head.querySelector('[data-action="all"]').addEventListener("click",()=>{for(const p of players)state.selectedSpatialPlayers.add(p.name);buildSpatialControls();renderSpatialOverlays();});
    head.querySelector('[data-action="none"]').addEventListener("click",()=>{for(const p of players)state.selectedSpatialPlayers.delete(p.name);buildSpatialControls();renderSpatialOverlays();});
    box.append(head,checks); root.append(box);
  }
}
function interpolateColor(a,b,t){
  const c=a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  return [c[0],c[1],c[2]];
}
function heatColorArray(rate){
  const stops=[
    {p:0.00,c:[37,99,235]},
    {p:0.18,c:[34,211,238]},
    {p:0.40,c:[74,222,128]},
    {p:0.58,c:[163,230,53]},
    {p:0.74,c:[250,230,35]},
    {p:0.88,c:[249,132,25]},
    {p:1.00,c:[226,49,32]}
  ];
  const r=clamp(rate,0,1);
  for(let i=1;i<stops.length;i++){
    if(r<=stops[i].p){
      const prev=stops[i-1],next=stops[i];
      return interpolateColor(prev.c,next.c,(r-prev.p)/(next.p-prev.p));
    }
  }
  return stops.at(-1).c;
}
function renderSmoothHeatmap(layer,selected){
  const width=180,height=112;
  const density=new Float32Array(width*height);
  const fieldWidth=Math.max(1,state.field.maxX-state.field.minX);
  const fieldHeight=Math.max(1,state.field.maxZ-state.field.minZ);
  const radius=10;
  const sigma=radius*.48;
  const twoSigmaSq=2*sigma*sigma;
  for(const p of selected){
    for(const point of p.points){
      const px=clamp((point.x-state.field.minX)/fieldWidth*(width-1),0,width-1);
      const py=clamp((point.z-state.field.minZ)/fieldHeight*(height-1),0,height-1);
      const minX=Math.max(0,Math.floor(px-radius)),maxX=Math.min(width-1,Math.ceil(px+radius));
      const minY=Math.max(0,Math.floor(py-radius)),maxY=Math.min(height-1,Math.ceil(py+radius));
      for(let y=minY;y<=maxY;y++){
        const dy=y-py;
        for(let x=minX;x<=maxX;x++){
          const dx=x-px;
          const d2=dx*dx+dy*dy;
          if(d2>radius*radius) continue;
          density[y*width+x]+=Math.exp(-d2/twoSigmaSq);
        }
      }
    }
  }
  let max=0;
  for(const value of density) if(value>max) max=value;
  if(!max) return;
  const canvas=document.createElement('canvas');
  canvas.className='heatmap-canvas';
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  const image=ctx.createImageData(width,height);
  for(let i=0;i<density.length;i++){
    const normalized=density[i]/max;
    if(normalized<0.018) continue;
    const rate=Math.pow(normalized,.48);
    const [r,g,b]=heatColorArray(rate);
    const alpha=Math.round(255*clamp((rate-.03)*1.04,0,.86));
    const offset=i*4;
    image.data[offset]=r;image.data[offset+1]=g;image.data[offset+2]=b;image.data[offset+3]=alpha;
  }
  ctx.putImageData(image,0,0);
  layer.append(canvas);
}
function renderSpatialOverlays(){
  const heat=$("heatmapLayer"),avg=$("averageLayer"),field=$("field");
  if(!heat||!avg||!state.field) return;
  heat.innerHTML=""; avg.innerHTML="";
  heat.hidden=!state.heatmapEnabled; avg.hidden=!state.averageEnabled;
  field?.classList.toggle("average-overlay-active",state.averageEnabled);
  const selected=[...state.playerTracking.values()].filter(p=>state.selectedSpatialPlayers.has(p.name));
  if(state.heatmapEnabled) renderSmoothHeatmap(heat,selected);
  if(state.averageEnabled){
    for(const p of selected){
      if(!p.points.length) continue;
      const x=p.points.reduce((a,v)=>a+v.x,0)/p.points.length,z=p.points.reduce((a,v)=>a+v.z,0)/p.points.length;
      const marker=document.createElement("div"); marker.className=`average-marker ${p.team==="TEAM_WEST"?"average-west":"average-east"}`;
      marker.style.left=`${pct(x,state.field.minX,state.field.maxX)}%`;marker.style.top=`${pct(z,state.field.minZ,state.field.maxZ)}%`;
      marker.innerHTML=`<div class="average-dot"></div><div class="average-name">${p.name}</div>`;avg.append(marker);
    }
  }
}

function buildFrames(rows){
  state.snapshotRows=rows;
  state.outScenes=lineOutScenes(rows,state.events);
  buildBallGenerations(rows);
  const byTime=new Map();
  for(const r of rows){const t=Number(r.match_time)||0;if(!byTime.has(t))byTime.set(t,[]);byTime.get(t).push(r);}
  for(const [t,rs] of byTime){
    rs.sort((a,b)=>order(a)-order(b));
    const batches=snapshotBatches(rs);
    state.frames.set(t,latestByTarget(batches.find(b=>b[0].event_type!=="INTERVAL")||batches[0]));
    const grouped=new Map();
    for(const r of rs){const type=String(r.event_type).toUpperCase();if(!grouped.has(type))grouped.set(type,[]);grouped.get(type).push(r);}
    for(const [type,typeRows] of grouped) state.eventFrames.set(`${t}|${type}`,latestByTarget(snapshotBatches(typeRows)[0]));
    const ints=rs.filter(r=>String(r.event_type).toUpperCase()==="INTERVAL");
    if(!ints.length) continue;
    const restartRows=rs.filter(r=>RESTART_KICK_TYPES.has(String(r.event_type).toUpperCase()));
    const restartOrder=restartRows.length?Math.min(...restartRows.map(order)):Infinity;
    const beforeRestart=ints.filter(r=>order(r)<restartOrder);
    const preparationRows=beforeRestart.length?beforeRestart:ints;
    state.intervalFrames.set(t,latestByTarget(preparationRows));
    const targets=new Set(preparationRows.map(key)).size||1;
    state.intervalBatchCounts.set(t,Math.max(1,Math.round(preparationRows.length/targets)));
  }
  buildDirectContacts();
}

function kickoffPreparationFrame(start){
  const source=state.intervalFrames.get(start)||state.frames.get(start);
  const frame=new Map(source?[...source.entries()]:[]);
  const ballEntry=[...frame.entries()].find(([,r])=>String(r.target_type).toUpperCase()==="BALL");
  if(ballEntry&&state.field){
    const [ballKey,ball]=ballEntry;
    frame.set(ballKey,{...ball,x:state.field.centerX,z:state.field.centerZ,vx:0,vy:0,vz:0,holding:0,event_type:"INTERVAL"});
  }
  return frame;
}

function kickoffWindows(){
  const result=[];
  const kickoffTimes=[...new Set(state.events.filter(e=>String(e.event_type).toUpperCase()==="KICKOFF_KICK").map(e=>Number(e.match_time)||0))];
  for(const start of kickoffTimes){
    let resume=start;
    for(let t=start;t<=state.matchDuration;t++){
      const frame=state.frames.get(t);
      if(frame && [...frame.values()].some(r=>String(r.event_type).toUpperCase()!=="INTERVAL")){resume=t;break;}
    }
    result.push({start,resume,frame:kickoffPreparationFrame(start)});
  }
  return result;
}

function pauseLabelAt(t){
  const types=state.events.filter(e=>Number(e.match_time)===t).map(e=>String(e.event_type).toUpperCase());
  if(types.includes("GOAL")) return "ゴール後・再開待ち";
  if(types.includes("SET_PLAY_THROW_IN")) return "スローイン準備";
  if(types.includes("SET_PLAY_GOAL_KICK")) return "ゴールキック準備";
  if(types.includes("SET_PLAY_CORNER_KICK")) return "コーナーキック準備";
  if(types.includes("BALL_OUT")) return "ラインアウト";
  return "INTERVAL";
}

function goalSideFor(event){
  const gx=Number(event.goal_x);
  if(Number.isFinite(gx)) return Math.abs(gx-state.field.minX)<=Math.abs(gx-state.field.maxX)?"west":"east";
  return String(event.team_side).toUpperCase()==="TEAM_WEST"?"east":"west";
}

function latestShotFor(goalEvent){
  const goalTime=Number(goalEvent.match_time)||0;
  const scorer=String(goalEvent.player_name||"");
  const candidates=state.events.filter(e=>{
    const type=String(e.event_type||"").toUpperCase();
    const time=Number(e.match_time)||0;
    return GOAL_ORIGIN_TYPES.has(type)&&time<=goalTime&&time>=goalTime-20;
  });
  const matching=candidates.filter(e=>String(e.player_name||"")===scorer);
  const pool=matching.length?matching:candidates;
  const priority={DIRECT_SHOT:4,SHOT:3,DIRECT_KICK:2,POWER_KICK:1};
  return pool.sort((a,b)=>{
    const dt=(Number(b.match_time)||0)-(Number(a.match_time)||0);
    if(dt)return dt;
    return (priority[String(b.event_type||"").toUpperCase()]||0)-(priority[String(a.event_type||"").toUpperCase()]||0);
  })[0]||null;
}

function ballRowAt(matchTime){
  const frame=state.frames.get(matchTime);
  return frame ? [...frame.values()].find(r=>String(r.target_type).toUpperCase()==="BALL") || null : null;
}

function shotTrajectory(shotTime,goalTime,goalX,goalY,goalZ,shotX,shotY,shotZ){
  if(!Number.isFinite(shotX)||!Number.isFinite(shotZ)) return [{x:goalX,y:goalY,z:goalZ}];
  return [{x:shotX,y:Number.isFinite(shotY)?shotY:state.field.baseY,z:shotZ},{x:goalX,y:goalY,z:goalZ}];
}

function buildGoals(){
  const goalEvents=state.events.filter(e=>String(e.event_type).toUpperCase()==="GOAL").sort((a,b)=>Number(a.match_time)-Number(b.match_time));
  state.goals=goalEvents.map((event,i)=>{
    const score=state.scores[i]||{};
    const side=goalSideFor(event);
    const goalDef=state.field.goals?.[side];
    const shot=latestShotFor(event);
    const lineX=side==="west"?state.field.minX:state.field.maxX;
    const goalZ=Number(event.goal_z);
    const goalY=Number(event.goal_y);
    const shotType=String(shot?.event_type||"").toUpperCase();
    const directContact=DIRECT_EVENT_TYPES.has(shotType)?state.directContacts.get(Number(shot?.match_time)||0):null;
    const shotX=Number(directContact?.ball?.x??shot?.event_x);
    const shotZ=Number(directContact?.ball?.z??shot?.event_z);
    const shotY=Number(directContact?.ball?.y??shot?.event_y);
    const validShot=Number.isFinite(shotX)&&Number.isFinite(shotZ);
    const validGoal=Number.isFinite(goalZ);
    const distance=validShot&&validGoal?Math.hypot(lineX-shotX,goalZ-shotZ):null;
    const shotTime=Number(shot?.match_time);
    const resolvedGoalZ=validGoal?goalZ:state.field.centerZ;
    const resolvedGoalY=Number.isFinite(goalY)?goalY:state.field.baseY;
    return {
      matchTime:Number(event.match_time)||0,
      shotType,
      shotTime:Number.isFinite(shotTime)?shotTime:Math.max(0,(Number(event.match_time)||0)-1),
      scorer:score.scorer||event.player_name||"不明",
      assist:score.assist||null,
      ownGoal:Boolean(Number(score.own_goal)||0),
      teamSide:event.team_side||null,
      side, goalDef,
      shotX:validShot?shotX:null, shotZ:validShot?shotZ:null,
      goalX:lineX, goalZ:resolvedGoalZ,
      goalY:resolvedGoalY,
      distance,
      trajectory:shotTrajectory(Number.isFinite(shotTime)?shotTime:Math.max(0,(Number(event.match_time)||0)-1),Number(event.match_time)||0,lineX,resolvedGoalY,resolvedGoalZ,shotX,shotY,shotZ)
    };
  });
}

function goalFrame(goal){
  // ゴール後やキックオフ準備の座標ではなく、シュートを打った瞬間の全選手配置を固定する。
  const source=state.directContacts.get(goal.shotTime)?.frame||state.eventFrames.get(`${goal.shotTime}|${goal.shotType||"SHOT"}`)||state.frames.get(goal.shotTime-1)||state.frames.get(goal.shotTime)||state.frames.get(goal.matchTime-1)||new Map();
  const frame=new Map([...source.entries()]);
  const ballEntry=[...frame.entries()].find(([,r])=>String(r.target_type).toUpperCase()==="BALL");
  if(ballEntry){
    const [ballKey,ball]=ballEntry;
    frame.set(ballKey,{...ball,x:goal.goalX,y:goal.goalY,z:goal.goalZ,vx:0,vy:0,vz:0,holding:0,event_type:"GOAL"});
  }
  return frame;
}


const MOMENTUM_CONFIG={
  lookaheadSec:10, smoothAlpha:.35, possessionChangeAlpha:.65, maxDisplayProbability:.75,
  shotThreat:{proximity:.30,centrality:.20,forwardSpeed:.20,space:.15,support:.15},
  shotQuality:{distance:.50,angle:.30,space:.20}
};
function frameRowsAt(t){return [...(state.frames.get(t)?.values()||[])];}
function playerRowsAt(t){return frameRowsAt(t).filter(r=>String(r.target_type).toUpperCase()==="PLAYER");}
function ballAt(t){return frameRowsAt(t).find(r=>String(r.target_type).toUpperCase()==="BALL")||null;}
function holderAt(t){
  const players=playerRowsAt(t);
  const held=players.find(r=>Number(r.holding)===1||r.holding===true);
  if(held) return held;
  const ball=ballAt(t); if(!ball) return null;
  let nearest=null,best=1.7;
  for(const p of players){const d=Math.hypot(Number(p.x)-Number(ball.x),Number(p.z)-Number(ball.z));if(d<best){best=d;nearest=p;}}
  return nearest;
}
function halfStartFrame(t){
  const start=t>=300?300:0;
  for(let x=start;x<=Math.min(start+8,state.matchDuration);x++){const f=state.frames.get(x);if(f?.size)return [...f.values()];}
  return [];
}
function attackGoalX(team,t){
  const rows=halfStartFrame(t);
  const gk=rows.find(r=>String(r.target_type).toUpperCase()==="PLAYER"&&String(r.team_side)===team&&String(r.position).toUpperCase()==="GK");
  if(gk) return Number(gk.x)<state.field.centerX?state.field.maxX:state.field.minX;
  const firstHalfEast=team==="TEAM_WEST";
  const attackEast=t<300?firstHalfEast:!firstHalfEast;
  return attackEast?state.field.maxX:state.field.minX;
}
function goalDefinitionForX(goalX){return Math.abs(goalX-state.field.minX)<=Math.abs(goalX-state.field.maxX)?state.field.goals?.west:state.field.goals?.east;}
function openingAngle(ball,goalX){
  const gd=goalDefinitionForX(goalX); if(!gd)return 0;
  const z1=Number(gd.origin.z),z2=z1+Number(gd.dz||0),bx=Number(ball.x),bz=Number(ball.z);
  const a1=Math.atan2(z1-bz,goalX-bx),a2=Math.atan2(z2-bz,goalX-bx);
  let d=Math.abs(a2-a1);if(d>Math.PI)d=2*Math.PI-d;return clamp(d/(Math.PI/3),0,1);
}
function recentEventBonus(team,t){
  let bonus=0;
  for(const e of state.events){
    const et=Number(e.match_time)||0,age=t-et;if(age<0||age>4||String(e.team_side||"")!==team)continue;
    const type=String(e.event_type||"").toUpperCase();
    let value=0;if(type==="SHOT")value=.22;else if(type==="TACKLE_PLAYER_SUCCESS"||type==="TACKLE_BALL_SUCCESS")value=.07;else if(type==="AUTO_PASS"||type==="DIRECT_KICK")value=.04;else if(type==="DIRECT_SHOT")value=.22;else if(type==="HOLD_ACQUIRE")value=.025;
    bonus+=value*Math.exp(-age/2.2);
  }
  return bonus;
}
function momentumPointAt(t,previous){
  const holder=holderAt(t),ball=ballAt(t);
  if(!holder||!ball)return {time:t,team:null,probability:0,raw:0,value:previous?.value?previous.value*.72:0};
  const team=String(holder.team_side||"");if(team!=="TEAM_WEST"&&team!=="TEAM_EAST")return {time:t,team:null,probability:0,raw:0,value:0};
  const goalX=attackGoalX(team,t),goalZ=state.field.centerZ;
  const distance=Math.hypot(goalX-Number(ball.x),goalZ-Number(ball.z));
  const diagonal=Math.hypot(state.field.maxX-state.field.minX,state.field.maxZ-state.field.minZ);
  const proximity=clamp(1-distance/(diagonal*.88),0,1);
  const centrality=1-clamp(Math.abs(Number(ball.z)-goalZ)/((state.field.maxZ-state.field.minZ)/2),0,1);
  const past=ballAt(Math.max(0,t-3));
  const pastDistance=past?Math.hypot(goalX-Number(past.x),goalZ-Number(past.z)):distance;
  const forwardPerSec=(pastDistance-distance)/3;
  const forwardSpeed=clamp((forwardPerSec+1.5)/5,0,1);
  const players=playerRowsAt(t),opponents=players.filter(p=>String(p.team_side)!==team),mates=players.filter(p=>String(p.team_side)===team&&String(p.target_name)!==String(holder.target_name));
  let nearest=8;for(const p of opponents)nearest=Math.min(nearest,Math.hypot(Number(p.x)-Number(holder.x),Number(p.z)-Number(holder.z)));
  const space=clamp(nearest/6,0,1);
  const holderGoalDist=Math.hypot(goalX-Number(holder.x),goalZ-Number(holder.z));
  const supportCount=mates.filter(p=>Math.hypot(Number(p.x)-Number(holder.x),Number(p.z)-Number(holder.z))<=15&&Math.hypot(goalX-Number(p.x),goalZ-Number(p.z))<holderGoalDist).length;
  const support=clamp(supportCount/3,0,1);
  const tc=MOMENTUM_CONFIG.shotThreat,qc=MOMENTUM_CONFIG.shotQuality;
  const threat=tc.proximity*proximity+tc.centrality*centrality+tc.forwardSpeed*forwardSpeed+tc.space*space+tc.support*support;
  const distanceQuality=Math.exp(-distance/22),angleQuality=openingAngle(ball,goalX);
  const quality=qc.distance*distanceQuality+qc.angle*angleQuality+qc.space*space;
  const gd=goalDefinitionForX(goalX),insidePa=gd?distance<22&&Math.abs(Number(ball.z)-goalZ)<18:false;
  let probability=clamp(threat*quality+recentEventBonus(team,t),0,MOMENTUM_CONFIG.maxDisplayProbability);
  if(insidePa)probability=clamp(probability*1.25,0,MOMENTUM_CONFIG.maxDisplayProbability);
  const sign=team==="TEAM_WEST"?1:-1,raw=sign*probability;
  const changed=previous?.team&&previous.team!==team,alpha=changed?MOMENTUM_CONFIG.possessionChangeAlpha:MOMENTUM_CONFIG.smoothAlpha;
  const value=previous?alpha*raw+(1-alpha)*previous.value:raw;
  return {time:t,team,holder:String(holder.target_name||""),probability,raw,value,distance,threat,quality};
}
function buildMomentum(){
  state.momentum=[];let previous=null;
  for(let t=0;t<=state.matchDuration;t++){const point=momentumPointAt(t,previous);state.momentum.push(point);previous=point;}
  state.momentumMaxAbs=Math.max(.12,...state.momentum.map(p=>Math.abs(p.value)));
  renderMomentumChart();
}
function momentumDominance(){
  let west=0,east=0;
  for(const p of state.momentum){if(p.value>0)west+=p.value;else east+=Math.abs(p.value);}
  const total=west+east;
  return total>0?{west:west/total,east:east/total}:{west:.5,east:.5};
}
function renderMomentumDominance(){
  const d=momentumDominance();
  const west=Math.round(d.west*100),east=100-west;
  const westBar=$("momentumDominanceWest"),eastBar=$("momentumDominanceEast");
  if(westBar)westBar.style.width=`${west}%`;
  if(eastBar)eastBar.style.width=`${east}%`;
  if($("momentumDominanceWestValue"))$("momentumDominanceWestValue").textContent=`${west}%`;
  if($("momentumDominanceEastValue"))$("momentumDominanceEastValue").textContent=`${east}%`;
}
function renderMomentumChart(){
  const svg=$("momentumChart");if(!svg||!state.momentum.length)return;
  const w=1000,h=210,mid=h/2,pad=14,max=state.momentumMaxAbs;
  const x=t=>pad+(w-pad*2)*(t/Math.max(1,state.matchDuration));
  const y=v=>mid-(mid-pad)*(v/max);
  const west=state.momentum.map(p=>`${x(p.time).toFixed(1)},${y(Math.max(0,p.value)).toFixed(1)}`).join(" ");
  const east=state.momentum.map(p=>`${x(p.time).toFixed(1)},${y(Math.min(0,p.value)).toFixed(1)}`).join(" ");
  const goalMarkers=state.goals.map((g,i)=>{
    const gx=x(g.matchTime),westGoal=String(g.teamSide)==="TEAM_WEST";
    const gy=westGoal?18:h-18;
    const label=westGoal?"W":"E";
    return `<g class="momentum-goal-marker ${westGoal?"goal-west":"goal-east"}" data-goal-index="${i}" transform="translate(${gx.toFixed(1)} ${gy})"><circle r="10"></circle><text text-anchor="middle" dominant-baseline="central">G</text><title>${fmt(g.matchTime)} GOAL ${g.scorer}${g.assist?` / Assist: ${g.assist}`:""}</title></g>`;
  }).join("");
  svg.innerHTML=`<line class="momentum-zero" x1="${pad}" y1="${mid}" x2="${w-pad}" y2="${mid}"></line><polyline class="momentum-west" points="${west}"></polyline><polyline class="momentum-east" points="${east}"></polyline>${goalMarkers}<line id="momentumCursor" class="momentum-cursor" x1="${pad}" y1="0" x2="${pad}" y2="${h}"></line>`;
  state.momentumCursor=$("momentumCursor");
  renderMomentumDominance();
  svg.onclick=e=>{
    const marker=e.target.closest?.(".momentum-goal-marker");
    if(marker){const goal=state.goals[Number(marker.dataset.goalIndex)];if(goal){state.time=state.matchToVirtual.get(goal.matchTime)??goal.matchTime;render();}return;}
    const r=svg.getBoundingClientRect(),ratio=clamp((e.clientX-r.left)/r.width,0,1),t=Math.round(ratio*state.matchDuration);state.time=state.matchToVirtual.get(t)??t;render();
  };
  svg.onmousemove=e=>{
    const marker=e.target.closest?.(".momentum-goal-marker");
    if(marker){const g=state.goals[Number(marker.dataset.goalIndex)];$("momentumValue").textContent=g?`${fmt(g.matchTime)} GOAL ${g.scorer}${g.assist?` / Assist: ${g.assist}`:""}`:"GOAL";return;}
    const r=svg.getBoundingClientRect(),ratio=clamp((e.clientX-r.left)/r.width,0,1),t=Math.round(ratio*state.matchDuration),p=state.momentum[t];$("momentumValue").textContent=p?.team?`${p.team==="TEAM_WEST"?"WEST":"EAST"} ${Math.round(p.probability*100)}% / ${p.holder||"-"}`:"中立";
  };
  svg.onmouseleave=()=>updateMomentumReadout(playbackPosition(state.time).matchTime);
}
function updateMomentumReadout(t){
  const p=state.momentum[Math.max(0,Math.min(state.momentum.length-1,Math.round(t)))];
  if($("momentumValue"))$("momentumValue").textContent=p?.team?`${p.team==="TEAM_WEST"?"WEST":"EAST"} ${Math.round(p.probability*100)}% / ${p.holder||"-"}`:"中立";
  if(state.momentumCursor){const x=14+(1000-28)*(Math.max(0,Math.min(state.matchDuration,t))/Math.max(1,state.matchDuration));state.momentumCursor.setAttribute("x1",x);state.momentumCursor.setAttribute("x2",x);}
}

function buildPlaybackTimeline(){
  state.timeline=[]; state.matchToVirtual=new Map(); let virtual=0;
  const windows=kickoffWindows(); const windowByStart=new Map(windows.map(w=>[w.start,w])); const skipped=new Set();
  const goalsByTime=new Map(state.goals.map(g=>[g.matchTime,g]));
  for(const w of windows) for(let t=w.start+1;t<w.resume;t++) skipped.add(t);
  for(let t=0;t<=state.matchDuration;t++){
    if(skipped.has(t)) continue;
    const w=windowByStart.get(t);
    if(w){
      const hold=Math.min(3,Math.max(2,w.resume-w.start));
      state.matchToVirtual.set(t,virtual);
      state.timeline.push({kind:"kickoff",matchTime:t,resumeTime:w.resume,virtualStart:virtual,virtualEnd:virtual+hold,hold,frame:w.frame,label:"キックオフ準備"});
      virtual+=hold;
      const kickFrame=restartFrameAt(w.resume)||state.frames.get(w.resume);
      if(kickFrame){
        state.timeline.push({kind:"restart",matchTime:w.resume,virtualStart:virtual,virtualEnd:virtual+RESTART_TRANSITION_SEC,fromFrame:w.frame,toFrame:kickFrame,label:"キックオフ"});
        virtual+=RESTART_TRANSITION_SEC;
      }
      continue;
    }
    state.matchToVirtual.set(t,virtual);
    const goal=goalsByTime.get(t);
    if(goal){
      // DIRECT_SHOT / DIRECT_KICK 由来のゴールは、まずキッカー接触地点から
      // ゴールラインまでの短い飛翔区間を再生してから演出を停止表示する。
      // これにより、前秒のパス途中から直接ゴールへ向かう補間を防ぐ。
      const directContact=DIRECT_EVENT_TYPES.has(String(goal.shotType||"").toUpperCase())
        ? state.directContacts.get(Number(goal.shotTime)||0)
        : null;
      if(directContact?.frame){
        const gf=goalFrame(goal);
        state.timeline.push({
          kind:"directGoalFlight",matchTime:t,virtualStart:virtual,virtualEnd:virtual+DIRECT_GOAL_FLIGHT_SEC,
          fromFrame:directContact.frame,toFrame:gf,goal
        });
        virtual+=DIRECT_GOAL_FLIGHT_SEC;
      }
      state.timeline.push({kind:"goal",matchTime:t,virtualStart:virtual,virtualEnd:virtual+3,hold:3,frame:goalFrame(goal),goal});
      virtual+=3;
    }
    if(!goal)for(const scene of state.outScenes.get(t)||[]){
      state.timeline.push({kind:"outFlight",matchTime:t,virtualStart:virtual,virtualEnd:virtual+.6,fromFrame:latestByTarget(scene.start),toFrame:latestByTarget(scene.end)});virtual+=.6;
      state.timeline.push({kind:"outHold",matchTime:t,virtualStart:virtual,virtualEnd:virtual+.25,hold:.25,frame:latestByTarget(scene.end),label:"ラインアウト"});virtual+=.25;
    }
    const batches=state.intervalBatchCounts.get(t)||1;
    const extraHold=Math.min(3,Math.max(0,batches-1));
    if(extraHold>0){
      const pauseFrame=state.intervalFrames.get(t);
      state.timeline.push({kind:"pause",matchTime:t,virtualStart:virtual,virtualEnd:virtual+extraHold,hold:extraHold,frame:pauseFrame,label:pauseLabelAt(t)});
      virtual+=extraHold;
      const kickFrame=restartFrameAt(t);
      if(pauseFrame&&kickFrame){
        // Set-play snapshots in the same match second can contain both post-kick and
        // pre-kick batches.  Never synthesize a transition that visually runs backwards.
        // Hold the preparation frame and let the following normal play second reveal
        // the actual kick trajectory in chronological snapshot order.
        state.timeline.push({kind:"restartHold",matchTime:t,virtualStart:virtual,virtualEnd:virtual+0.08,hold:0.08,frame:pauseFrame,label:"再開準備"});
        virtual+=0.08;
      }
    }
    state.timeline.push({kind:"play",matchTime:t,virtualStart:virtual,virtualEnd:virtual+1});
    virtual+=1;
    if(t===299){
      const f=state.frames.get(t)||state.intervalFrames.get(t);
      state.timeline.push({kind:"periodEnd",matchTime:300,virtualStart:virtual,virtualEnd:virtual+3,hold:3,frame:f,label:"前半終了",endType:"half"});
      virtual+=3;
    }
    if(t===state.matchDuration){
      const f=state.frames.get(t)||state.intervalFrames.get(t);
      state.timeline.push({kind:"periodEnd",matchTime:600,virtualStart:virtual,virtualEnd:virtual+3,hold:3,frame:f,label:"試合終了",endType:"match"});
      virtual+=3;
    }
  }
  state.duration=Math.max(1,virtual);
}

function segmentAt(v){return state.timeline.find(s=>v<s.virtualEnd)||state.timeline.at(-1);}
function playbackPosition(v){
  const s=segmentAt(v); if(!s)return {matchTime:0,fraction:0,holding:false,label:""};
  if(s.kind==="restart"||s.kind==="directGoalFlight"||s.kind==="outFlight") return {matchTime:s.matchTime,fraction:Math.min(1,Math.max(0,(v-s.virtualStart)/(s.virtualEnd-s.virtualStart))),holding:false,label:s.label||"",segment:s,goal:s.kind==="directGoalFlight"?s.goal:null};
  if(s.kind!=="play") return {matchTime:s.matchTime,fraction:0,holding:true,label:s.label||"",segment:s,goal:s.goal||null};
  return {matchTime:s.matchTime,fraction:Math.min(1,Math.max(0,v-s.virtualStart)),holding:false,label:"",segment:s,goal:null};
}
function isRestartBoundary(t){
  if((state.intervalBatchCounts.get(t)||1)>1) return true;
  const types=state.events.filter(e=>Number(e.match_time)===t).map(e=>String(e.event_type||"").toUpperCase());
  return types.some(x=>["BALL_OUT","THROW_IN","GOAL_KICK","CORNER_KICK","KICKOFF_KICK","GOAL"].includes(x));
}
function boundaryArrivalFrame(t){
  const scene=state.outScenes.get(t)?.[0];return scene?latestByTarget(scene.start):null;
}

function frameAt(v){
  const p=playbackPosition(v),s=p.segment;
  if(p.holding){const f=s.frame||state.intervalFrames.get(p.matchTime)||state.frames.get(p.matchTime);return [f,f,0,p];}
  if(s.kind==="restart"||s.kind==="directGoalFlight"||s.kind==="outFlight") return [s.fromFrame,s.toFrame,p.fraction,p];
  const afterOut=state.outScenes.has(p.matchTime);
  const cur=(afterOut?(state.intervalFrames.get(p.matchTime)||latestByTarget(state.outScenes.get(p.matchTime).at(-1).end)):null)||playbackFrameAt(p.matchTime)||playbackFrameAt(p.matchTime+1);
  if(afterOut)return[cur,cur,0,p];
  // 次秒がゴールの場合、通常フレーム（ゴール後のキックオフ配置を含む可能性がある）へは補間しない。
  // シュート時の選手配置＋ゴールライン上のボールで作った専用フレームへ直接つなぐ。
  const nextTime=p.matchTime+1;
  const nextGoal=state.goals.find(g=>g.matchTime===nextTime);
  // 次秒がダイレクトゴールの場合、パス途中からゴールラインへ直接補間しない。
  // まず DIRECT_SHOT / DIRECT_KICK の接触フレーム（ボールがキッカー位置にある）まで
  // 補間し、その後は directGoalFlight 区間でゴールへ移動させる。
  let nextGoalFrame=null;
  if(nextGoal){
    const directContact=DIRECT_EVENT_TYPES.has(String(nextGoal.shotType||"").toUpperCase())
      ? state.directContacts.get(Number(nextGoal.shotTime)||0)
      : null;
    nextGoalFrame=directContact?.frame||goalFrame(nextGoal);
  }
  // ゴール・ラインアウト・再開準備へ入る直前は、次の配置へ補間せず現在位置を維持する。
  const arrival=boundaryArrivalFrame(nextTime);
  const nxt=nextGoalFrame||arrival||(isRestartBoundary(nextTime)?cur:(playbackFrameAt(nextTime)||cur));
  return [cur,nxt,p.fraction,p];
}
function nodeFor(r){const k=key(r);if(state.nodes.has(k))return state.nodes.get(k);let el;if(r.target_type==="BALL"){el=document.createElement("div");el.className="ball";}else{el=document.createElement("div");el.className="player";el.innerHTML='<div class="player-face"><div class="dot"></div><div class="facing-tip"></div></div><div class="name"></div>';el.querySelector(".name").textContent=r.target_name;el.querySelector(".dot").classList.add(r.team_side==="TEAM_WEST"?"west-dot":"east-dot");}$("field").append(el);state.nodes.set(k,el);return el;}
function yaw(a,b,m){const s=Number(a||0),e=Number(b||s),d=((e-s+540)%360)-180;return s+d*m;}

function positionOverlay(el,x,z){el.style.left=`${pct(x,state.field.minX,state.field.maxX)}%`;el.style.top=`${pct(z,state.field.minZ,state.field.maxZ)}%`;}
function fieldSvgPoint(x,z){
  return {
    x:clamp(pct(x,state.field.minX,state.field.maxX),0,100)*10,
    y:clamp(pct(z,state.field.minZ,state.field.maxZ),0,100)*6.6
  };
}
function courseLabel(horizontal,vertical){
  const h=horizontal<1/3?"左":horizontal>2/3?"右":"中央";
  const v=vertical<1/3?"低め":vertical>2/3?"上":"中段";
  return h+v;
}
function setEventDetail(event,matchTime){
  $("detailTime").textContent=fmt(matchTime||0);
  $("goalCourseSection").hidden=true;
  if(!event){$("detailType").textContent="現在のイベント";$("detailTitle").textContent="通常プレー";$("detailSubtitle").textContent="";$("detailMetrics").innerHTML="";return;}
  $("detailType").textContent=String(event.event_type||"EVENT");
  $("detailTitle").textContent=event.player_name||event.team_side||String(event.event_type||"");
  $("detailSubtitle").textContent=event.related_player?`関連: ${event.related_player}`:"";
  $("detailMetrics").innerHTML="";
}
function renderGoalFx(goal){
  const trajectory=$("goalTrajectory"),shotPoint=$("goalShotPoint"),linePoint=$("goalLinePoint");
  if(!goal){
    trajectory.hidden=true; shotPoint.hidden=true; linePoint.hidden=true;
    $("goalTrajectoryLine").setAttribute("points","");
    $("goalTrajectoryArrow").setAttribute("points","");
    $("goalTrajectoryDistance").textContent="";
    return;
  }
  $("detailType").textContent=goal.ownGoal?"OWN GOAL":"GOAL";
  $("detailTime").textContent=fmt(goal.matchTime);
  $("detailTitle").textContent=goal.scorer;
  $("detailSubtitle").textContent=goal.assist?`Assist: ${goal.assist}`:"アシストなし";
  $("detailMetrics").innerHTML=`<div class="metric-row"><span>シュート距離</span><b>${goal.distance!=null?goal.distance.toFixed(1)+" m":"不明"}</b></div>`;
  positionOverlay(linePoint,goal.goalX,goal.goalZ); linePoint.hidden=false;
  if(goal.shotX!=null&&goal.shotZ!=null){positionOverlay(shotPoint,goal.shotX,goal.shotZ);shotPoint.hidden=false;}else shotPoint.hidden=true;
  const path=(goal.trajectory||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  if(path.length>=2){
    const svgPoints=path.map(p=>fieldSvgPoint(p.x,p.z));
    $("goalTrajectoryLine").setAttribute("points",svgPoints.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    const a=svgPoints.at(-2),b=svgPoints.at(-1),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    const tip={x:b.x-5*ux,y:b.y-5*uy},base={x:tip.x-14*ux,y:tip.y-14*uy},px=-uy,py=ux,half=6;
    $("goalTrajectoryArrow").setAttribute("points",`${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${(base.x+px*half).toFixed(1)},${(base.y+py*half).toFixed(1)} ${(base.x-px*half).toFixed(1)},${(base.y-py*half).toFixed(1)}`);
    const mid={x:(svgPoints[0].x+b.x)/2,y:(svgPoints[0].y+b.y)/2};
    const label=$("goalTrajectoryDistance");label.setAttribute("x",String(mid.x));label.setAttribute("y",String(mid.y-12));label.textContent=goal.distance!=null?`${goal.distance.toFixed(1)} m`:"";
    trajectory.hidden=false;
  }else{trajectory.hidden=true;$("goalTrajectoryArrow").setAttribute("points","");}
  const gd=goal.goalDef,section=$("goalCourseSection"),course=$("goalCoursePoint"),courseName=$("goalCourseName");
  if(gd){
    const minZ=Number(gd.origin.z),width=Number(gd.dz||0),maxZ=minZ+width,bottom=Number(gd.origin.y),height=Number(gd.dy||0),top=bottom+height;
    const horizontal=clamp(goal.side==="east"?(goal.goalZ-minZ)/width:(maxZ-goal.goalZ)/width,0,1);
    const vertical=clamp((goal.goalY-bottom)/height,0,1);
    course.style.left=`${horizontal*100}%`;course.style.bottom=`${vertical*100}%`;courseName.textContent=`コース：${courseLabel(horizontal,vertical)}`;$("goalSize").textContent=`ゴール幅 ${width.toFixed(1)} m / 高さ ${height.toFixed(1)} m`;section.hidden=false;
  }
}
function render(){
  const [cf,nf,m,p]=frameAt(state.time); if(!cf)return;
  const keys=new Set([...cf.keys(),...(nf?[...nf.keys()]:[])]);
  for(const k of keys){
    const c=cf.get(k)||nf.get(k),n=nf?.get(k)||c,r={...c,x:Number(c.x)+(Number(n.x)-Number(c.x))*m,z:Number(c.z)+(Number(n.z)-Number(c.z))*m,yaw:yaw(c.yaw,n.yaw,m)};
    const el=nodeFor(r);el.style.left=`${pct(r.x,state.field.minX,state.field.maxX)}%`;el.style.top=`${pct(r.z,state.field.minZ,state.field.maxZ)}%`;el.hidden=r.x<state.field.minX-5||r.x>state.field.maxX+5||r.z<state.field.minZ-5||r.z>state.field.maxZ+5;
    if(r.target_type==="PLAYER"){el.querySelector(".player-face").style.transform=`rotate(${Number(r.yaw||0)+90}deg)`;el.classList.toggle("holder",Boolean(c.holding||n.holding));}
  }
  const score=[...state.scores].reverse().find(x=>Number(x.absolute_match_time)<=p.matchTime); $("score").textContent=`${score?.west_score??0} - ${score?.east_score??0}`;
  const sample=[...cf.values()].find(r=>r.half_no);
  const halfNo=p.matchTime>=300?2:1;
  $("half").textContent=halfNo===2?"後半":"前半";
  const isPeriodEnd=p.segment?.kind==="periodEnd";
  const halfClock=isPeriodEnd?300:Math.max(0,Math.min(299,p.matchTime-(halfNo===2?300:0)));
  $("clock").textContent=fmt(halfClock); $("range").value=state.time;
  const cue=$("intervalCue"); cue.hidden=!p.holding||Boolean(p.goal); cue.textContent=p.label||"INTERVAL";
  cue.classList.toggle("end-cue",isPeriodEnd);
  if(!p.goal){
    if(p.segment?.kind==="periodEnd"){
      $("detailType").textContent=p.segment.endType==="match"?"FULL TIME":"HALF TIME";
      $("detailTime").textContent="05:00";
      $("detailTitle").textContent=p.label;
      $("detailSubtitle").textContent=p.segment.endType==="match"?"試合終了":"後半開始まで停止";
      $("detailMetrics").innerHTML=`<div class="metric-row"><span>スコア</span><b>${$("score").textContent}</b></div>`;
      $("goalCourseSection").hidden=true;
    }else{const current=[...state.events].reverse().find(e=>Number(e.match_time)<=p.matchTime);setEventDetail(current,p.matchTime);}
  } renderGoalFx(p.goal);
  document.querySelectorAll(".event").forEach(el=>el.classList.toggle("active",Number(el.dataset.time)===p.matchTime));
  updateMomentumReadout(p.matchTime);
}
function eventDescription(e){if(e.related_player)return `${e.player_name||""} → ${e.related_player}`;if(e.team_side)return String(e.team_side).replace("TEAM_","");return "";}
function listEvents(){const root=$("events");root.innerHTML="";for(const e of state.events){const row=document.createElement("tr");row.className="event";row.dataset.time=e.match_time;row.innerHTML=`<td class="event-time">${fmt(e.match_time)}</td><td><b>${e.event_type}</b></td><td>${e.player_name||"-"}</td><td>${eventDescription(e)}</td>`;row.addEventListener("click",()=>{state.time=state.matchToVirtual.get(Number(e.match_time))??0;setEventDetail(e,Number(e.match_time));render();});root.append(row);}}
function seekEvent(dir){const mt=playbackPosition(state.time).matchTime,times=[...new Set(state.events.map(e=>Number(e.match_time)))].sort((a,b)=>a-b),target=dir>0?times.find(t=>t>mt):[...times].reverse().find(t=>t<mt);if(target!=null){state.time=state.matchToVirtual.get(target)??0;render();}}
function loop(ts){if(state.playing){if(!state.lastFrame)state.lastFrame=ts;state.time+=((ts-state.lastFrame)/1000)*state.speed;if(state.time>=state.duration){state.time=state.duration;state.playing=false;}state.lastFrame=ts;render();}else state.lastFrame=0;requestAnimationFrame(loop);}

async function init(){
  try{
    const [match,field,events,scores,snapshots]=await Promise.all([json("match.json"),json("field.json"),json("events.json"),json("scores.json"),json("snapshots.json")]);
    state.matchDuration=Number(match.durationSec)||1; state.events=events;
    const goalTimes=events.filter(e=>String(e.event_type).toUpperCase()==="GOAL").map(e=>Number(e.match_time)||0).sort((a,b)=>a-b);
    state.scores=scores.map((s,i)=>({...s,absolute_match_time:(goalTimes[i] ?? Number(s.match_time) ?? 0)}));
    drawField(field); buildFrames(snapshots); buildPlayerTracking(snapshots); buildGoals(); buildPlaybackTimeline(); buildMomentum(); $("gameId").textContent=match.gameId; $("category").textContent=match.category; $("range").max=state.duration; listEvents(); render(); $("status").hidden=true; $("app").hidden=false;
    console.info("Tracking timeline",{goalTimes,goals:state.goals,kickoffWindows:kickoffWindows().map(w=>({start:w.start,resume:w.resume})),duration:state.duration});
  }catch(e){$("status").textContent=`読み込み失敗: ${e.message}。ローカルHTTPサーバー経由で開いてください。`;console.error(e);}
}
$("play").addEventListener("click",()=>state.playing=true);$("pause").addEventListener("click",()=>state.playing=false);$("start").addEventListener("click",()=>{state.time=0;render();});$("prev").addEventListener("click",()=>seekEvent(-1));$("next").addEventListener("click",()=>seekEvent(1));$("speed").addEventListener("change",e=>state.speed=Number(e.target.value));$("range").addEventListener("input",e=>{state.time=Number(e.target.value);render();});$("heatmapToggle").addEventListener("change",e=>{state.heatmapEnabled=e.target.checked;renderSpatialOverlays();});$("averageToggle").addEventListener("change",e=>{state.averageEnabled=e.target.checked;renderSpatialOverlays();});
requestAnimationFrame(loop);init();
