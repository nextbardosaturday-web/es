import {positionBadges} from './appearance-format.mjs';
import {showPlayerPanel} from "./player-event-panel.js";
import { playerPlayCounts } from "./match-presentation.mjs";
const PUBLIC_MATCH=document.documentElement.dataset.publicMatch==="true";
const params = new URLSearchParams(location.search);
const gameId = params.get("id") || "2026080101";
const base = `data/matches/${encodeURIComponent(gameId)}`;

const byId = (id) => document.getElementById(id);
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const fmt = (seconds) => {
  const s = Math.max(0, Math.floor(num(seconds)));
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
};
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function fetchJson(name, optional = false, attempt = 0){
  try{
    const sep=name.includes("?")?"&":"?";
    const r = await fetch(`${base}/${name}${sep}_cb=${Date.now()}_${attempt}`, {cache:"no-store", headers:{"Cache-Control":"no-cache"}});
    if(!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  }catch(e){
    if(attempt < 2){ await new Promise(r=>setTimeout(r,120*(attempt+1))); return fetchJson(name, optional, attempt+1); }
    if(optional) return null;
    throw e;
  }
}
function val(o, ...keys){for(const k of keys){if(o && o[k] !== undefined && o[k] !== null) return o[k];}return null;}
function eventTime(e){return num(val(e,"matchTime","match_time"));}
function eventType(e){return String(val(e,"type","event_type")||"").toUpperCase();}
function playerName(e){return val(e,"player","player_name","target_name");}
function teamSide(e){return val(e,"teamSide","team_side");}
function sourceIds(e){return val(e,"sourceEventIds","source_event_ids") || [];}
function primarySourceId(e){const ids=(sourceIds(e)||[]).map(Number).filter(Number.isFinite);return ids.length?Math.min(...ids):Number.MAX_SAFE_INTEGER;}
function sourceOrderTime(e){return eventTime(e)+(primarySourceId(e)%1000000)*1e-9;}

const state={playEvents:[],rawEvents:[],snapshots:[],reviewSequences:[],sequences:[],audit:[],stats:null,auditOnlyIssues:true,current:-1,autoStop:false,lastRangeTime:0,currentTime:0,activeTab:"sequence",manualSequence:null};

function normalizePlayEvents(data){
  const arr=Array.isArray(data)?data:(data?.events||[]);
  return arr.slice().sort((a,b)=>eventTime(a)-eventTime(b)||primarySourceId(a)-primarySourceId(b)||String(a.id||"").localeCompare(String(b.id||"")));
}
function normalizeRawEvents(data){
  const arr=Array.isArray(data)?data:(data?.events||[]);
  return arr.slice().sort((a,b)=>eventTime(a)-eventTime(b)||num(val(a,"event_id","id"))-num(val(b,"event_id","id")));
}
function normalizeSnapshots(data){
  const arr=Array.isArray(data)?data:(data?.snapshots||data?.rows||[]);
  return arr;
}

function normalizeReviewSequences(data){
  const input=Array.isArray(data)?data:(data?.sequences||[]);
  const arr=input.slice().sort((a,b)=>{
    const ai=Number(a?.index),bi=Number(b?.index);
    if(Number.isFinite(ai)&&Number.isFinite(bi)&&ai!==bi)return ai-bi;
    return num(a.virtualTime,a.startTime)-num(b.virtualTime,b.startTime)
      ||num(a.startEventId,1e15)-num(b.startEventId,1e15)
      ||num(a.orderInSecond)-num(b.orderInSecond);
  });

  // Build a presentation order from causal relations instead of trusting generation order.
  // Typical problematic chain: HOLD -> SAVE -> SHOT in JSON.  If SAVE.linkedShotEventId
  // points at the SHOT, force SHOT -> SAVE while retaining all unrelated canonical order.
  const byPlayId=new Map();
  arr.forEach((x,i)=>{
    if(x?.terminalPlayEventId)byPlayId.set(String(x.terminalPlayEventId),i);
    for(const se of (x?.subEvents||[])) if(se?.playEventId&&String(se.type||'').toUpperCase()==='SHOT') byPlayId.set(String(se.playEventId),i);
  });
  const edges=arr.map(()=>new Set()), indeg=arr.map(()=>0);
  const add=(a,b)=>{if(a==null||b==null||a===b||edges[a].has(b))return;edges[a].add(b);indeg[b]++;};

  // Preserve canonical order only between clearly separate times.  Same/overlapping plays
  // are allowed to be reordered by the explicit causal edges below.
  for(let i=0;i<arr.length-1;i++){
    const a=arr[i],b=arr[i+1];
    if(num(a.endTime,a.resultTime)<num(b.startTime,b.actionTime)-0.001)add(i,i+1);
  }
  arr.forEach((x,i)=>{
    const kind=String(x?.kind||'').toUpperCase();
    if(kind==='SAVE' && x.linkedShotEventId!=null)add(byPlayId.get(String(x.linkedShotEventId)),i);
    // HOLD_TO_SHOT is a short bridge.  Force its same-player SHOT directly after it,
    // before SAVE/BLOCK sequences occurring in the same second.
    if(kind==='HOLD' && String(x.result||'')==='HOLD_TO_SHOT'){
      let best=null;
      for(let j=0;j<arr.length;j++){
        if(String(arr[j]?.kind||'').toUpperCase()!=='SHOT')continue;
        if(String(arr[j]?.player||arr[j]?.actor||'')!==String(x.player||x.actor||''))continue;
        const dt=num(arr[j].actionTime,arr[j].startTime)-num(x.actionTime,x.endTime);
        if(dt>=-0.001&&dt<=1.05 && (best==null||dt<(num(arr[best].actionTime,arr[best].startTime)-num(x.actionTime,x.endTime))))best=j;
      }
      if(best!=null)add(i,best);
    }
  });

  // Stable topological sort: original canonical index remains the tie-breaker.
  const ready=[];for(let i=0;i<arr.length;i++)if(indeg[i]===0)ready.push(i);
  const rank=i=>Number.isFinite(Number(arr[i]?.index))?Number(arr[i].index):i;
  ready.sort((a,b)=>rank(a)-rank(b));
  const out=[];
  while(ready.length){
    const i=ready.shift();out.push(arr[i]);
    for(const j of edges[i]){if(--indeg[j]===0){ready.push(j);ready.sort((a,b)=>rank(a)-rank(b));}}
  }
  // A malformed cycle must never hide sequences; fall back to the original order.
  const ordered=out.length===arr.length?out:arr;
  return ordered.map((x,presentationIndex)=>({...x,presentationIndex}));
}
function sequenceFromCanonical(c,index){
  const kind=String(c.kind||"").toUpperCase();
  const terminal=(c.subEvents||[]).findLast?c.subEvents.findLast(x=>["PASS","SHOT","SAVE"].includes(String(x.type||"").toUpperCase())):[...(c.subEvents||[])].reverse().find(x=>["PASS","SHOT","SAVE"].includes(String(x.type||"").toUpperCase()));
  // Canonical review sequences are presentation objects.  For SHOT/SAVE/PASS metadata,
  // the analyzed play-event remains authoritative so a sequence rebuild cannot erase
  // chanceScore, GOAL, direct-shot flags, or evidence.
  const linkedPlay=c.terminalPlayEventId?state.playEvents.find(e=>String(e.id)===String(c.terminalPlayEventId)):null;
  // HOLDの主語はstartEventIdのHOLD_ACQUIREを唯一の正として再確定する。
  // 生成JSONに古いactor/playerが残っていても前保持者を表示しない。
  const rawStart=state.rawEvents.find(e=>num(val(e,"event_id","id"),-1)===num(c.startEventId,-2));
  const explicitHold=(c.subEvents||[]).find(x=>String(x.type||"").toUpperCase()==="HOLD"&&x.player);
  // The HOLD sub-event is generated directly from HOLD_ACQUIRE and is authoritative.
  // Fall back to startEventId raw event, never to the previous sequence.
  const holdActor=kind==="HOLD"?(explicitHold?.player||(eventType(rawStart)==="HOLD_ACQUIRE"?playerName(rawStart):null)):null;
  const authoritativeActor=holdActor||c.actor||c.player||terminal?.player||null;
  const synthetic={
    id:c.terminalPlayEventId||c.id,
    type:kind==="HOLD"?(terminal?.type||"HOLD"):kind,
    result:(kind==="SHOT"&&linkedPlay?.result)||c.result||terminal?.result||"",
    player:(kind!=="HOLD"&&linkedPlay?.player)||authoritativeActor,
    teamSide:(kind!=="HOLD"&&linkedPlay?.teamSide)||c.teamSide||null,
    target:(kind!=="HOLD"&&linkedPlay?.target)||c.target||terminal?.target||null,
    sourceEventIds:(linkedPlay?.sourceEventIds?.length?linkedPlay.sourceEventIds:c.sourceEventIds)||[],
    chance:linkedPlay?.chance||c.chance||null,
    flags:{...(c.flags||{}),...(linkedPlay?.flags||{})},
    evidence:{...(c.evidence||{}),...(linkedPlay?.evidence||{})},
    end:linkedPlay?.end||c.end||null
  };
  const seq={index,event:synthetic,canonical:c,type:synthetic.type,result:String(synthetic.result||""),player:synthetic.player,actor:synthetic.player,team:(holdActor?teamSide(rawStart):null)||c.teamSide||null,target:synthetic.target||null,targetTeam:null,
    actionTime:num(c.actionTime,c.startTime),resultTime:num(c.resultTime,c.actionTime),startTime:num(c.startTime),endTime:num(c.endTime,c.resultTime),
    virtualTime:num(c.virtualTime,c.actionTime??c.startTime),orderInSecond:num(c.orderInSecond),sourceIndex:Number.isFinite(Number(c.index))?Number(c.index):index,
    subEvents:c.subEvents||[]};
  seq.context=tacticalContext(seq);
  const shotSub=(seq.subEvents||[]).find(x=>String(x.type).toUpperCase()==="SHOT");
  if(shotSub){seq.linkedSave=(seq.subEvents||[]).find(x=>String(x.type).toUpperCase()==="SAVE")||null;seq.linkedBlock=(seq.subEvents||[]).find(x=>String(x.type).toUpperCase()==="BLOCK")||null;}
  return seq;
}

function nearestSnapshotRows(t){
  // Prefer same-second rows, then nearest previous second. Snapshot datasets are event-dense,
  // so this avoids inventing interpolated tactical context.
  let best=-Infinity;
  for(const r of state.snapshots){
    const rt=num(val(r,"match_time","matchTime"),-99999);
    if(rt<=t && rt>best) best=rt;
  }
  if(!Number.isFinite(best)||best===-Infinity) return [];
  return state.snapshots.filter(r=>num(val(r,"match_time","matchTime"),-99999)===best);
}
function playerRowsAt(t){
  const rows=nearestSnapshotRows(t);
  // A single second can contain several event snapshot batches. Keep only the latest
  // row for each player so FREE/MARK labels are never duplicated dozens of times.
  const latest=new Map();
  for(const r of rows){
    if(String(val(r,"target_type","targetType")||"").toUpperCase()!=="PLAYER")continue;
    const name=val(r,"target_name","targetName");if(!name)continue;
    const old=latest.get(name);
    if(!old||num(val(r,"snapshot_id","snapshotId"),-1)>num(val(old,"snapshot_id","snapshotId"),-1))latest.set(name,r);
  }
  return [...latest.values()].map(r=>({
    name:val(r,"target_name","targetName"),team:val(r,"team_side","teamSide"),position:val(r,"position"),
    x:num(val(r,"x")),z:num(val(r,"z")),holding:num(val(r,"holding"))===1
  }));
}
function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}

function tacticalContext(seq){
  // Use the last completed snapshot before the action. This intentionally avoids
  // leaking the action/result itself into the tactical context shown while reviewing.
  const rows=playerRowsAt(Math.max(seq.startTime,seq.actionTime-0.01));
  const holder=rows.find(r=>r.name===seq.player) || rows.find(r=>r.holding && r.team===seq.team);
  if(!holder) return {freeForward:[],freeBackward:[],marks:[],pressers:[],snapshotTime:null};
  const mates=rows.filter(r=>r.team===holder.team && r.name!==holder.name && r.position!=="GK");
  const opp=rows.filter(r=>r.team && r.team!==holder.team);
  const nearestOpp=(m)=>opp.reduce((best,o)=>!best||dist(m,o)<dist(m,best)?o:best,null);
  const attackSign=holder.team==="TEAM_WEST"?1:holder.team==="TEAM_EAST"?-1:0;
  const freeForward=[],freeBackward=[];
  for(const m of mates){
    const passDistance=dist(holder,m);
    // FREE uses a distance-aware contest margin. Near options require a relatively
    // large immediate cushion; long options grow more gently so distant unmarked
    // receivers are not rejected too aggressively.
    if(passDistance>42)continue;
    const o=nearestOpp(m);
    const requiredGap=Math.max(3.0,Math.min(4.8,3.15+(passDistance-8)*0.045));
    if(o && dist(m,o)<requiredGap)continue;
    // Also reject a lane that an opponent is already close enough to contest.
    const laneBlocked=opp.some(d=>{
      const vx=m.x-holder.x,vz=m.z-holder.z,wx=d.x-holder.x,wz=d.z-holder.z;
      const len2=vx*vx+vz*vz;if(len2<1e-6)return false;
      const t=Math.max(0,Math.min(1,(wx*vx+wz*vz)/len2));
      if(t<0.08||t>0.96)return false;
      const px=holder.x+t*vx,pz=holder.z+t*vz;
      const laneDist=Math.hypot(d.x-px,d.z-pz);
      const dynamicLane=Math.max(1.35,Math.min(1.8,1.35+passDistance*0.012));
      return laneDist<dynamicLane;
    });
    if(laneBlocked)continue;
    const progress=(m.x-holder.x)*attackSign;
    // Almost-square options are classified with the backward/safe group.
    const forwardThreshold=Math.max(1.5,passDistance*0.12);
    (progress>=forwardThreshold?freeForward:freeBackward).push(m.name);
  }
  // Ensure stable, unique labels even when source data repeats a player in several batches.
  const uniq=(a)=>[...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),"ja"));
  const pressers=uniq(opp.filter(o=>dist(holder,o)<=3.2).sort((a,b)=>dist(holder,a)-dist(holder,b)).map(o=>o.name));

  // A dense cluster is not treated as a 1-v-1 mark. Only unique nearest pairings
  // where neither side has multiple close alternatives are displayed as MARK.
  const candidate=[];
  for(const o of opp){
    for(const m of mates){
      const passDistance=dist(holder,m);
      const progress=(m.x-holder.x)*attackSign;
      // Do not call backward/square support players MARKED. A mark target must be
      // meaningfully goal-side of the ball, and the defender should be on the goal
      // side of that attacker rather than merely nearby after possession changes.
      if(progress<Math.max(1.5,passDistance*0.10))continue;
      const defenderGoalSide=(o.x-m.x)*attackSign>=-0.5;
      if(!defenderGoalSide)continue;
      const d=dist(o,m);if(d>3.2)continue;
      const nearbyOppForAttacker=opp.filter(x=>dist(x,m)<=3.2).length;
      const nearbyAttackersForDefender=mates.filter(x=>dist(x,o)<=3.2).length;
      if(nearbyOppForAttacker>1||nearbyAttackersForDefender>1)continue;
      candidate.push({defender:o.name,attacker:m.name,d});
    }
  }
  candidate.sort((a,b)=>a.d-b.d);
  const usedD=new Set(),usedA=new Set(),marks=[];
  for(const c of candidate){if(!usedD.has(c.defender)&&!usedA.has(c.attacker)){usedD.add(c.defender);usedA.add(c.attacker);marks.push(c);}}
  return {freeForward:uniq(freeForward),freeBackward:uniq(freeBackward),marks,pressers,snapshotTime:num(val(nearestSnapshotRows(seq.actionTime-0.01)[0],"match_time","matchTime"),seq.actionTime)};
}


function playerStat(name){
  const players=Array.isArray(state.stats?.players)?state.stats.players:[];
  return players.find(p=>String(p.name||'')===String(name||''))||null;
}
function trialMetricModel(seq){
  const e=seq.event||{},ctx=seq.context||{freeForward:[],freeBackward:[],marks:[],pressers:[]};
  const rows=[];
  const add=(label,value,tone='info',note='')=>rows.push({label,value,tone,note});
  const type=String(seq.type||'').toUpperCase();
  const flags=e.flags||{},prog=e.progression||null,ch=e.chance||null,ev=e.evidence||{};
  if(type==='PASS') {
    add('キーパス',flags.keyPass?'該当':'非該当',flags.keyPass?'good':'muted',flags.keyPass?(ev.keyPassReason==='assist'?'アシストに紐づくパス':'決定機につながる直前パス'):'');
    add('アシスト連動',flags.assist?'該当':'非該当',flags.assist?'good':'muted');
    add('プログレッシブパス',flags.progressive?'該当':'非該当',flags.progressive?'good':'muted',prog?`前進 ${num(prog.gained).toFixed(1)}m / ${Math.round(num(prog.ratio)*100)}%`:'' );
  }
  if(type==='SHOT') {
    if(ch)add('最終xG',num(ch.score).toFixed(3),flags.bigChance?'good':'info','このシュートの係数');
    add('決定機',flags.bigChance?'該当':'非該当',flags.bigChance?'good':'muted');
    const outcome=String(e.result||seq.result||'');const known={GOAL:'枠内',SAVED:'枠内',OFF_TARGET:'枠外',BLOCKED:'ブロック',WOODWORK:'ポスト・バー'};const classification=known[outcome]||(flags.onTargetByProjection?'枠内（軌道延長）':'未確定');add('シュート分類',classification,classification.startsWith('枠内')?'good':'muted','集計は最終結果を優先し、重複して数えません');
    if(flags.direct)add('ダイレクト','該当','info');
    if(flags.bigChancePrevented||ev.bigChancePreventedBy)add('決定機阻止',ev.bigChancePreventedBy||seq.target||'該当','warn');
  }
  if(type==='SAVE'||type==='BLOCK') {
    add('決定機阻止',flags.bigChancePrevented?'該当':'非該当',flags.bigChancePrevented?'good':'muted');
  }
  add('前方フリー候補',String((ctx.freeForward||[]).length),(ctx.freeForward||[]).length?'good':'muted',(ctx.freeForward||[]).join('、'));
  add('後方フリー候補',String((ctx.freeBackward||[]).length),(ctx.freeBackward||[]).length?'info':'muted',(ctx.freeBackward||[]).join('、'));
  add('プレッシャー',String((ctx.pressers||[]).length),(ctx.pressers||[]).length?'warn':'muted',(ctx.pressers||[]).join('、'));
  add('マーク',String((ctx.marks||[]).length),(ctx.marks||[]).length?'warn':'muted',(ctx.marks||[]).map(m=>`${m.defender}→${m.attacker}`).join('、'));
  const ps=playerStat(seq.player);
  const tr=ps?.trial||null;
  return {rows,playerTrial:tr,snapshotTime:ctx.snapshotTime};
}
function renderTrialMetrics(seq){
  const m=trialMetricModel(seq);
  const rows=m.rows.map(r=>`<div class="trial-metric-row"><span>${esc(r.label)}</span><b class="${esc(r.tone)}">${esc(r.value)}</b>${r.note?`<small>${esc(r.note)}</small>`:''}</div>`).join('');
  const t=m.playerTrial;
  const total=t?`<details class="trial-totals"><summary>${esc(seq.player||'-')} の試合累計（参考）</summary><div class="trial-total-grid"><span>PA侵入</span><b>${num(t.paEntries?.successful)} / ${num(t.paEntries?.attempts)}</b><span>前進キャリー</span><b>${num(t.progressiveCarries)}</b><span>前進距離</span><b>${num(t.progressiveCarryDistance).toFixed(1)}m</b><span>プレス</span><b>${num(t.positioning?.pressingSeconds)}s</b><span>フリー受け</span><b>${num(t.positioning?.freeReceivingSeconds)}s</b><span>カバー</span><b>${num(t.positioning?.coverSeconds)}s</b><span>ディレイ</span><b>${num(t.positioning?.delaySeconds)}s</b><span>コース塞ぎ</span><b>${num(t.positioning?.courseBlockingSeconds)}s</b><span>マーク</span><b>${num(t.positioning?.markSeconds)}s</b></div></details>`:'';
  return `<section class="seq-block trial-metrics"><h3>試験指標</h3><div class="trial-caption">このプレー時点の判定${Number.isFinite(Number(m.snapshotTime))?`（snapshot ${fmt(m.snapshotTime)}）`:''}</div><div class="trial-metric-grid">${rows}</div>${total}</section>`;
}

function rawBySourceIds(ids){
  const s=new Set((ids||[]).map(Number));
  return state.rawEvents.filter(e=>s.has(num(val(e,"event_id","id"),-1)));
}
function findLastHold(player,t,minT){
  for(let i=state.rawEvents.length-1;i>=0;i--){const e=state.rawEvents[i],et=eventTime(e);if(et>t)continue;if(et<minT)break;if(eventType(e)==="HOLD_ACQUIRE"&&playerName(e)===player)return et;}return null;
}
function findLinked(play, type, window=2){
  const t=eventTime(play); return state.playEvents.find(e=>e!==play&&eventType(e)===type&&Math.abs(eventTime(e)-t)<=window&&(
    (e.evidence?.linkedPassEventId===play.id)||(e.evidence?.linkedShotEventId===play.id)||(play.target&&playerName(e)===play.target)
  ));
}
function describe(seq){
  const e=seq.event,t=seq.type,r=seq.result;
  if(t==="PASS"){
    const target=seq.target?`（${seq.target}）`:"";
    return {title:`${seq.player}のパス${r==="SUCCESS"?"成功":r==="FAILED"?"失敗":"未確定"}${target}`,subtitle:e.flags?.setPlay?"セットプレー":"パス",tone:r==="SUCCESS"?"good":r==="FAILED"?"bad":"info"};
  }
  if(t==="SHOT") return {title:`${seq.player} シュート`,subtitle:r==="GOAL"?"ゴール":r==="SAVED"?"セーブされた":r==="BLOCKED"?"ブロック":r==="OFF_TARGET"?"枠外":r==="WOODWORK"?"ポスト/バー":r,tone:r==="GOAL"?"good":r==="SAVED"||r==="BLOCKED"?"info":"bad"};
  if(t==="DRIBBLE") return {title:`${seq.player} ドリブル${r==="SUCCESS"?"成功":r==="FAILED"?"失敗":"未確定"}`,subtitle:seq.target?`相手：${seq.target}`:"対人",tone:r==="SUCCESS"?"good":r==="FAILED"?"bad":"info"};
  if(t==="TACKLE") return {title:`${seq.player} タックル${r==="WON"||r==="SUCCESS"?"成功":"失敗"}`,subtitle:seq.target?`対象：${seq.target}`:"",tone:r==="WON"||r==="SUCCESS"?"good":"bad"};
  if(t==="INTERCEPTION") return {title:`${seq.player} パスカット`,subtitle:seq.target?`対象：${seq.target}`:"",tone:"good"};
  if(t==="SAVE") return {title:`${seq.player} セーブ`,subtitle:seq.target?`シュート：${seq.target}`:"",tone:"good"};
  if(t==="BLOCK") return {title:`${seq.player} ブロック`,subtitle:seq.target?`対象：${seq.target}`:"",tone:"good"};
  return {title:`${seq.player||"-"} ${t}`,subtitle:r,tone:"info"};
}

function buildSequences(){
  if(state.reviewSequences.length){
    state.sequences=state.reviewSequences.map((c,i)=>sequenceFromCanonical(c,i));
    return;
  }
  // Fallback for older builds without play-sequences.json.
  // Navigation is based on actual attacking actions. SAVE/BLOCK and linked
  // INTERCEPTION records are outcomes of those actions, not separate review plays.
  const primaryTypes=new Set(["PASS","SHOT","DRIBBLE","TACKLE","INTERCEPTION"]);
  const prim=state.playEvents.filter(e=>{
    const t=eventType(e);
    if(!primaryTypes.has(t))return false;
    if(t==="SHOT"&&String(e.result)==="REJECTED")return false;
    if(t==="INTERCEPTION"&&(e.evidence?.linkedPassEventId||e.evidence?.linkedShotEventId))return false;
    return true;
  }).sort((a,b)=>eventTime(a)-eventTime(b)||primarySourceId(a)-primarySourceId(b));

  // Same-second raw events need a tiny deterministic virtual offset so a PASS ->
  // DIRECT_SHOT chain can be reviewed in the correct event_id order without drift.
  const perSecond=new Map();
  const virtualTimes=new Map();
  for(const e of prim){
    const sec=eventTime(e);
    const k=String(sec);
    const n=(perSecond.get(k)||0);perSecond.set(k,n+1);
    virtualTimes.set(e,sec+n*0.025);
  }

  const out=[];
  for(let i=0;i<prim.length;i++){
    const e=prim[i],type=eventType(e),actionTime=virtualTimes.get(e),src=rawBySourceIds(sourceIds(e));
    const player=playerName(e),team=teamSide(e);
    const prevAction=i?virtualTimes.get(prim[i-1]):-Infinity;
    const nextAction=i+1<prim.length?virtualTimes.get(prim[i+1]):Infinity;
    const rawActionTime=eventTime(e);
    const hold=findLastHold(player,rawActionTime,Math.max(0,rawActionTime-12));
    let start=hold!=null?hold:Math.max(0,rawActionTime-0.65);
    // A hold that began before another already-reviewed action must not pull this
    // sequence backwards and gradually desynchronise the panel from playback.
    if(Number.isFinite(prevAction))start=Math.max(start,prevAction+0.001);
    start=Math.min(start,actionTime);

    const rawResult=Math.max(rawActionTime,...src.map(eventTime).filter(Number.isFinite));
    // GOAL is a terminal result already encoded on the canonical play event. Showing it
    // at the shot action avoids a same-second kickoff replacing the sequence while it is
    // still stuck at RESULT_PENDING.
    const resultTime=String(e.result)==="GOAL"?actionTime:Math.max(actionTime,rawResult);
    let end=Number.isFinite(nextAction)?nextAction-0.001:Math.max(resultTime+0.75,actionTime+0.75);
    end=Math.max(end,resultTime+0.03);
    if(end<=actionTime)end=actionTime+0.02;
    const seq={index:out.length,event:e,type,result:String(e.result||""),player,team,target:e.target||null,targetTeam:e.targetTeamSide||null,actionTime,resultTime,startTime:start,endTime:end};
    seq.context=tacticalContext(seq);
    seq.linkedInterception=findLinked(e,"INTERCEPTION",2);
    seq.linkedSave=findLinked(e,"SAVE",2);
    seq.linkedBlock=findLinked(e,"BLOCK",2);
    out.push(seq);
  }
  state.sequences=out;
}

function setupUi(){
  if(PUBLIC_MATCH)return;
  const card=document.querySelector(".detail-card"); if(!card)return;
  card.classList.add("sequence-review-active");
  const legacy=document.createElement("div");legacy.className="legacy-event-detail";
  while(card.firstChild)legacy.appendChild(card.firstChild);
  const tabs=document.createElement("div");tabs.className="sequence-review-tabs";tabs.innerHTML='<button type="button" data-tab="sequence" class="active">プレー解析</button><button type="button" data-tab="legacy">イベント詳細</button>';
  const panel=document.createElement("div");panel.className="sequence-review-panel";panel.id="sequenceReviewPanel";
  const audit=document.createElement("div");audit.className="sequence-review-panel audit-panel";audit.id="analysisAuditPanel";audit.hidden=true;
  card.append(tabs,panel,audit,legacy);legacy.hidden=true;
  tabs.addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b)return;state.activeTab=b.dataset.tab;tabs.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));panel.hidden=state.activeTab!=="sequence";audit.hidden=true;legacy.hidden=state.activeTab!=="legacy";});
  renderPanel();
}
function chips(items, cls="info"){return items.map(x=>`<span class="seq-chip ${cls}">${esc(x)}</span>`).join("");}
function evidenceLines(seq){
  const e=seq.event,lines=[];
  if(e.evidence?.sourceType)lines.push(`元ログ：${e.evidence.sourceType}`);
  if(e.evidence?.criterion)lines.push(`判定：${e.evidence.criterion}`);
  if(e.evidence?.resultReason)lines.push(`結果根拠：${e.evidence.resultReason}`);
  if(e.evidence?.nextHolder)lines.push(`次保持：${e.evidence.nextHolder}`);
  if(e.evidence?.inferredCollision){const x=e.evidence.inferredCollision;lines.push(`推定衝突：${x.player}（確信度 ${Math.round(num(x.confidence)*100)}%）`);}
  if(e.evidence?.woodwork)lines.push(`ゴール枠接触：${e.evidence.woodwork.post==="MIN"?"片側ポスト":"反対側ポスト"}`);
  if(e.flags?.progressive)lines.push("前進プレー");
  if(e.flags?.keyPass)lines.push("キーパス");
  if(e.flags?.assist)lines.push("アシスト");
  if(e.flags?.bigChance)lines.push("決定機");
  return lines;
}
function resultLines(seq){
  const lines=[];
  if(seq.type==="PASS"){
    if(seq.result==="SUCCESS")lines.push(`${seq.target||"味方"}へ到達`);
    if(seq.result==="FAILED"){
      const block=seq.event.evidence?.blockedBy;
      const cut=seq.linkedInterception?.player||seq.event.evidence?.interceptedBy;
      lines.push(block?`${block}がブロック`:cut?`${cut}がパスカット`:`${seq.target?`${seq.target}への`:""}パス失敗`);
    }
  }
  if(seq.type==="SHOT"){
    if(seq.result==="SAVED")lines.push(`${seq.target||seq.linkedSave?.player||"GK"}がセーブ`);
    if(seq.result==="BLOCKED")lines.push(`${seq.target||seq.linkedBlock?.player||"守備者"}がブロック`);
    if(seq.result==="GOAL")lines.push("ゴール");
    if(seq.result==="OFF_TARGET")lines.push("枠外");
    if(seq.result==="WOODWORK")lines.push("ポスト/バーに当たった");
  }
  if(seq.type==="DRIBBLE")lines.push(seq.result==="SUCCESS"?"保持を継続":seq.result==="FAILED"?"保持を失った":"結果未確定");
  return lines;
}

function canonicalSubEventText(x){
  const t=String(x?.type||"").toUpperCase();
  const who=x?.player?`${x.player} `:"";
  if(t==="HOLD")return "保持";
  if(t==="TACKLE_AGAINST")return `タックル（${x.player||"相手"}）：${x.result==="AVOIDED"?"回避":x.result==="LOST"?"奪われた":"結果不明"}`;
  if(t==="PASS")return `パス${x.target?`（${x.target}）`:""}：${x.result==="SUCCESS"?"成功":x.result==="FAILED"?"失敗":x.result||""}`;
  if(t==="SHOT")return `シュート${x.result?`：${x.result==="GOAL"?"ゴール":x.result==="SAVED"?"セーブ":x.result==="BLOCKED"?"ブロック":x.result==="OFF_TARGET"?"枠外":x.result==="WOODWORK"?"ポスト/バー":x.result}`:""}`;
  if(t==="BLOCK")return `${who}ブロック${x.source==="INFERRED"?`（推定${x.confidence!=null?` ${Math.round(num(x.confidence)*100)}%`:""}）`:""}`;
  if(t==="SAVE")return `${who}セーブ${x.source==="INFERRED"?`（推定${x.confidence!=null?` ${Math.round(num(x.confidence)*100)}%`:""}）`:""}`;
  if(t==="GOAL")return `ゴール${x.assistPlayer?`（アシスト：${x.assistPlayer}）`:""}`;
  if(t==="WOODWORK")return "ポスト/バー";
  if(t==="OUT")return x.result==="OFF_TARGET"?"枠外 → ラインアウト":"ラインアウト";
  if(t==="KICKOFF_KICK")return "キックオフ";
  if(t==="THROW_IN_KICK")return "スローイン再開";
  return `${who}${t}${x.result?`：${x.result}`:""}`;
}
function renderSubEvents(seq,now){
  const xs=(seq.subEvents||[]).filter(x=>num(x.time,seq.actionTime)<=now+0.001);
  if(!xs.length)return '<div class="seq-subtitle">再生位置までのサブイベントはありません。</div>';
  return `<ol class="seq-subevents">${xs.map(x=>`<li><span class="seq-sub-time">${fmt(num(x.time))}</span><span>${esc(canonicalSubEventText(x))}</span>${x.source==="INFERRED"?'<span class="seq-chip inferred">推定</span>':''}</li>`).join("")}</ol>`;
}

function shotCourseHtml(seq){
  if(String(seq.type||"").toUpperCase()!=="SHOT")return "";
  const ch=seq.event?.chance||{};
  if(!Number.isFinite(Number(ch.openXG??ch.score)))return "";
  const players=Array.isArray(ch.projection?.players)?ch.projection.players:[];
  const contribution=Array.isArray(ch.contributions)?ch.contributions:[];
  const contributionMap=new Map(contribution.map(x=>[`${x.relation}:${x.name}`,num(x.xgReduction)]));
  const playerRects=players.map(p=>{
    const min=Math.max(0,Math.min(1,num(p.viewMin??p.min))),max=Math.max(0,Math.min(1,num(p.viewMax??p.max)));
    const left=min*100,width=Math.max(2.5,(max-min)*100);
    const d=Math.max(0,num(p.distanceFromShooter));
    const depth=Number.isFinite(Number(p.depthFromShooter))?num(p.depthFromShooter):null;
    const height=depth!=null?Math.max(34,Math.min(88,88-depth*48)):Math.max(34,Math.min(82,84-d*1.25));
    const cls=p.relation==='GK'?'gk':p.relation==='TEAMMATE'?'mate':'def';
    const label=p.relation==='GK'?'GK':p.relation==='TEAMMATE'?'味方':'相手';
    const red=contributionMap.get(`${p.relation}:${p.name}`)||0;
    return `<span class="shot-lane-player ${cls}" style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%;height:${height.toFixed(1)}%" title="${esc(p.name)} / ${label} / xG影響 ${red.toFixed(3)}"><i>${esc(p.position||'')}</i></span>`;
  }).join('');
  const rows=contribution.filter(x=>num(x.xgReduction)>0).sort((a,b)=>num(b.xgReduction)-num(a.xgReduction)).map(x=>{
    const label=x.relation==='GK'?'GK':x.relation==='TEAMMATE'?'味方妨害':'DF';
    return `<div><span>${esc(label)} ${esc(x.name)}</span><b>-${num(x.xgReduction).toFixed(3)}</b></div>`;
  }).join('');
  return `<section class="seq-block seq-shot-course"><h3>シュートコース</h3>
    <div class="shot-lane-xg"><span>無人 open xG</span><b>${num(ch.openXG??ch.baseScore).toFixed(3)}</b><span>味方後</span><b>${num(ch.afterTeammate??ch.openXG).toFixed(3)}</b><span>DF後</span><b>${num(ch.afterDF??ch.score).toFixed(3)}</b><span>最終 xG</span><b>${num(ch.finalXG??ch.score).toFixed(3)}</b></div>
    <div class="shot-lane-view"><div class="shot-lane-goal">${playerRects}</div></div>
    <div class="shot-lane-legend"><span><i class="gk"></i>GK</span><span><i class="def"></i>相手FP</span><span><i class="mate"></i>味方</span><small>キッカーからゴールを見た正面。GKは橙、相手FPは青、味方は緑。遠いシュートでは手前の選手ほど投影範囲と遮断影響を大きく補正。</small></div>
    ${rows?`<div class="shot-lane-contrib">${rows}</div>`:''}
  </section>`;
}

function ratingNum(p){const v=Number(p?.rating?.value);return Number.isFinite(v)?v:null}
function signedRating(v){const n=Number(v||0);return `${n>=0?'+':''}${n.toFixed(2)}`}
function ratingBadge(p){
  const v=ratingNum(p);
  return v==null?'':`<span class="match-rating-badge ${p?.rating?.mom?'mom':''}" data-rating-player="${esc(p.name||'')}" title="${p?.rating?.mom?'MOM / ':''}${PUBLIC_MATCH?"プレー数":"採点内訳"}">${p?.rating?.mom?'★ ':''}${v.toFixed(2)}</span>`;
}

function ratingBreakdownTable(p,filter="all"){
 const rows=p?.rating?.playBreakdown||[],show=filter==="all"?rows:rows.filter(x=>x.category===filter);
 const signed=v=>{const n=Number(v||0);return `${n>0?"+":""}${n.toFixed(3)}`};
 if(!show.length)return '<div class="rating-event-empty">該当項目なし</div>';
 return `<table class="rating-event-table"><thead><tr><th>時刻</th><th>区分</th><th>項目</th><th>詳細</th><th>基本</th><th>状況</th><th>増減</th></tr></thead><tbody>${show.map(x=>`<tr><td>${esc(x.clock||"")}</td><td>${esc(x.group||"")}</td><td>${esc(x.type||"")}</td><td>${esc(x.detail||"")}</td><td class="${Number(x.baseValue)<0?"minus":"plus"}">${signed(x.baseValue)}</td><td class="${Number(x.contextValue)<0?"minus":"plus"}">${signed(x.contextValue)}</td><td class="${Number(x.value)<0?"minus":"plus"}"><b>${signed(x.value)}</b></td></tr>`).join("")}</tbody></table>`;
}
function ratingBreakdownFilters(p){
 const cats=["all",...new Set((p?.rating?.playBreakdown||[]).map(x=>x.category).filter(Boolean))];
 return cats.map(x=>`<button type="button" class="rating-event-filter ${x==="all"?"active":""}" data-rating-filter="${esc(x)}">${x==="all"?"すべて":esc(x)}</button>`).join("");
}

function positioningBreakdownHtml(p){
  if(String(p?.position||'').toUpperCase()==='GK')return '';
  const b=p?.rating?.positioningBreakdown;
  if(!b)return `<section class="positioning-breakdown"><h3>ポジショニング評価内訳</h3><div class="rating-event-empty">内訳データなし。build-ratings.js を再実行すると表示されます。</div></section>`;
  const parts=Array.isArray(b.parts)?b.parts:[];
  const rows=parts.map(x=>{
    const sec=Number(x.seconds||0),v=Number(x.contribution||0),rated=x.rated!==false,direct=Number.isFinite(Number(x.directMetric));
    return `<tr><td>${esc(x.label||x.key||'-')}</td><td>${direct?`${Number(x.directMetric).toFixed(3)} ${esc(x.unit||'')}`:sec.toFixed(0)+'s'}</td><td>${rated?`${Number(x.coefficient||0)>=0?'+':''}${Number(x.coefficient||0).toFixed(direct?3:5)}${direct?' / xG':'/s'}`:'参考のみ'}</td><td class="${v<0?'minus':'plus'}">${rated?signedRating(v):'—'}</td></tr>`;
  }).join('');
  const raw=Number(b.raw||0),applied=Number(b.applied||0),lim=b.limit||{};
  return `<section class="positioning-breakdown">
    <h3>ポジショニング評価内訳</h3>
    <table class="rating-event-table positioning-table"><thead><tr><th>項目</th><th>時間</th><th>係数</th><th>加点</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="positioning-total">
      <span>加点合計 <b class="${raw<0?'minus':'plus'}">${signedRating(raw)}</b></span>
      <span>採点反映 <b class="${applied<0?'minus':'plus'}">${signedRating(applied)}</b></span>
      ${b.capped?`<small>上限/下限補正あり（${signedRating(lim.min)} ～ ${signedRating(lim.max)}）</small>`:''}
    </div>
    <p class="rating-provisional">プレス時間は現在は参考値で、Position加点には使用していません。</p>
  </section>`;
}

function playCountsHtml(p){return '<h3>プレー数</h3><table class="rating-breakdown"><tbody>'+playerPlayCounts(p).map(r=>'<tr><td>'+esc(r.label)+'</td><td>'+(r.value??'—')+'</td></tr>').join('')+'</tbody></table>';}
function openRatingDetail(name){
  const p=(state.stats?.players||[]).find(x=>String(x.name)===String(name)); if(!p)return;
  const modal=byId("ratingDetailModal"),body=byId("ratingDetailBody"); if(!modal||!body)return;
  if(PUBLIC_MATCH){showPlayerPanel(body,{player:p,base});modal.hidden=false;return;}
  const r=p.rating||{}, c=r.categories||{}, so=p.scoreOrigins||{}, co=p.concedeOrigins||{};
  const avg=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}プレー`:'—';
  const rows=[
    ['シュート',c.shot],['パス',c.pass],['ドリブル',c.dribble],['タックル',c.tackle],
    ['カット/ブロック',c.defense],['セーブ',c.save],['得失点起点',c.origin]
  ].map(([label,v])=>`<tr><td>${label}</td><td class="${Number(v)<0?'minus':'plus'}">${signedRating(v)}</td></tr>`).join('');
  body.innerHTML=`<header class="rating-detail-head"><div><small>${positionBadges(p.positionLabel||p.position)} / ${esc(p.preset||'-')}</small><h2 id="ratingDetailTitle">${esc(p.name||'-')}</h2></div><strong>${ratingNum(p)?.toFixed(2)??'—'}</strong></header>
  ${playCountsHtml(p)}
  <div class="rating-summary-grid">
    <div><span>Ball</span><b>${signedRating(r.ball)}</b><small>-0.50 ～ +2.00</small></div>
    <div><span>Position</span><b>${signedRating(r.positioning)}</b></div>
    <div><span>Result</span><b>${signedRating(r.result)}</b></div>
  </div>
  ${positioningBreakdownHtml(p)}
  <h3>Ball 内訳</h3><table class="rating-breakdown"><tbody>${rows}</tbody></table>
  ${r.context?.situation?`<h3>状況加点</h3><table class="rating-breakdown"><tbody>
    <tr><td>ゴール</td><td>${signedRating(r.context.situation.goal)}</td></tr>
    <tr><td>セーブ</td><td>${signedRating(r.context.situation.save)}</td></tr>
    <tr><td>アシスト</td><td>${signedRating(r.context.situation.assist)}</td></tr>
    <tr><td>KP</td><td>${signedRating(r.context.situation.keyPass)}</td></tr>
    <tr><td>起点</td><td>${signedRating(r.context.situation.origin)}</td></tr>
  </tbody></table>`:''}
  <div class="rating-origin-grid">
    <div><span>得点起点</span><b>${Number(so.count||0)}回</b><small>平均 ${avg(so.avgDistance)} / 3プレー以内 ${Number(so.shortCount||0)}回</small></div>
    <div><span>失点起点</span><b>${Number(co.count||0)}回</b><small>平均 ${avg(co.avgDistance)} / 3プレー以内 ${Number(co.shortCount||0)}回</small></div>
  </div>
  <h3 class="rating-event-title">プレー別採点</h3>
  <div class="rating-event-filters">${ratingBreakdownFilters(p)}</div>
  <div id="ratingPlayBreakdownHost">${ratingBreakdownTable(p)}</div>
  <p class="rating-provisional">採点は現在 provisional / trial-v6 quality / consistency（調整中）です。</p>`;
  const analysisHtml=body.innerHTML;showPlayerPanel(body,{player:p,base,analysisHtml});modal.hidden=false;
}
function closeRatingDetail(){const m=byId("ratingDetailModal");if(m)m.hidden=true}

function renderMatchStats(){
  const root=byId("statsBroadcast"); if(!root)return;
  const st=state.stats; if(!st){root.innerHTML='<div class="seq-empty">stats.json を読み込めませんでした。</div>';return;}
  const teams=st.teams||{}, west=teams.TEAM_WEST||{}, east=teams.TEAM_EAST||{};
  const players=Array.isArray(st.players)?st.players:[];
  const pe=Array.isArray(state.playEvents)?state.playEvents:[];
  const goals=pe.filter(e=>eventType(e)==="SHOT"&&String(e.result)==="GOAL").sort((a,b)=>eventTime(a)-eventTime(b));
  const wg=num(west.shots?.goals),eg=num(east.shots?.goals);
  const halfOf=t=>num(t)<300?1:2;
  const halfTime=t=>halfOf(t)===1?num(t):Math.max(0,num(t)-300);
  const halfLabel=t=>`前半 ${fmt(halfTime(t))}`;
  const goalSideScore=(half,side)=>goals.filter(g=>halfOf(eventTime(g))===half&&g.teamSide===side).length;
  const westH1=goalSideScore(1,'TEAM_WEST'), eastH1=goalSideScore(1,'TEAM_EAST');
  const westH2=goalSideScore(2,'TEAM_WEST'), eastH2=goalSideScore(2,'TEAM_EAST');
  const metric=(label,w,e,fmtv=v=>String(v??0))=>{const wn=num(w),en=num(e),tot=Math.max(1,wn+en),wp=wn/tot*100,ep=100-wp;return `<div class="broadcast-metric"><b class="west-stat-value">${esc(fmtv(w))}</b><div class="broadcast-metric-center"><span>${esc(label)}</span><div class="broadcast-bar team-color-bar"><i class="west" style="width:${wp.toFixed(1)}%"></i><i class="east" style="width:${ep.toFixed(1)}%"></i></div></div><b class="east-stat-value">${esc(fmtv(e))}</b></div>`};
  const posOrder={GK:0,DF:1,MF:2,FW:3};
  const presetLabel=p=>String(p.preset||'').replace(/^(gk|df|mf|fw)_/i,'').replaceAll('_',' ');
  const rowPlayer=p=>`<div class="broadcast-player">${positionBadges(p.positionLabel||p.position)}<button type="button" class="player-main rating-player-open" data-rating-player="${esc(p.name||'')}"><span class="player-name-line"><b>${esc(p.name)}</b>${ratingBadge(p)}</span>${p.preset?`<small>${esc(presetLabel(p))}</small>`:''}</button><span>${p.shots?.goals?`⚽${p.shots.goals} `:''}${p.assists?`A${p.assists} `:''}${p.saves?.total?`SV${p.saves.total}`:''}</span></div>`;
  const sortPlayers=(a,b)=>(posOrder[String(a.initialPosition||a.position||'').toUpperCase()]??99)-(posOrder[String(b.initialPosition||b.position||'').toUpperCase()]??99)||String(a.name||'').localeCompare(String(b.name||''));
  const wp=players.filter(p=>p.teamSide==='TEAM_WEST').sort(sortPlayers);
  const ep=players.filter(p=>p.teamSide==='TEAM_EAST').sort(sortPlayers);
  const pseudoXg=side=>teams[side]?.shots?.xg??teams[side]?.xG??0;
  const defenseActions=t=>num(t.interceptionsWon)+num(t.blocks);
  const km=v=>`${(num(v)/1000).toFixed(2)} km`;
  let sw=0,se=0;
  const goalRows=goals.map(g=>{
    if(g.teamSide==='TEAM_WEST')sw++; else se++;
    const westGoal=g.teamSide==='TEAM_WEST';
    const westCell=westGoal?`<b>${esc(g.player||'-')}</b>${g.assistPlayer?`<small>(${esc(g.assistPlayer)})</small>`:''}`:'';
    const eastCell=!westGoal?`<b>${esc(g.player||'-')}</b>${g.assistPlayer?`<small>(${esc(g.assistPlayer)})</small>`:''}`:'';
    return `<div class="broadcast-goal-row"><span class="goal-time"><small>${halfOf(eventTime(g))===1?'前半':'後半'}</small>${fmt(halfTime(eventTime(g)))}</span><span class="goal-west">${westCell}</span><strong class="goal-score">${sw} - ${se}</strong><span class="goal-east">${eastCell}</span></div>`;
  }).join('');
  const formationTeam=(plist,side)=>{
    const byPos={GK:[],DF:[],MF:[],FW:[]};
    plist.forEach(p=>{const pos=String(p.initialPosition||p.position||'').toUpperCase();if(byPos[pos])byPos[pos].push(p);});
    const cols=side==='west'?['GK','DF','MF','FW']:['FW','MF','DF','GK'];
    return cols.map(pos=>`<div class="formation-col ${pos.toLowerCase()}"><div class="formation-pos-label">${pos}</div><div class="formation-stack">${byPos[pos].map(p=>`<div class="formation-player ${side}"><span>${esc(p.name)}</span>${p.preset?`<small>${esc(presetLabel(p))}</small>`:''}</div>`).join('')}</div></div>`).join('');
  };
  root.innerHTML=`<section class="broadcast-score"><div class="broadcast-team west">WEST</div><div class="broadcast-score-main"><div class="score-total"><strong>${wg}</strong><span>−</span><strong>${eg}</strong></div><div class="score-halves"><span>前半</span><b>${westH1} - ${eastH1}</b><span>後半</span><b>${westH2} - ${eastH2}</b></div></div><div class="broadcast-team east">EAST</div></section>
  <section class="broadcast-grid"><div class="broadcast-squad west"><h3>WEST</h3>${wp.map(rowPlayer).join('')}</div><div class="broadcast-center"><h3>MATCH STATS</h3>${metric('ポゼッション',west.possession?.percent,east.possession?.percent,v=>`${num(v).toFixed(0)}%`)}${metric('シュート',west.shots?.attempts,east.shots?.attempts)}${metric('枠内シュート',west.shots?.onTarget,east.shots?.onTarget)}${metric('決定機',west.shots?.bigChances,east.shots?.bigChances)}${metric('xG',pseudoXg('TEAM_WEST'),pseudoXg('TEAM_EAST'),v=>num(v).toFixed(2))}${metric('パス成功',west.passes?.successful,east.passes?.successful)}${metric('タックル成功',west.tacklesWon,east.tacklesWon)}${metric('カット＋ブロック',defenseActions(west),defenseActions(east))}${metric('走行距離',west.runningDistance,east.runningDistance,km)}</div><div class="broadcast-squad east"><h3>EAST</h3>${ep.map(rowPlayer).join('')}</div></section>
  <section class="broadcast-goals"><h3>得点経過</h3><div class="broadcast-goal-head"><span>時間</span><span>WEST 得点（アシスト）</span><span>スコア</span><span>EAST 得点（アシスト）</span></div>${goalRows||'<div class="muted">得点なし</div>'}</section>
  <section class="broadcast-formation"><h3>FORMATION</h3><div class="formation-pitch"><div class="formation-half west">${formationTeam(wp,'west')}</div><div class="formation-center-line"></div><div class="formation-half east">${formationTeam(ep,'east')}</div></div></section>`;
}

function renderPanel(){
  const root=byId("sequenceReviewPanel");if(!root)return;
  const s=state.sequences[state.current];
  if(!s){root.innerHTML='<div class="seq-empty">再生位置に対応する解析済みプレーがありません。</div>';return;}
  const now=state.currentTime;
  const beforeAction=now+0.001<s.actionTime;
  const beforeResult=now+0.001<(s.resultTime??s.actionTime);
  const d=describe(s),ctx=s.context||{freeForward:[],freeBackward:[],marks:[],pressers:[]};
  // Never reveal an action or its outcome before playback has reached that timestamp.
  const ev=beforeResult?[]:evidenceLines(s),res=beforeResult?[]:resultLines(s);
  // Chance quality is known at the instant of the shot.  Do not hide it until the
  // terminal result (SAVE/GOAL/OUT) arrives.
  const chance=beforeAction?null:s.event.chance;
  let heading=(s.canonical&&String(s.canonical.kind||"").toUpperCase()==="HOLD")?`${s.player||"-"}の保持`:(s.canonical?.title || (beforeAction?`${s.player||"-"} 保持`:d.title));
  let subtitle=beforeAction?"プレー前の状況":beforeResult?"結果待ち":d.subtitle;
  if(!beforeAction&&beforeResult){
    if(s.type==="PASS")heading=`${s.player}のパス${s.target?`（${s.target}）`:""}`;
    else if(s.type==="DRIBBLE")heading=`${s.player} ドリブル`;
    else if(s.type==="TACKLE")heading=`${s.player} タックル`;
  }
  root.innerHTML=`
    <div class="seq-nav"><button type="button" id="seqPrev">◀ 前のプレー</button><button type="button" id="seqNext">次のプレー ▶</button></div>
    <div class="seq-mode"><label><input type="checkbox" id="seqAutoStop" ${state.autoStop?"checked":""}> 1プレーごとに停止</label><span>${state.current+1} / ${state.sequences.length}</span></div>
    <div class="seq-time">${fmt(s.startTime)}–${fmt(s.endTime)} <span class="seq-current-badge">現在 ${fmt(now)}</span></div>
    <div class="seq-title">${esc(heading)}</div><div class="seq-subtitle">${esc(subtitle)}</div>
    ${s.canonical?`<section class="seq-block"><h3>プレー内イベント</h3>${renderSubEvents(s,now)}</section>`:""}
    <section class="seq-block"><h3>保持・プレー直前の状況</h3>
      ${ctx.freeForward.length?`<div class="seq-chip-row"><span class="seq-label">前方フリー</span>${chips(ctx.freeForward,"free-forward")}</div>`:'<div class="seq-subtitle">前方フリー判定なし</div>'}
      ${ctx.freeBackward.length?`<div class="seq-chip-row" style="margin-top:5px"><span class="seq-label">後方フリー</span>${chips(ctx.freeBackward,"free-backward")}</div>`:""}
      ${ctx.pressers.length?`<div class="seq-chip-row" style="margin-top:5px"><span class="seq-label">プレッシャー</span>${chips(ctx.pressers,"bad")}</div>`:""}
      ${ctx.marks.length?`<ul class="seq-list">${ctx.marks.map(m=>`<li>マーク：${esc(m.defender)} → ${esc(m.attacker)}</li>`).join("")}</ul>`:""}
    </section>
    ${renderTrialMetrics(s)}
    ${beforeAction?'<section class="seq-block"><h3>プレー結果</h3><div class="seq-subtitle">再生がプレー時刻に到達すると表示します。</div></section>':beforeResult?'<section class="seq-block"><h3>プレー結果</h3><div class="seq-subtitle">結果が確定する時刻まで再生すると表示します。</div></section>':`<section class="seq-block"><h3>プレー結果</h3>${res.length?`<ul class="seq-list">${res.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:'<div class="seq-subtitle">解析済み結果を表示</div>'}</section>`}
    ${(!beforeAction&&(chance||ev.length))?`<section class="seq-block"><h3>解析・評価</h3>${chance?`<div class="seq-score"><span>最終xG</span><b>${num(chance.score).toFixed(3)}</b><span>無人open xG</span><b>${num(chance.openXG??chance.baseScore??chance.score).toFixed(3)}</b><span>距離</span><b>${num(chance.distance).toFixed(1)}</b><span>ゴール角度</span><b>${num(chance.goalAngleDeg).toFixed(1)}°</b><span>空きゴール幅</span><b>${Math.round(num(chance.openGoalRatio)*100)}%</b></div>`:""}${ev.length?`<ul class="seq-list">${ev.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}${s.event.evidence?.inferredCollision?'<div class="seq-inferred">接触ログが無いため、軌道変化と選手位置から推定した判定を含みます。</div>':""}</section>`:""}
    ${!beforeAction?shotCourseHtml(s):""}
    <div class="seq-actions"><button type="button" id="seqSeekStart">プレー開始へ</button><button type="button" id="seqPlay">このプレーを再生</button></div>`;
  byId("seqPrev")?.addEventListener("click",()=>jumpSequence(state.current-1,true));
  byId("seqNext")?.addEventListener("click",()=>jumpSequence(state.current+1,true));
  byId("seqSeekStart")?.addEventListener("click",()=>seekMatchTime(s.actionTime,true));
  byId("seqPlay")?.addEventListener("click",()=>{seekMatchTime(s.actionTime,false);setTimeout(()=>byId("play")?.click(),0);});
  byId("seqAutoStop")?.addEventListener("change",e=>state.autoStop=e.target.checked);
}

function parseClockText(text){
  const m=String(text||"").match(/(\d+):(\d{2})/);if(!m)return null;return Number(m[1])*60+Number(m[2]);
}
function viewerMatchTime(){
  // #range is virtual playback time (intervals/restarts are compressed/expanded), not
  // match_time. The main viewer's clock/half labels are the authoritative match clock.
  const c=parseClockText(byId("clock")?.textContent);
  if(c==null)return state.currentTime;
  const half=String(byId("half")?.textContent||"");
  return c+(half.includes("後半")?300:0);
}
function seekMatchTime(t,pause=true){
  // Let the main viewer perform match_time -> virtual-time conversion by invoking its
  // own event-row navigation. This avoids writing raw match_time into #range.
  const rows=[...document.querySelectorAll("tr.event[data-time]")];
  const exact=rows.find(r=>Math.abs(num(r.dataset.time)-t)<0.001);
  const prior=rows.filter(r=>num(r.dataset.time)<=t).sort((a,b)=>num(b.dataset.time)-num(a.dataset.time))[0];
  const target=exact||prior;
  if(target){target.click();if(pause)byId("pause")?.click();setTimeout(()=>updateCurrent(viewerMatchTime(),true),0);return;}
  if(pause)byId("pause")?.click();
}
function jumpSequence(i,pause=true){
  if(!state.sequences.length)return;
  i=Math.max(0,Math.min(state.sequences.length-1,i));
  const target=state.sequences[i];
  state.current=i;
  // Navigation is INDEX based.  Time is only used to move the replay.  This prevents
  // a same-second DIRECT_SHOT from being skipped by a later restart/pass.
  state.manualSequence={index:i,clockSecond:Math.floor(target.actionTime)};
  const now=viewerMatchTime();
  if(Math.floor(now)===Math.floor(target.actionTime)){
    if(pause)byId("pause")?.click();
    state.currentTime=now;
    renderPanel();
    return;
  }
  seekMatchTime(target.actionTime,pause);
  renderPanel();
}
function sequenceForTime(t){
  const sec=Math.floor(t+1e-6);
  const sameSecond=[];
  for(let i=0;i<state.sequences.length;i++){
    const s=state.sequences[i],action=num(s.actionTime,s.startTime);
    if(Math.floor(action+1e-6)===sec && action<=t+0.9999)sameSecond.push(i);
  }
  if(sameSecond.length){
    // HOLD_TO_SHOT is a bridge, not the terminal view for the shot second.  Once the
    // SHOT exists at that second, show the SHOT (then its causally-linked SAVE/BLOCK),
    // otherwise users see only "Xの保持" for the whole second and the shot disappears.
    const actionable=sameSecond.filter(i=>{
      const c=state.sequences[i].canonical;
      return !(String(c?.kind||'').toUpperCase()==='HOLD'&&String(c?.result||'')==='HOLD_TO_SHOT');
    });
    const pool=actionable.length?actionable:sameSecond;
    pool.sort((ia,ib)=>{
      const a=state.sequences[ia],b=state.sequences[ib];
      const ak=String(a.canonical?.kind||a.type||'').toUpperCase(),bk=String(b.canonical?.kind||b.type||'').toUpperCase();
      // Causal presentation priority for identical action time.
      const pri=k=>k==='SHOT'?0:k==='SAVE'||k==='BLOCK'?1:k==='PASS'?2:k==='RESTART'?3:4;
      return num(a.actionTime)-num(b.actionTime)||pri(ak)-pri(bk)
        ||num(a.canonical?.presentationIndex,a.sourceIndex??ia)-num(b.canonical?.presentationIndex,b.sourceIndex??ib)||ia-ib;
    });
    return pool[0];
  }
  for(let i=0;i<state.sequences.length;i++){
    const s=state.sequences[i];
    if(s.startTime<=t+0.0005 && t<s.endTime-0.0005)return i;
  }
  return -1;
}
function updateCurrent(t,force=false){
  state.currentTime=t;
  if(state.manualSequence){
    const ms=state.manualSequence,seq=state.sequences[ms.index];
    if(seq&&Math.floor(t)===ms.clockSecond){
      state.current=ms.index;renderPanel();state.lastRangeTime=t;return;
    }
    state.manualSequence=null;
  }
  const idx=sequenceForTime(t);
  if(idx!==state.current||force){state.current=idx;renderPanel();}
  else if(state.current>=0){renderPanel();}
  const s=state.sequences[state.current];
  if(state.autoStop&&s&&state.lastRangeTime<s.endTime&&t>=s.endTime-0.03){byId("pause")?.click();}
  state.lastRangeTime=t;
}


const AUDIT_RAW_TYPES=new Set(["GOAL","SHOT","DIRECT_SHOT","POWER_KICK","AUTO_PASS","DIRECT_KICK","HOLD_ACQUIRE","BALL_OUT","TACKLE_PLAYER_SUCCESS","TACKLE_BALL_SUCCESS","TACKLE_PLAYER_FAILED","TACKLE_BALL_FAILED"]);
function rawEventId(e){return num(val(e,"event_id","id"),-1);}
function rawDescription(e){
  const t=eventType(e),p=playerName(e)||"-";
  if(t==="BALL_OUT") return `${t} ${String(val(e,"detail_json","detail","result")||"")}`;
  return `${t} ${p}`;
}
function semanticMatches(raw){
  const rt=eventType(raw),time=eventTime(raw),player=playerName(raw),team=teamSide(raw);
  const near=state.playEvents.filter(e=>Math.abs(eventTime(e)-time)<=0.55 && (!player||playerName(e)===player||e.target===player) && (!team||!teamSide(e)||teamSide(e)===team));
  if(rt==="GOAL") return near.filter(e=>eventType(e)==="SHOT"&&String(e.result)==="GOAL");
  if(rt==="SHOT"||rt==="DIRECT_SHOT") return near.filter(e=>["SHOT","PASS"].includes(eventType(e)));
  if(rt==="HOLD_ACQUIRE") return near.filter(e=>eventType(e)==="PASS"&&String(e.result)==="SUCCESS" || ["DRIBBLE","TACKLE","INTERCEPTION"].includes(eventType(e)));
  if(rt==="BALL_OUT") return state.playEvents.filter(e=>Math.abs(eventTime(e)-time)<=1.05&&(["SHOT","PASS"].includes(eventType(e))||e.flags?.setPlay));
  if(rt==="DIRECT_KICK") return near.filter(e=>["PASS","SHOT","SAVE","BLOCK","INTERCEPTION"].includes(eventType(e)));
  if(rt.startsWith("TACKLE_")) return near.filter(e=>["TACKLE","DRIBBLE"].includes(eventType(e)));
  if(["POWER_KICK","AUTO_PASS"].includes(rt)) return near.filter(e=>["PASS","SHOT"].includes(eventType(e)));
  return near;
}
function conversionText(matches){
  if(!matches.length)return "解析なし";
  return [...new Set(matches.map(e=>{
    const t=eventType(e),r=String(e.result||"");
    const target=e.target?`→${e.target}`:"";
    return `${t}${r?`/${r}`:""}${target}`;
  }))].join(" / ");
}
function buildAudit(){
  const sourceMap=new Map();
  for(const pe of state.playEvents){for(const id of sourceIds(pe)){const k=num(id,-1);if(k<0)continue;if(!sourceMap.has(k))sourceMap.set(k,[]);sourceMap.get(k).push(pe);}}
  const rows=[];
  for(const raw of state.rawEvents){
    const rt=eventType(raw);if(!AUDIT_RAW_TYPES.has(rt))continue;
    const id=rawEventId(raw),exact=sourceMap.get(id)||[],semantic=exact.length?[]:semanticMatches(raw),matches=exact.length?exact:semantic;
    let level=matches.length?"ok":"warn",reason=matches.length?(exact.length?"sourceEventIdsで対応":"時刻・選手から対応") : "対応する解析プレーが見つからない";
    if(rt==="GOAL"){
      const goals=matches.filter(e=>eventType(e)==="SHOT"&&String(e.result)==="GOAL");
      const displaySeq=state.reviewSequences.find(s=>(s.sourceEventIds||[]).map(Number).includes(id) && (String(s.result||"")==="GOAL" || (s.subEvents||[]).some(x=>String(x.type||"").toUpperCase()==="GOAL")));
      if(!goals.length){level="error";reason="GOALログに対応するGOAL解析がない";}
      else if(state.reviewSequences.length&&!displaySeq){level="error";reason="GOAL解析はあるが表示用プレーシーケンスがない";}
      else{level="ok";reason=displaySeq?"GOALログ・解析・表示シーケンスが対応":"GOALログとGOAL解析が対応";}
    }
    if((rt==="SHOT"||rt==="DIRECT_SHOT")&&matches.length){
      const valid=matches.some(e=>eventType(e)==="SHOT" || eventType(e)==="PASS");
      if(!valid){level="error";reason="SHOTログの変換先がSHOT/PASSではない";}
    }
    if(rt==="BALL_OUT"&&!matches.length){level="warn";reason="BALL_OUTの原因プレーが解析から追えない";}
    rows.push({raw,id,time:eventTime(raw),type:rt,player:playerName(raw)||"-",level,reason,matches,conversion:conversionText(matches),exact:exact.length>0});
  }
  // GOAL count is a hard integrity invariant.
  const rawGoals=state.rawEvents.filter(e=>eventType(e)==="GOAL").length;
  const parsedGoals=state.playEvents.filter(e=>eventType(e)==="SHOT"&&String(e.result)==="GOAL").length;
  if(rawGoals!==parsedGoals){rows.unshift({id:-999,time:0,type:"GOAL_COUNT",player:"-",level:"error",reason:`GOAL件数不一致: 生ログ ${rawGoals} / 解析 ${parsedGoals}`,matches:[],conversion:"全試合内のGOAL対応を確認",exact:false});}
  state.audit=rows.sort((a,b)=>(a.time-b.time)||(a.id-b.id));
}
function auditStats(){
  const total=state.audit.filter(x=>x.type!=="GOAL_COUNT").length;
  const error=state.audit.filter(x=>x.level==="error").length;
  const warn=state.audit.filter(x=>x.level==="warn").length;
  const ok=state.audit.filter(x=>x.level==="ok").length;
  const rawGoals=state.rawEvents.filter(e=>eventType(e)==="GOAL").length;
  const parsedGoals=state.playEvents.filter(e=>eventType(e)==="SHOT"&&String(e.result)==="GOAL").length;
  return {total,error,warn,ok,rawGoals,parsedGoals};
}
function renderAudit(){
  const root=byId("analysisAuditPanel");if(!root)return;
  const st=auditStats();
  const rows=(state.auditOnlyIssues?state.audit.filter(x=>x.level!=="ok"):state.audit).slice(0,350);
  const badge=(x)=>x.level==="error"?'<span class="audit-badge error">NG</span>':x.level==="warn"?'<span class="audit-badge warn">要確認</span>':'<span class="audit-badge ok">OK</span>';
  root.innerHTML=`
    <div class="audit-summary">
      <div><span>GOAL</span><b class="${st.rawGoals===st.parsedGoals?'ok-text':'error-text'}">${st.parsedGoals} / ${st.rawGoals}</b><small>解析 / 生ログ</small></div>
      <div><span>NG</span><b class="error-text">${st.error}</b><small>確定ログとの不整合</small></div>
      <div><span>要確認</span><b class="warn-text">${st.warn}</b><small>対応先を確認</small></div>
      <div><span>対応済み</span><b>${st.ok}</b><small>/ ${st.total}</small></div>
    </div>
    <div class="audit-toolbar"><label><input id="auditOnlyIssues" type="checkbox" ${state.auditOnlyIssues?'checked':''}> 要確認だけ表示</label><span>行をクリックするとその時刻へ移動</span></div>
    ${rows.length?`<div class="audit-list">${rows.map(x=>`<button type="button" class="audit-row ${x.level}" data-audit-time="${x.time}">
      <span class="audit-time">${fmt(x.time)}</span>${badge(x)}
      <span class="audit-raw"><b>${esc(x.type)}</b> ${esc(x.player)}</span>
      <span class="audit-conversion">${esc(x.conversion)}</span>
      <span class="audit-reason">${esc(x.reason)}${x.id>=0?` · raw #${x.id}`:''}</span>
    </button>`).join("")}</div>`:'<div class="audit-empty">要確認項目はありません。</div>'}
    <p class="audit-note">GOALは生ログとの件数一致を必須チェック。SHOT/DIRECT_SHOTはSHOTとして残るか、根拠付きでPASSへ再分類されていれば消化済みとします。黄色は推定対応なので実再生で確認推奨です。</p>`;
  byId("auditOnlyIssues")?.addEventListener("change",e=>{state.auditOnlyIssues=e.target.checked;renderAudit();});
  root.querySelectorAll("[data-audit-time]").forEach(b=>b.addEventListener("click",()=>{const t=num(b.dataset.auditTime);state.activeTab="sequence";document.querySelector('.sequence-review-tabs button[data-tab="sequence"]')?.click();seekMatchTime(t,true);setTimeout(()=>updateCurrent(viewerMatchTime(),true),0);}));
}
function matchingPassForRow(row){
  const cells=row.querySelectorAll("td"); if(cells.length<4)return null;
  if(String(cells[1].textContent||"").trim().toUpperCase()!=="PASS")return null;
  const player=String(cells[2].textContent||"").trim();
  const t=num(row.dataset.time,NaN);
  const candidates=state.playEvents.filter(e=>eventType(e)==="PASS"&&playerName(e)===player&&(!Number.isFinite(t)||Math.abs(eventTime(e)-t)<0.51));
  return candidates.sort((a,b)=>Math.abs(eventTime(a)-t)-Math.abs(eventTime(b)-t)||primarySourceId(a)-primarySourceId(b))[0]||null;
}
function rewritePassLogRows(){
  for(const row of document.querySelectorAll("#events tr.event, #events tr")){
    const pe=matchingPassForRow(row); if(!pe)continue;
    const cells=row.querySelectorAll("td"); if(cells.length<4)continue;
    const result=String(pe.result||"");
    const target=pe.target?`（${pe.target}）`:"";
    const label=result==="SUCCESS"?"パス成功":result==="FAILED"?"パス失敗":result==="OUT"?"パス失敗":"パス未確定";
    cells[3].textContent=`${playerName(pe)}の${label}${target}`;
  }
}
function observeEventLog(){
  const body=byId("events"); if(!body)return;
  rewritePassLogRows();
  new MutationObserver(()=>rewritePassLogRows()).observe(body,{childList:true,subtree:true,characterData:true});
}


function setupMainTabs(){
  const buttons=[...document.querySelectorAll('[data-main-tab]')];
  const panels=[...document.querySelectorAll('[data-main-panel]')];
  const activate=name=>{
    if(PUBLIC_MATCH&&name==='logs')return;
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.mainTab===name));
    panels.forEach(p=>p.hidden=p.dataset.mainPanel!==name);
    if(name==='logs'){renderSequenceLog();renderAuditLog();}
    if(name==='stats')renderMatchStats();
  };
  buttons.forEach(b=>b.addEventListener('click',()=>activate(b.dataset.mainTab)));
  activate('stats');

  const logButtons=[...document.querySelectorAll('[data-log-tab]')];
  const logPanels=[...document.querySelectorAll('[data-log-panel]')];
  logButtons.forEach(b=>b.addEventListener('click',()=>{
    logButtons.forEach(x=>x.classList.toggle('active',x===b));
    logPanels.forEach(p=>p.hidden=p.dataset.logPanel!==b.dataset.logTab);
    if(b.dataset.logTab==='sequences')renderSequenceLog();
    if(b.dataset.logTab==='audit')renderAuditLog();
  }));
}
function canonicalResultText(s){
  const r=String(s.result||'');
  if(r==='PASS_SUCCESS'||r==='SUCCESS')return '成功';
  if(r==='PASS_FAILED'||r==='FAILED')return '失敗';
  if(r==='SAVED')return 'セーブ';if(r==='BLOCKED')return 'ブロック';if(r==='GOAL')return 'ゴール';if(r==='OFF_TARGET')return '枠外';if(r==='WOODWORK')return 'ポスト/バー';
  return r||'-';
}
function renderSequenceLog(){
  const root=byId('sequenceLogPanel');if(!root)return;
  const rows=state.sequences.map((s,i)=>{
    const c=s.canonical||{},kind=String(c.kind||s.type||'').toUpperCase();
    const chance=s.event?.chance,flags=s.event?.flags||{};
    const trial=[];
    if(flags.keyPass)trial.push('KP');
    if(flags.assist)trial.push('A連動');
    if(flags.progressive)trial.push('Prog');
    if(flags.bigChance)trial.push('決定機');
    if(flags.bigChancePrevented)trial.push('決定機阻止');
    const meta=[kind,canonicalResultText(c),chance?`xG* ${num(chance.score).toFixed(3)}`:'',...trial].filter(Boolean).join(' · ');
    return `<button type="button" class="sequence-log-row ${i===state.current?'current':''}" data-seq-log-index="${i}"><span class="sequence-log-index">#${i+1}</span><span class="sequence-log-time">${fmt(s.actionTime)}</span><span class="sequence-log-title">${esc(c.title||`${s.player||'-'} ${kind}`)}</span><span class="sequence-log-meta">${esc(meta)}</span></button>`;
  });
  root.innerHTML=rows.join('')||'<div class="seq-empty">シーケンスがありません。</div>';
  root.querySelectorAll('[data-seq-log-index]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelector('[data-main-tab="replay"]')?.click();
    jumpSequence(num(b.dataset.seqLogIndex),true);
  }));
}
function renderAuditLog(){
  const dst=byId('analysisAuditLogPanel');if(!dst)return;
  renderAudit();
  const src=byId('analysisAuditPanel');
  if(src)dst.innerHTML=src.innerHTML;
  dst.querySelectorAll('[data-audit-time]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelector('[data-main-tab="replay"]')?.click();
    const t=num(b.dataset.auditTime);seekMatchTime(t,true);setTimeout(()=>updateCurrent(viewerMatchTime(),true),0);
  }));
  dst.querySelector('#auditOnlyIssues')?.addEventListener('change',e=>{state.auditOnlyIssues=e.target.checked;renderAuditLog();});
}
async function init(){
  setupUi();
  setupMainTabs();
  try{
    if(PUBLIC_MATCH){const [stats,pe]=await Promise.all([fetchJson('stats.json'),fetchJson('play-events.json')]);state.stats=stats;state.playEvents=normalizePlayEvents(pe);renderMatchStats();return;}
    let pe=null,raw=null,sn=null,rs=null,stats=null;
    for(let generationTry=0;generationTry<3;generationTry++){
      [pe,raw,sn,rs,stats]=await Promise.all([fetchJson("play-events.json",true,generationTry),fetchJson("events.json",true,generationTry),fetchJson("snapshots.json",true,generationTry),fetchJson("play-sequences.json",true,generationTry),fetchJson("stats.json",true,generationTry)]);
      const peRev=pe?.analysisRevision||pe?.buildRevision||null, rsRev=rs?.analysisRevision||rs?.buildRevision||null;
      if(!pe || !rs || !peRev || !rsRev || peRev===rsRev) break;
      console.warn("analysis generation mismatch; retrying",{peRev,rsRev,generationTry});
      await new Promise(r=>setTimeout(r,180*(generationTry+1)));
    }
    if(!pe){byId("sequenceReviewPanel").innerHTML='<div class="seq-empty"><b>play-events.json がありません。</b><br>Analyticsを再ビルドするとプレー解析を表示できます。</div>';return;}
    if(pe&&rs&&pe.analysisRevision&&rs.analysisRevision&&pe.analysisRevision!==rs.analysisRevision){
      rs=null; // 世代不一致の解析JSONで画面全体を壊さず、旧play-eventsフォールバックへ
      console.warn("play-sequences revision mismatch; canonical review disabled for this load");
    }
    state.playEvents=normalizePlayEvents(pe);state.rawEvents=normalizeRawEvents(raw||[]);state.snapshots=normalizeSnapshots(sn||[]);state.reviewSequences=normalizeReviewSequences(rs||[]);state.stats=stats;buildSequences();buildAudit();renderSequenceLog();renderAuditLog();renderMatchStats();
    observeEventLog();
    const t=viewerMatchTime();updateCurrent(t,true);
    byId("range")?.addEventListener("input",()=>{state.manualSequence=null;setTimeout(()=>updateCurrent(viewerMatchTime(),true),0);});
    byId("play")?.addEventListener("click",()=>{state.manualSequence=null;});
    // Poll the authoritative match clock, not the virtual playback slider.
    setInterval(()=>updateCurrent(viewerMatchTime()),40);
  }catch(e){console.error("sequence review init failed",e);(byId("sequenceReviewPanel")||byId("statsBroadcast")).innerHTML=`<div class="seq-empty">読込に失敗しました。<br>${esc(e.message)}</div>`;}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();

document.addEventListener("click",e=>{
  const filter=e.target.closest("[data-rating-filter]");
  if(filter){
    document.querySelectorAll(".rating-event-filter").forEach(b=>b.classList.toggle("active",b===filter));
    const name=document.getElementById("ratingDetailTitle")?.textContent||"";
    const p=(state.stats?.players||[]).find(x=>String(x.name)===String(name));
    const host=document.getElementById("ratingPlayBreakdownHost");
    if(p&&host)host.innerHTML=ratingBreakdownTable(p,filter.dataset.ratingFilter);
    return;
  }
  const hit=e.target.closest("[data-rating-player]");
  if(hit){e.preventDefault();e.stopPropagation();openRatingDetail(hit.dataset.ratingPlayer);return;}
  if(e.target.closest("[data-rating-close]"))closeRatingDetail();
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeRatingDetail()});
