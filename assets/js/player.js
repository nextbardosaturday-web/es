import {minutesText,positionBadges} from './appearance-format.mjs';
import {selectPositionAppearance} from './position-stints.mjs';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const requestedId=params.get("id")||params.get("name")||"";
let data=null,category="official",selectedPresets=new Set(),selectedPositions=new Set(["GK","DF","MF","FW"]),profilePosition="DF";
const get=(o,p,d=0)=>p.split(".").reduce((v,k)=>v?.[k],o)??d;
const fmt=(v,d=0)=>Number(v||0).toLocaleString("ja-JP",{minimumFractionDigits:d,maximumFractionDigits:d});
const percent=(a,b)=>b?`${fmt(a/b*100,1)}%（${fmt(a)}/${fmt(b)}）`:"—";
const escapeHtml=s=>String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function categoryOk(m){return category==="all"||(category==="official"?m.includeOverall:m.category==="exhibition")}
function positionOk(p){return !!selectPositionAppearance(p,selectedPositions)}
function periodOk(m){return (!$('from').value||m.date>=$('from').value)&&(!$('to').value||m.date<=$('to').value)}
function presetOk(p){return !selectedPresets.size||selectedPresets.has(p.preset||"")}

function normalizePlayerQueryId(raw){
  const v=decodeURIComponent(String(raw||''));
  return v.startsWith('name:') ? v.slice(5) : v;
}
function playerHref(player){
  const id=String(player?.playerId||player?.currentName||player?.name||'');
  return `player.html?id=${encodeURIComponent(id)}`;
}
function findIdentity(){
  const raw=requestedId;
  const id=normalizePlayerQueryId(raw);
  return (data.players||[]).find(p =>
    String(p.playerId||'')===id ||
    String(p.currentName||'')===id ||
    (p.aliases||[]).some(a => String(a)===id)
  ) || null;
}
function appearancesFor(playerId,includePreset=true){
  const rows=[];
  for(const m of data.matches||[]){
    for(const p of m.players||[]){
      if(
        p.playerId===playerId &&
        categoryOk(m) &&
        periodOk(m) &&
        positionOk(p) &&
        (!includePreset || presetOk(p))
      ){
        rows.push({...selectPositionAppearance(p,selectedPositions),match:m});
      }
    }
  }
  return rows;
}
function appearances(){
  const identity=findIdentity();
  return identity ? appearancesFor(identity.playerId,true) : [];
}
function allCandidatePresets(){const identity=findIdentity();const set=new Set();if(identity)for(const m of data.matches||[])for(const p of m.players||[])if(p.playerId===identity.playerId&&categoryOk(m)&&periodOk(m)&&positionOk(p)&&p.preset)set.add(p.preset);return [...set].sort()}
function renderPresets(){const list=allCandidatePresets();for(const x of [...selectedPresets])if(!list.includes(x))selectedPresets.delete(x);$('presetList').innerHTML=list.length?list.map(x=>`<label class="preset-check"><input type="checkbox" value="${escapeHtml(x)}" ${selectedPresets.has(x)?'checked':''}>${escapeHtml(x)}</label>`).join(''):'<span class="subtle">該当プリセットなし</span>';$('presetList').querySelectorAll('input').forEach(i=>i.addEventListener('change',()=>{i.checked?selectedPresets.add(i.value):selectedPresets.delete(i.value);render()}))}
function sum(rows,path){return rows.reduce((a,r)=>a+Number(get(r.stats,path,0)||0),0)}
function aggregate(rows){const counted=rows.filter(r=>r.appearanceCount!==0),games=counted.length,wins=counted.filter(r=>r.result==='win').length,draws=counted.filter(r=>r.result==='draw').length,losses=counted.filter(r=>r.result==='loss').length,ratings=rows.map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite),avgRating=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;return{games,wins,draws,losses,points:counted.reduce((a,r)=>a+r.points,0),gf:counted.reduce((a,r)=>a+r.goalsFor,0),ga:counted.reduce((a,r)=>a+r.goalsAgainst,0),avgRating,ratedGames:ratings.length}}
const metrics=[['出場時間','playedMinutes','分',1],['キックオフ','passes.kickoffs','',0],['前方・横パス距離','passes.forwardDistance','m',1],['後方パス距離','passes.backwardDistance','m',1],['方向不明パス距離','passes.unknownDirectionDistance','m',1],
 ['ゴール','shots.goals','',0],['アシスト','assists','',0],['KP','keyPasses','',0],['パス失敗','passes.failed','',0],['パスアウト','passes.out','',0],['枠外シュート','shots.offTarget','',0],['ブロックされたシュート','shots.blocked','',0],['ポスト・バー','shots.woodwork','',0],['xG','shots.xg','',2],['ドリブル失敗','dribbles.failed','',0],['タックル失敗','tackles.failed','',0],['走行距離','runningDistance','m',1],['タッチ','touches','',0],['パス成功','passes.successful','',0],['パス試行','passes.attempts','',0],['シュート','shots.attempts','',0],['枠内シュート','shots.onTarget','',0],['ゴール','shots.goals','',0],['アシスト','assists','',0],['ドリブル試行','dribbles.attempts','',0],['ドリブル成功','dribbles.successful','',0],['ドリブル距離','dribbles.distance','m',1],['タックル試行','tackles.attempts','',0],['保持解除','tackles.disruptions','',0],['タックル奪取','tackles.won','',0],['パスカット奪取','interceptions.won','',0],['カバーリング','covering.total','',0],['シュートブロック','blocks.shot','',0],['セーブ','saves.total','',0],];
function rateFor(label,rows){if(label==='パス成功')return percent(sum(rows,'passes.successful'),sum(rows,'passes.attempts'));if(label==='枠内シュート')return percent(sum(rows,'shots.onTarget'),sum(rows,'shots.attempts'));if(label==='ゴール')return percent(sum(rows,'shots.goals'),sum(rows,'shots.attempts'));if(label==='ドリブル成功')return percent(sum(rows,'dribbles.successful'),sum(rows,'dribbles.attempts'));if(label==='タックル奪取')return percent(sum(rows,'tackles.won'),sum(rows,'tackles.attempts'));return'—'}
function weightedAveragePosition(rows){
  let sx=0,sy=0,count=0;
  for(const r of rows){
    const p=r.stats?.averagePosition;
    if(!p)continue;
    const w=Number(p.samples||1);
    const ax=Number(p.attackingNormalizedX);
    const ay=Number(p.attackingNormalizedY);
    if(Number.isFinite(ax)&&Number.isFinite(ay)){sx+=ax*w;sy+=ay*w;count+=w}
  }
  return count?{x:sx/count,y:sy/count,samples:count}:null;
}
function renderAveragePosition(rows){const byPos=new Map();for(const r of rows){for(const part of r.stats?.positionStats||[{position:r.position,stats:r.stats}]){if(!byPos.has(part.position))byPos.set(part.position,[]);byPos.get(part.position).push({stats:part.stats});}}const points=[...byPos].map(([position,rs])=>({position,p:weightedAveragePosition(rs)})).filter(v=>v.p);$('averagePosition').innerHTML=points.length?'<div class="mini-pitch vertical-pitch"><div class="pitch-half"></div><div class="pitch-circle"></div>'+points.map(({position,p})=>'<div class="avg-dot" style="left:'+Math.max(4,Math.min(96,p.x*100))+'%;top:'+Math.max(4,Math.min(96,(1-p.y)*100))+'%"><span class="position-average-label">'+escapeHtml((findIdentity()?.currentName||'')+' ('+position+')')+'</span></div>').join('')+'</div><div class="position-caption">ポジション別。上が攻撃方向。</div>':'<p>位置データなし</p>';}
function syncPositionChecks(){document.querySelectorAll('#positionChecks input').forEach(i=>i.checked=selectedPositions.has(i.value))}
function setPositions(values){selectedPositions=new Set(values);selectedPresets.clear();syncPositionChecks();render()}

const POSITIONS=['GK','DF','MF','FW'];
function posRows(id,pos){const out=[];for(const m of data.matches||[])for(const p of m.players||[])if(p.playerId===id&&categoryOk(m)&&periodOk(m)&&selectPositionAppearance(p,new Set([pos])))out.push({...selectPositionAppearance(p,new Set([pos])),match:m});return out}


function abilityRegulationGames(){
  return Math.max(1,currentEventCount()*2);
}
function abilityConfidence(rows){
  return Math.max(0,Math.min(1,rows.length/abilityRegulationGames()));
}
function lerpAbility(raw, points){
  if(!Number.isFinite(raw)) return 50;
  if(raw<=points[0][0]){
    const [x0,y0]=points[0],[x1,y1]=points[1];
    return y0+(raw-x0)*(y1-y0)/(x1-x0);
  }
  for(let i=1;i<points.length;i++){
    const [x0,y0]=points[i-1],[x1,y1]=points[i];
    if(raw<=x1)return y0+(raw-x0)*(y1-y0)/(x1-x0);
  }
  const [x0,y0]=points[points.length-2],[x1,y1]=points[points.length-1];
  return y1+(raw-x1)*(y1-y0)/(x1-x0);
}
function positionAbilityFactor(pos,k){
  const p=String(pos||'').toUpperCase();
  const factors={
    pass:{GK:1.50,DF:1.00,MF:1.00,FW:1.20},
    shoot:{GK:1.00,DF:1.00,MF:1.00,FW:1.00},
    dribble:{GK:1.00,DF:1.00,MF:1.00,FW:1.00},
    tackle:{GK:1.00,DF:1.00,MF:1.50,FW:1.60},
    intercept:{GK:1.00,DF:1.00,MF:1.40,FW:1.40}
  };
  return factors[k]?.[p] ?? 1;
}
function abilityRaw(rows,pos,k){
  if(!rows.length)return 0;
  const games=rows.length;
  const av=p=>sum(rows,p)/games;
  const p=String(pos||rows[0]?.position||'').toUpperCase();

  if(k==='pass'){
    const success=av('passes.successful');
    const attempts=av('passes.attempts');
    const failed=Math.max(0,attempts-success);
    const raw=success-failed*.25+av('keyPasses')*.25+av('assists')*.25;
    return raw*positionAbilityFactor(p,'pass');
  }
  if(k==='shoot'){
    const attempts=av('shots.attempts');
    if(attempts<=0)return 0;
    const on=av('shots.onTarget');
    const off=Math.max(0,attempts-on);
    // FPは同一基準。シュート量/枠内を土台にしつつ、
    // 「0得点」と「実際に得点した」の差が能力へ明確に出るようゴールを強く評価。
    // G-xG補正は小さく残し、ゴール実績そのものを +5.5 で加点する。
    const goals=av('shots.goals'),xg=av('shots.xg');
    const raw=on-off*.25+goals*5.5+(goals-xg)*.50;
    return raw*positionAbilityFactor(p,'shoot');
  }
  if(k==='dribble'){
    const success=av('dribbles.successful');
    const attempts=av('dribbles.attempts');
    const failed=Math.max(0,attempts-success);
    return (success-failed*.25)*positionAbilityFactor(p,'dribble');
  }
  if(k==='activity'){
    // FP share one scale. GK has a separate distance-only scale.
    if(p==='GK')return av('runningDistance')/20;
    return av('runningDistance')/100+av('touches')/20;
  }
  if(k==='positioning'){
    if(p==='GK')return 0;
    return av('rating.positioning');
  }
  if(k==='tackle'){
    const success=av('tackles.won');
    const attempts=av('tackles.attempts');
    const failed=Math.max(0,attempts-success);
    return (success-failed*.10)*positionAbilityFactor(p,'tackle');
  }
  if(k==='intercept'){
    if(p==='GK')return av('saves.total');
    const cuts=av('interceptions.won')+av('interceptions.blocked');
    const shotBlocks=av('blocks.shot');
    return (cuts+shotBlocks)*positionAbilityFactor(p,'intercept');
  }
  return 0;
}
function abilityBaseValue(raw,pos,k){
  const p=String(pos||'').toUpperCase();
  if(k==='pass')return lerpAbility(raw,[[0,35],[2,45],[4,55],[6,65],[8,75],[10,85],[12,95]]);
  if(k==='shoot')return lerpAbility(raw,[[0,35],[1,45],[2,55],[3,65],[4,75],[5,80],[7,90],[10,99]]);
  if(k==='dribble')return lerpAbility(raw,[[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]);
  if(k==='activity'){
    if(p==='GK')return lerpAbility(raw,[[4,40],[5,45],[6,50],[7,55],[8,60],[9,65],[10,70]]);
    return lerpAbility(raw,[[5,40],[6,45],[7,50],[8,55],[9,60],[10,65],[11,70],[12,75],[14,85]]);
  }
  if(k==='positioning')return lerpAbility(raw,[[-.20,25],[-.10,35],[-.05,43],[0,50],[.05,60],[.10,70],[.15,80],[.20,90],[.25,97]]);
  if(k==='tackle')return lerpAbility(raw,[[-1,30],[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]);
  if(k==='intercept'){
    if(p==='GK')return lerpAbility(raw,[[0,35],[2,45],[4,58],[5,65],[6,70],[7,76],[8,81],[10,90]]);
    return lerpAbility(raw,[[0,35],[1,47],[2,58],[3,68],[4,78],[5,86],[6,92]]);
  }
  return 50;
}
function ability(rows,pos,k){
  if(!rows.length)return 50;
  const p=String(pos||'').toUpperCase();

  // No attempts/opportunities are neutral rather than automatically poor.
  if(k==='pass'&&sum(rows,'passes.attempts')<=0)return 50;
  if(k==='shoot'&&sum(rows,'shots.attempts')<=0)return 50;
  if(k==='dribble'&&sum(rows,'dribbles.attempts')<=0)return 50;
  if(k==='tackle'&&sum(rows,'tackles.attempts')<=0)return 50;
  if(k==='intercept'&&p==='GK'&&sum(rows,'saves.total')<=0)return 50;

  const raw=abilityRaw(rows,p,k);
  const base=abilityBaseValue(raw,p,k);
  // Reliability changes only distance from neutral 50.
  const value=50+(base-50)*abilityConfidence(rows);
  return Math.max(20,Math.min(99,Math.round(value)));
}
function rank(v){return v>=90?'S':v>=80?'A':v>=70?'B':v>=60?'C':v>=50?'D':v>=40?'E':'F'}
function rankClass(r){return 'r'+r.toLowerCase()}
function cell(rows,pos,k,ok){
 if(!ok)return '<span class="na">―</span>';
 if(!rows.length)return '<span class="unrated">―</span>';
 const v=ability(rows,pos,k),r=rank(v);
 return `<span class="ability-score"><b class="rank-box ${rankClass(r)}">${r}</b><small>${v}</small></span>`;
}
function recentForm(rows){
 const recent=[...rows].sort((a,b)=>String(b.match?.gameId||'').localeCompare(String(a.match?.gameId||'')))
  .map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite).slice(0,5);
 if(!recent.length)return {avg:null,label:'データなし',icon:'―',cls:'form-none',count:0};
 const avg=recent.reduce((a,b)=>a+b,0)/recent.length;
 if(avg<6.0)return {avg,label:'絶不調',icon:'↓↓',cls:'form-awful',count:recent.length};
 if(avg<6.5)return {avg,label:'不調',icon:'↓',cls:'form-bad',count:recent.length};
 if(avg<7.0)return {avg,label:'普通',icon:'→',cls:'form-normal',count:recent.length};
 if(avg<7.5)return {avg,label:'好調',icon:'↑',cls:'form-good',count:recent.length};
 return {avg,label:'絶好調',icon:'↑↑',cls:'form-great',count:recent.length};
}
function cardAbility(rows,pos,k,ok=true){
 if(!ok||!rows.length)return {value:null,rank:'—'};
 const value=ability(rows,pos,k);return {value,rank:rank(value)};
}

function eventDatePart(gameId){
 const raw=String(gameId||'');
 const m=raw.match(/(\d{8})/);
 return m?m[1]:raw.replace(/\D/g,'').slice(0,8);
}
function currentEventCount(){
 const dates=new Set();
 for(const m of data.matches||[]){
   if(!categoryOk(m)||!periodOk(m))continue;
   const d=eventDatePart(m.gameId||m.id||m.game_uid);
   if(d)dates.add(d);
 }
 return dates.size;
}
function specialAbilityRegulation(){
 return currentEventCount()*2;
}

function meanOf(vals){
 const xs=vals.filter(Number.isFinite);
 return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
}
function stdOf(vals){
 const xs=vals.filter(Number.isFinite),m=meanOf(xs);
 if(xs.length<2||m===null)return 0;
 return Math.sqrt(xs.reduce((a,b)=>a+(b-m)**2,0)/xs.length);
}
function avgPath(rows,path){
 return rows.length?sum(rows,path)/rows.length:0;
}
function posPeers(pos){
 return (data.players||[]).map(p=>posRows(p.playerId,pos)).filter(r=>r.length);
}



function groupPeerRows(group){
 const out=[];
 for(const p of data.players||[]){
   if(group==="ALL"){
     const rows=[];
     for(const pp of ['GK','DF','MF','FW'])rows.push(...posRows(p.playerId,pp));
     if(rows.length)out.push(rows);
   }else if(group==="FP"){
     const rows=[];
     for(const pp of ['DF','MF','FW'])rows.push(...posRows(p.playerId,pp));
     if(rows.length)out.push(rows);
   }else{
     const rows=posRows(p.playerId,group);
     if(rows.length)out.push(rows);
   }
 }
 return out;
}
function zScoreRelative(group,rawFn,rows,{invert=false,scale=14}={}){
 const raw=Number(rawFn(rows));if(!Number.isFinite(raw))return 50;
 const vals=groupPeerRows(group).map(rawFn).map(Number).filter(Number.isFinite);
 const m=meanOf(vals),sd=stdOf(vals);if(m===null||sd<1e-9)return 50;
 let z=(raw-m)/sd;if(invert)z=-z;
 return Math.max(0,Math.min(100,50+scale*z));
}
function blendScores(parts){
 const valid=parts.filter(x=>Number.isFinite(x.score)&&Number(x.weight)>0);
 if(!valid.length)return 50;
 const w=valid.reduce((a,b)=>a+b.weight,0);
 return valid.reduce((a,b)=>a+b.score*b.weight,0)/w;
}
function confidenceAdjusted(score,rows){
 const required=Math.max(1,specialAbilityRegulation());
 const conf=Math.max(0,Math.min(1,rows.length/required));
 return 50+(score-50)*conf;
}
function componentGate(group,rawFn,rows,minScore=55){
 const score=zScoreRelative(group,rawFn,rows);
 return Number.isFinite(score)&&score>=minScore;
}
function weightedAveragePositionForRows(rows){
 let sx=0,sy=0,n=0;
 for(const r of rows){
   const p=r.stats?.averagePosition;
   const x=Number(p?.attackingNormalizedX),y=Number(p?.attackingNormalizedY),w=Math.max(1,Number(p?.samples||1));
   if(Number.isFinite(x)&&Number.isFinite(y)){sx+=x*w;sy+=y*w;n+=w}
 }
 return n?{x:sx/n,y:sy/n}:null;
}
function goalContextCounts(rows){
 let trailing=0,clutch=0,lateClutch=0,total=0;
 for(const r of rows){
   const side=String(r.teamSide||r.team_side||'');
   for(const d of (get(r.stats,'rating.context.situation.details',[])||[])){
     if(d?.type!=='goal')continue;
     total++;
     const gap=Number(d.gapBefore);
     if(!Number.isFinite(gap))continue;
     const deficit=side.includes('WEST')?-gap:gap;
     if(deficit>0)trailing++;
     if(deficit===0||deficit===1){
       clutch++;
       const t=Number(d.time);
       if(Number.isFinite(t)&&t>=420)lateClutch++; // 後半2:00 = match 7:00
     }
   }
 }
 return {trailing,clutch,lateClutch,total};
}
function decidedResultCount(rows){return rows.filter(r=>r.result==='win'||r.result==='loss').length}
function decidedWinRate(rows){
 const w=rows.filter(r=>r.result==='win').length,l=rows.filter(r=>r.result==='loss').length,n=w+l;
 return n?w/n:NaN;
}
function averageRating(rows){return meanOf(rows.map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite))}
function ratingStability(rows){
 const v=rows.map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite);
 if(v.length<2)return NaN;return -stdOf(v);
}
function lowRatingRate(rows){
 const vals=rows.map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite);
 return vals.length?vals.filter(v=>v<6.5).length/vals.length:NaN;
}
function stabilityRawScore(rows){
 const rate=lowRatingRate(rows);
 return Number.isFinite(rate)?Math.max(0,Math.min(100,100-rate*100)):NaN;
}
function stabilityConfidence(rows){
 // 安定感は「低評価になりにくさ」の率なので、通常特性の開催数×2信頼度は使わない。
 // そのPOSで何試合出たか / 開催数を中心に評価。
 const events=Math.max(1,currentEventCount());
 const coverage=Math.min(1,rows.length/events);
 // 最低3試合を満たした時点で0.70、全開催出場で1.00。
 // 3/5なら 0.88 程度となり、少数出場でも極端に50へ戻しすぎない。
 const minGames=3;
 if(rows.length<minGames)return 0;
 const minCoverage=Math.min(1,minGames/events);
 if(coverage<=minCoverage)return 0.70;
 const span=Math.max(1e-9,1-minCoverage);
 return Math.min(1,0.70+(coverage-minCoverage)/span*0.30);
}
function stabilityScore(rows){
 const raw=stabilityRawScore(rows);
 if(!Number.isFinite(raw))return NaN;
 const c=stabilityConfidence(rows);
 return 50+(raw-50)*c;
}
function bigChanceFinishRate(rows){
 const g=sum(rows,'chances.goalsFromBig'),m=sum(rows,'chances.missedBig'),a=g+m;return a?g/a:NaN;
}
function bigChanceAttempts(rows){return sum(rows,'chances.goalsFromBig')+sum(rows,'chances.missedBig')}
function creationVolume(rows){return avgPath(rows,'keyPasses')*1.35+avgPath(rows,'assists')*2.2}
function passSuccessRate(rows){const a=sum(rows,'passes.attempts'),w=sum(rows,'passes.successful');return a?w/a:NaN}
function passSuccessVolume(rows){return avgPath(rows,'passes.successful')}
function ballKeepRate(rows){
 const pA=sum(rows,'passes.attempts'),pF=sum(rows,'passes.failed')+sum(rows,'passes.out');
 const dA=sum(rows,'dribbles.attempts'),dF=sum(rows,'dribbles.failed');
 const risk=pA+dA;return risk?1-(pF+dF)/risk:NaN;
}
function involvementVolume(rows){return avgPath(rows,'passes.attempts')+avgPath(rows,'dribbles.attempts')}
function tackleVolume(rows){return avgPath(rows,'tackles.won')}
function tackleRate(rows){const a=sum(rows,'tackles.attempts'),w=sum(rows,'tackles.won');return a?w/a:NaN}
function interceptionVolume(rows){return avgPath(rows,'interceptions.won')}
function shotBlockVolume(rows){return Math.max(Number(avgPath(rows,'blocks.shot'))||0,Number(avgPath(rows,'blocks.shots'))||0)}
function teamXgaAverage(rows){
 const vals=[];for(const r of rows){const v=perMatchTeamStat(r.match,r,'xga');if(v!==null)vals.push(Number(v))}
 return vals.length?meanOf(vals):NaN;
}
function bigSaveValue(rows){
 let total=0,found=false;
 for(const r of rows)for(const d of (get(r.stats,'saves.details',[])||[])){
   const x=Number(d.chanceScore);
   if(d.bigChancePrevented||Number.isFinite(x)&&x>=.35){total+=Number.isFinite(x)?Math.max(.35,x):.5;found=true}
 }
 return found&&rows.length?total/rows.length:NaN;
}
function bigSaveCount(rows){
 let total=0;
 for(const r of rows)for(const d of (get(r.stats,'saves.details',[])||[])){
   const x=Number(d.chanceScore);if(d.bigChancePrevented||Number.isFinite(x)&&x>=.35)total++;
 }
 return rows.length?total/rows.length:NaN;
}
function lowXgSaveRate(rows){
 const faced=sum(rows,'saves.lowXgFaced'),saved=sum(rows,'saves.lowXgSaved');
 return faced?saved/faced:NaN;
}
function lowXgFaced(rows){return sum(rows,'saves.lowXgFaced')}
function directRate(rows){const sh=sum(rows,'shots.attempts'),di=sum(rows,'shots.direct');return sh?di/sh:NaN}
function directVolume(rows){return avgPath(rows,'shots.direct')}
function shotVolume(rows){return avgPath(rows,'shots.attempts')}
function passVolume(rows){return avgPath(rows,'passes.attempts')}
function dribbleVolume(rows){return avgPath(rows,'dribbles.attempts')}
function dribbleSuccessRate(rows){const a=sum(rows,'dribbles.attempts'),w=sum(rows,'dribbles.successful');return a?w/a:NaN}
function touchVolume(rows){return avgPath(rows,'touches')}
function shotTouchRate(rows){const sh=shotVolume(rows),t=touchVolume(rows);return t>0?sh/t:NaN}
function finisherShare(rows){
 const sh=shotVolume(rows),pa=passVolume(rows),da=dribbleVolume(rows);
 if(sh<=0)return NaN;return sh/(sh+pa*.35+da*.8+1e-9);
}
function dribblerShare(rows){
 const da=dribbleVolume(rows),pa=passVolume(rows),sh=shotVolume(rows);
 if(da<=0)return NaN;return da/(da+pa*.35+sh*.7+1e-9);
}
function centralityMetric(rows){const p=weightedAveragePositionForRows(rows);return p?-Math.abs(p.x-.5):NaN}
function widthMetric(rows){const p=weightedAveragePositionForRows(rows);return p?Math.abs(p.x-.5):NaN}
function depthMetric(rows){const p=weightedAveragePositionForRows(rows);return p?-p.y:NaN}

function winLossRatingProfile(rows){
 const wins=rows.filter(r=>r.result==='win').map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite);
 const losses=rows.filter(r=>r.result==='loss').map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite);
 if(!wins.length||!losses.length)return {winAvg:NaN,lossAvg:NaN,gap:NaN};
 const winAvg=meanOf(wins),lossAvg=meanOf(losses);
 return {winAvg,lossAvg,gap:winAvg-lossAvg};
}
function winLossRatingGap(rows){return winLossRatingProfile(rows).gap}
function winRatingAverage(rows){return winLossRatingProfile(rows).winAvg}
function lossRatingAverage(rows){return winLossRatingProfile(rows).lossAvg}
function lossRatingCount(rows){return rows.filter(r=>r.result==='loss'&&Number.isFinite(Number(get(r.stats,'rating.value',NaN)))).length}
function coveringVolume(rows){return avgPath(rows,'covering.total')}
function markSecondsAverage(rows){return avgPath(rows,'trial.positioning.markSeconds')}
function positionStyleSummary(rows){
 const counts=new Map();
 for(const r of rows){
   const st=get(r.stats,'positionStyle',null);
   if(!st||!st.primary||st.primary==='GK')continue;
   counts.set(st.primary,(counts.get(st.primary)||0)+1);
 }
 return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function positionStyleHeader(rows,pos){
 if(pos==='GK')return '';
 const counts=positionStyleSummary(rows);
 if(!counts.length)return '';
 return `<span class="position-style-header">${counts.map(([name],i)=>`<b class="${i===0?'primary':''}">${escapeHtml(name)}</b>`).join('<i>/</i>')}</span>`;
}
function traitScores(rows,pos){
 const out=[];
 const add=(name,color,rawScore,eligible=true)=>{
   if(!eligible||!Number.isFinite(rawScore)){
     out.push({name,color,score:null,eligible:false,active:false,gold:false});
     return;
   }
   // 安定感は専用の出場カバレッジ信頼度を stabilityScore() 内で適用済み。
   out.push({name,color,score:name==='安定感○'?rawScore:confidenceAdjusted(rawScore,rows),eligible:true});
 };
 const FP=pos!=='GK';
 const wins=rows.filter(r=>r.result==='win').length,losses=rows.filter(r=>r.result==='loss').length;

 // 勝敗運: 引き分けを除いた勝率を0-100で直接表示。母数は開催数×3以上。
 const decided=decidedResultCount(rows),luckRate=decidedWinRate(rows);
 if(decided>=10&&Number.isFinite(luckRate)){
   out.push({name:'勝敗運',color:'luck',score:luckRate*100,eligible:true});
 }else{
   out.push({name:'勝敗運',color:'luck',score:null,eligible:false,active:false,gold:false});
 }
 add('安定感○','blue',stabilityScore(rows),rows.length>=3);
 // 鶏群の一鶴: チームが敗れた試合でも個人採点を高く保てる選手。
 add('逆境○','blue',
   zScoreRelative('ALL',lossRatingAverage,rows),
   lossRatingCount(rows)>=3
     &&Number.isFinite(lossRatingAverage(rows))
     &&lossRatingAverage(rows)>=6.50);

 // Situation/quality traits. Minimum event counts prevent one-off plays from deciding a trait.
 add('決定力○','blue',zScoreRelative('FP',bigChanceFinishRate,rows),FP&&bigChanceAttempts(rows)>=3);
 add('チャンスメーカー','blue',
   blendScores([{score:zScoreRelative('FP',r=>avgPath(r,'keyPasses'),rows),weight:.70},{score:zScoreRelative('FP',r=>avgPath(r,'assists'),rows),weight:.30}]),
   FP&&(sum(rows,'keyPasses')+sum(rows,'assists')>=currentEventCount()*2));
 // Differentiate from base Pass: quality/rate first, no KP/A and only a small volume gate.
 add('ゲームメーカー','blue',zScoreRelative('FP',passSuccessRate,rows),
   FP&&sum(rows,'passes.attempts')/Math.max(1,rows.length)>=10&&componentGate('FP',passSuccessRate,rows,55));
 // Differentiate from Activity: pure distance, not touches.
 add('ダイナモ','blue',zScoreRelative('FP',r=>avgPath(r,'runningDistance'),rows),FP&&rows.length>=2);
 // Quality first; involvement is only a gate, not part of the score.
 add('ボールキープ○','blue',zScoreRelative('FP',ballKeepRate,rows),
   FP&&(sum(rows,'passes.attempts')+sum(rows,'dribbles.attempts'))/Math.max(1,rows.length)>=12&&componentGate('FP',ballKeepRate,rows,55));
 // Differentiate from base Tackle: success rate is the trait; attempts are only a reliability gate.
 add('デュエル○','blue',
   blendScores([
     {score:zScoreRelative('FP',tackleRate,rows),weight:.50},
     {score:zScoreRelative('FP',dribbleSuccessRate,rows),weight:.50}
   ]),
   FP
     &&sum(rows,'tackles.attempts')/Math.max(1,rows.length)>=3
     &&sum(rows,'dribbles.attempts')/Math.max(1,rows.length)>=2
     &&componentGate('FP',tackleRate,rows,55)
     &&componentGate('FP',dribbleSuccessRate,rows,55));
 // Cut speciality only; shot blocks are deliberately excluded (鉄壁 handles those).
 add('インターセプター','blue',zScoreRelative('FP',interceptionVolume,rows),FP&&sum(rows,'interceptions.won')/Math.max(1,rows.length)>=3);
 add('カバーリング○','blue',zScoreRelative('DF',coveringVolume,rows),pos==='DF'&&sum(rows,'covering.total')>=currentEventCount());
 add('勝負師','blue',
   blendScores([
     {score:zScoreRelative('FP',r=>goalContextCounts(r).lateClutch/Math.max(1,goalContextCounts(r).total),rows),weight:.70},
     {score:zScoreRelative('FP',r=>goalContextCounts(r).lateClutch/Math.max(1,r.length),rows),weight:.30}
   ]),
   FP&&goalContextCounts(rows).lateClutch>=currentEventCount()
     &&goalContextCounts(rows).lateClutch/Math.max(1,goalContextCounts(rows).total)>=0.25);

 // Style traits: composition of touches/actions is primary; raw volume is only a minimum gate.
 add('フィニッシャー','green',
   blendScores([{score:zScoreRelative('FP',finisherShare,rows),weight:.55},{score:zScoreRelative('FP',shotTouchRate,rows),weight:.45}]),
   FP&&sum(rows,'shots.attempts')/Math.max(1,rows.length)>=5&&componentGate('FP',finisherShare,rows,57)&&componentGate('FP',shotTouchRate,rows,56));
 add('ドリブラー','green',zScoreRelative('FP',dribblerShare,rows),
   FP&&sum(rows,'dribbles.attempts')/Math.max(1,rows.length)>=4&&componentGate('FP',dribblerShare,rows,56));
 add('アクロバティック','green',zScoreRelative('FP',directRate,rows),
   FP&&sum(rows,'shots.direct')>=currentEventCount()*2&&componentGate('FP',directRate,rows,56));

 add('マンツーマン','green',zScoreRelative('DF',markSecondsAverage,rows),
   pos==='DF'&&rows.length>=Math.max(2,currentEventCount())&&Number.isFinite(markSecondsAverage(rows)));
 add('ゾーン','green',zScoreRelative('DF',markSecondsAverage,rows,{invert:true}),
   pos==='DF'&&rows.length>=Math.max(2,currentEventCount())&&Number.isFinite(markSecondsAverage(rows)));

 add('鉄壁','blue',zScoreRelative('DF',shotBlockVolume,rows),pos==='DF'&&sum(rows,'blocks.shot')>=currentEventCount());
 add('ディフェンスリーダー','blue',zScoreRelative('DF',teamXgaAverage,rows,{invert:true}),pos==='DF'&&Number.isFinite(teamXgaAverage(rows)));
 add('ビッグセーバー','blue',
   blendScores([{score:zScoreRelative('GK',bigSaveValue,rows),weight:.75},{score:zScoreRelative('GK',bigSaveCount,rows),weight:.25}]),
   pos==='GK'&&Number.isFinite(bigSaveValue(rows))&&bigSaveCount(rows)*rows.length>=currentEventCount()*2);
 add('コース予測○','blue',
   zScoreRelative('GK',lowXgSaveRate,rows),
   pos==='GK'&&lowXgFaced(rows)>=Math.max(4,currentEventCount()*2)&&Number.isFinite(lowXgSaveRate(rows)));

 const threshold={blue:65,luck:65,dual:65,green:65,red:65};
 return out.map(t=>{
   if(!t.eligible||!Number.isFinite(t.score))return {...t,active:false,gold:false,threshold:threshold[t.color]};
   if(t.color==='luck')return {...t,active:t.score>=65||t.score<=35,gold:t.score>=90,threshold:65};
   return {...t,active:t.score>=threshold[t.color],gold:t.color==='blue'&&t.score>=90,threshold:threshold[t.color]};
 }).sort((a,b)=>{
   const order={blue:0,luck:1,dual:2,red:3,green:4};
   return order[a.color]-order[b.color]||(Number.isFinite(b.score)?b.score:-1)-(Number.isFinite(a.score)?a.score:-1)||a.name.localeCompare(b.name);
 });
}
const TRAIT_GOLD_NAMES={
 '勝敗運':'勝者','安定感○':'明鏡止水','逆境○':'鶏群の一鶴','決定力○':'一撃必殺',
 'チャンスメーカー':'演出家','ゲームメーカー':'マエストロ','ダイナモ':'縦横無尽',
 'ボールキープ○':'金剛不壊','デュエル○':'闘将','インターセプター':'未来予知',
 '鉄壁':'金城鉄壁','ディフェンスリーダー':'統率者','勝負師':'千両役者','ビッグセーバー':'神の手(GK)','コース予測○':'神の眼'
};
const TRAIT_DESCRIPTIONS={
 '勝敗運':'引き分けを除いた試合での勝率。65以上は勝ち運、35以下は負け運。判定には引き分けを除いた10試合以上が必要。',
 '安定感○':'平均採点6.5以上を満たし、試合ごとの採点のブレが小さい。',
 '逆境○':'敗戦時でも平均採点が高く、チーム結果が悪い試合でも個人評価を保つ。',
 '決定力○':'FP全体で比較して、xGの高いシュートを外しにくい。',
 'チャンスメーカー':'FP全体で比較して、キーパス・アシストが多い。',
 'ゲームメーカー':'十分なパス試行があり、FP全体でもパス成功率が高い。KP・アシストは判定に使わない。',
 'ダイナモ':'FP全体で比較して、1試合あたりの走行距離が多い。タッチ数は判定に使わない。',
 'ボールキープ○':'十分なパス・ドリブル機会があり、ミスによるロスト割合が少ない。',
 'デュエル○':'十分なタックル・ドリブル試行があり、FP全体でも両方の成功率が高い。基礎能力のタックルとは分けて対人の強さを評価する。',
 'インターセプター':'FP全体で比較して、パスカットによる奪取が多い。シュートブロックは含めない。',
 'カバーリング○':'DFの中で、味方のロストまたはタックル失敗の直後・近距離でボールを回収するプレーが多い。',
 '鉄壁':'DFの中でシュートブロックが多い。',
 'ディフェンスリーダー':'DFの中で出場時のチーム被xGが低い。',
 '勝負師':'後半2:00以降の同点・勝ち越しとなる殊勲ゴールが多い。',
 'ビッグセーバー':'GKの中で被xGの高いシュートのセーブが多い。',
 'コース予測○':'GKの中で被xGの低い枠内シュートを決められにくく、セーブ率が高い。最低被シュート数を満たした場合のみ評価する。',
 'フィニッシャー':'最低限のシュート数があり、タッチに対するシュート割合が高く、パス・ドリブルよりシュートに偏る。',
 'ドリブラー':'最低限のドリブル数があり、タッチ・他のプレーに対するドリブル割合が高い。',
 'アクロバティック':'最低限の使用数があり、シュートに占めるダイレクトアイテム使用割合が高い。',
 'マンツーマン':'DFの中で1試合あたりのマーク時間が長く、特定の相手を継続して見る傾向が強い。',
 'ゾーン':'DFの中で1試合あたりのマーク時間が短く、特定の相手への追従よりスペース管理を優先する傾向が強い。',
};
function availableTraitNamesForPos(pos){
 const baseBlue=['勝敗運','安定感○','逆境○'],baseRed=[];
 if(pos==='GK')return [...baseBlue,'ビッグセーバー','コース予測○',...baseRed];
 const fpBlue=['決定力○','チャンスメーカー','ゲームメーカー','ダイナモ','ボールキープ○','デュエル○','インターセプター','勝負師'];
 const fpGreen=['フィニッシャー','ドリブラー','アクロバティック'];
 if(pos==='DF')return [...baseBlue,...fpBlue,'カバーリング○','鉄壁','ディフェンスリーダー',...fpGreen,'マンツーマン','ゾーン',...baseRed];
 if(pos==='FW')return [...baseBlue,...fpBlue,...fpGreen,...baseRed];
 return [...baseBlue,...fpBlue,...fpGreen,...baseRed];
}
function traitCellHtml(name,t,specialEligible){
 const eligible=Boolean(t?.eligible);
 const score=eligible&&Number.isFinite(t?.score)?Math.round(t.score):null;
 if(t?.color==='luck'){
   const active=Boolean(specialEligible&&eligible&&t?.active);
   const winSide=eligible&&score>=50;
   const gold=Boolean(specialEligible&&eligible&&t?.gold);
   const cls=gold?'trait-gold':active?(winSide?'trait-blue':'trait-red'):'trait-inactive';
   const displayName=gold?'勝者':winSide?'勝ち運':'負け運';
   const status=!specialEligible?'未規定':!eligible?'最低条件未達':gold?'金特':active?'有効':'基準未到達';
   const desc=TRAIT_DESCRIPTIONS['勝敗運']||'';
   return `<span class="trait-cell ${cls}" title="${escapeHtml(desc+' / 勝率 '+(score===null?'—':score)+'% / '+status)}"><b>${escapeHtml(displayName)}</b><small>${score===null?'—':score}</small></span>`;
 }
 const color=t?.color||(name==='負け運'?'red':'blue');
 const gold=Boolean(specialEligible&&eligible&&t?.gold);
 const active=Boolean(specialEligible&&eligible&&t?.active);
 const cls=gold?'trait-gold':active?(color==='dual'?'trait-dual':`trait-${color}`):'trait-inactive';
 const displayName=gold?(TRAIT_GOLD_NAMES[name]||name):name;
 const status=!specialEligible?'未規定':!eligible?'最低条件未達':gold?'金特':active?'有効':'基準未到達';
 const desc=TRAIT_DESCRIPTIONS[name]||'';
 const title=`${desc} / スコア ${score===null?'—':score} / ${status}`;
 return `<span class="trait-cell ${cls}" title="${escapeHtml(title)}"><b>${escapeHtml(displayName)}</b><small>${score===null?'—':score}</small></span>`;
}
function traitHtml(rows,pos,specialEligible){
 const scored=new Map(traitScores(rows,pos).map(t=>[t.name,t]));
 const names=availableTraitNamesForPos(pos);
 const greenNames=new Set(['フィニッシャー','ドリブラー','アクロバティック','マンツーマン','ゾーン']);
 const main=names.filter(n=>!greenNames.has(n));
 const green=names.filter(n=>greenNames.has(n));

 const block=(label,list,cls)=>list.length?`
   <div class="trait-group ${cls}">
     <div class="trait-group-label">${label}</div>
     <div class="trait-group-cells">${list.map(name=>traitCellHtml(name,scored.get(name),specialEligible)).join('')}</div>
   </div>`:'';

 const greenHtml=green.map(name=>traitCellHtml(name,scored.get(name),specialEligible)).join('');
 const styleBlock=greenHtml?`<div class="trait-group trait-group-style"><div class="trait-group-label">プレースタイル</div><div class="trait-group-cells">${greenHtml}</div></div>`:'';
 return block('能力・結果特性',main,'trait-group-main')+styleBlock;
}

const OVERALL_ABILITY_WEIGHTS={"GK":{"pass":0.18,"intercept":0.62,"activity":0.2},"DF":{"intercept":0.27,"tackle":0.22,"positioning":0.16,"pass":0.17,"activity":0.09,"dribble":0.055,"shoot":0.035},"MF":{"pass":0.27,"dribble":0.19,"positioning":0.16,"activity":0.15,"tackle":0.10,"intercept":0.075,"shoot":0.055},"FW":{"shoot":0.29,"dribble":0.20,"pass":0.16,"positioning":0.14,"activity":0.10,"intercept":0.055,"tackle":0.055}};
const OVERALL_TRAIT_WEIGHTS={"GK":{"ビッグセーバー":4,"コース予測○":4,"安定感○":2,"逆境○":2,"勝敗運":1},"DF":{"インターセプター":4,"カバーリング○":3.5,"鉄壁":4,"デュエル○":3,"ディフェンスリーダー":3,"ボールキープ○":2,"ゲームメーカー":1.5,"ダイナモ":1.5,"安定感○":1.5,"逆境○":1},"MF":{"ゲームメーカー":4,"チャンスメーカー":4,"ボールキープ○":3,"ダイナモ":2.5,"デュエル○":2,"インターセプター":1.5,"安定感○":1.5,"逆境○":1.5,"決定力○":1},"FW":{"決定力○":4,"チャンスメーカー":3,"ボールキープ○":2.5,"ダイナモ":2,"ゲームメーカー":1.5,"デュエル○":1,"インターセプター":0.5,"安定感○":1.5,"逆境○":2,"勝負師":2.5}};
function overallBaseFromAbilities(rows,pos){
 const ws=OVERALL_ABILITY_WEIGHTS[pos]||OVERALL_ABILITY_WEIGHTS.MF;
 let total=0,w=0;
 for(const [k,weight] of Object.entries(ws)){
   const ok=!(pos==='GK'&&['shoot','dribble','tackle'].includes(k));
   if(!ok)continue;
   const v=ability(rows,pos,k);
   if(Number.isFinite(v)){total+=v*weight;w+=weight}
 }
 return w?total/w:50;
}
function overallTraitScore(rows,pos){
 const ws=OVERALL_TRAIT_WEIGHTS[pos]||{};
 const map=new Map(traitScores(rows,pos).map(t=>[t.name,t]));
 let total=0,w=0;
 for(const [name,weight] of Object.entries(ws)){
   const t=map.get(name);
   if(!t||!t.eligible||!Number.isFinite(t.score))continue;
   total+=t.score*weight;w+=weight;
 }
 return w?total/w:50;
}
function overallValue(rows,pos){
 const base=overallBaseFromAbilities(rows,pos);
 const trait=overallTraitScore(rows,pos);
 // 特性は基礎能力を壊さない補正。50を中立として最大±4程度。
 const bonus=(trait-50)*0.08;
 return Math.max(20,Math.min(99,Math.round(base+bonus)));
}
function overallBadge(rows,pos){
 const v=overallValue(rows,pos),r=rank(v);
 return `<span class="overall-badge"><em>総合</em><b>${r}</b><strong>${v}</strong></span>`;
}
function renderPositionCard(pr){
 const tabs=$('positionCardTabs'),host=$('positionCardHost');if(!tabs||!host)return;
 const available=POSITIONS.filter(p=>pr[p].length);
 if(!available.length){tabs.innerHTML='';host.innerHTML='<div class="empty">ポジション別データなし</div>';return}
 if(!available.includes(profilePosition))profilePosition=available[0];
 tabs.innerHTML=POSITIONS.map(p=>`<button type="button" class="position-card-tab ${p===profilePosition?'active':''}" data-card-pos="${p}" ${pr[p].length?'':'disabled'}>${p}<small>${minutesText(pr[p])}</small></button>`).join('');
 tabs.querySelectorAll('[data-card-pos]').forEach(b=>b.onclick=()=>{profilePosition=b.dataset.cardPos;renderPositionCard(pr)});
 const pos=profilePosition,rows=pr[pos],form=recentForm(rows);
 const requiredGames=specialAbilityRegulation();
 const specialEligible=rows.length>=requiredGames;
 const defs=[
  ['パス','pass',true],
  ['シュート','shoot',pos!=='GK'],
  ['ドリブル','dribble',pos!=='GK'],
  ['タックル','tackle',pos!=='GK'],
  [pos==='GK'?'セーブ':'カット/ブロック','intercept',true],
  ['ポジショニング','positioning',pos!=='GK'],
  ['積極性','activity',true]
 ];
 const abilities=defs.map(([label,key,ok])=>{const a=cardAbility(rows,pos,key,ok);return `<div class="power-ability"><span>${label}</span>${a.value===null?'<b class="power-rank rank-na">―</b><strong>―</strong>':`<b class="power-rank ${rankClass(a.rank)}">${a.rank}</b><strong>${a.value}</strong>`}</div>`}).join('');
 const ratings=rows.map(r=>Number(get(r.stats,'rating.value',NaN))).filter(Number.isFinite);
 const avgRating=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;
 const goals=sum(rows,'shots.goals'),assists=sum(rows,'assists'),kp=sum(rows,'keyPasses');
 host.innerHTML=`<article class="power-player-card">
  <header class="power-card-head">
   <div class="power-card-player"><span class="power-pos power-pos-${pos.toLowerCase()}">${pos}</span><b>${escapeHtml($('playerName')?.textContent||'')}</b>${positionStyleHeader(rows,pos)}${overallBadge(rows,pos)}<small>${minutesText(rows)}</small></div>
   <div class="power-form ${form.cls}"><span>調子</span><b>${form.icon}</b><strong>${form.label}</strong><small>直近${form.count}試合 ${form.avg===null?'—':form.avg.toFixed(2)}</small></div>
  </header>
  <div class="power-card-body">
   <section class="power-ability-list">${abilities}</section>
   <section class="power-card-right">
    <div class="power-summary"><div><span>平均採点</span><b>${avgRating===null?'—':avgRating.toFixed(2)}</b></div><div><span>G / A / KP</span><b>${goals} / ${assists} / ${kp}</b></div></div>
    <div class="power-special-block ${specialEligible?'':'special-locked'}">
      <div class="power-special-title">特性</div>
      <div class="power-special-grid">${traitHtml(rows,pos,specialEligible)}</div>
      <p class="power-special-note">${specialEligible
        ? `規定到達：${rows.length}試合 / ${requiredGames}試合（${currentEventCount()}開催 × 2）`
        : `規定：${requiredGames}試合（${currentEventCount()}開催 × 2） / 現在 ${rows.length}試合`
      }</p>
    </div>
   </section>
  </div>
 </article>`;
}
function renderAbility(id){
 let pr={};POSITIONS.forEach(p=>pr[p]=posRows(id,p));
 const av=POSITIONS.filter(p=>pr[p].length);
 if(!av.includes(profilePosition))profilePosition=av[0]||'DF';
 renderPositionCard(pr);
}
function heatmapHtml(rows){
  // Canonical detailed heatmap is stored as a flat numeric 18 x 28 grid.
  // Older UI treated heat.cells as point objects, failed to read it, and fell back to
  // average-position blobs. Aggregate the real cells directly and smooth only for display.
  let COLS=18,ROWS=28,grid=null,samples=0;

  function ensure(c,r){
    if(!grid||COLS!==c||ROWS!==r){
      COLS=c;ROWS=r;grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));
    }
  }
  for(const r of rows){
    const heat=r.stats?.positionHeatmap||r.stats?.heatmap||r.stats?.heatMap||r.heatmap;
    if(!heat)continue;
    if(Array.isArray(heat.cells)&&heat.cells.length&&typeof heat.cells[0]==='number'){
      const c=Number(heat.cols||18), rr=Number(heat.rows||28);
      if(!Number.isFinite(c)||!Number.isFinite(rr)||c<=0||rr<=0||heat.cells.length<c*rr)continue;
      ensure(c,rr);
      for(let y=0;y<rr;y++)for(let x=0;x<c;x++){
        const v=Number(heat.cells[y*c+x]||0);
        if(Number.isFinite(v)&&v>0)grid[y][x]+=v;
      }
      samples+=Number(heat.samples||0);
      continue;
    }
    // Compatibility with older point/cell-object forms.
    if(Array.isArray(heat.cells)){
      ensure(Number(heat.cols||18),Number(heat.rows||28));
      for(const cell of heat.cells){
        if(!cell||typeof cell!=='object')continue;
        const x=Number(cell.col ?? cell.x),y=Number(cell.row ?? cell.y),v=Number(cell.value ?? cell.count ?? cell.weight ?? 1);
        if(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<COLS&&y>=0&&y<ROWS&&v>0)grid[y][x]+=v;
      }
    }
  }

  if(!grid){
    return '<div class="empty-visual">位置データなし</div>';
  }

  // Light Gaussian-like smoothing keeps the original detailed distribution while avoiding
  // the coarse block appearance. It does not change the source data.
  const kernel=[[1,2,1],[2,4,2],[1,2,1]];
  let smooth=Array.from({length:ROWS},()=>Array(COLS).fill(0));
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    let sum=0,w=0;
    for(let ky=-1;ky<=1;ky++)for(let kx=-1;kx<=1;kx++){
      const yy=y+ky,xx=x+kx;if(yy<0||yy>=ROWS||xx<0||xx>=COLS)continue;
      const kw=kernel[ky+1][kx+1];sum+=grid[yy][xx]*kw;w+=kw;
    }
    smooth[y][x]=w?sum/w:0;
  }
  let max=0;for(const row of smooth)for(const v of row)max=Math.max(max,v);
  if(max<=0)return '<div class="empty-visual">位置データなし</div>';

  const cells=[];
  for(let sy=0;sy<ROWS;sy++)for(let x=0;x<COLS;x++){
    const v=smooth[sy][x];if(v<=max*.012)continue;
    const q=Math.max(0,Math.min(1,v/max));
    // Stored row 0 is own-goal side; display top as attacking direction.
    const y=ROWS-1-sy;
    const hue=220-(220*q); // blue -> cyan/green -> yellow/red
    const sat=82,light=48+Math.min(.12,q)*10;
    const alpha=.12+.76*Math.pow(q,.72);
    cells.push(`<i class="heat-cell-detail" style="left:${(x/COLS*100).toFixed(3)}%;top:${(y/ROWS*100).toFixed(3)}%;width:${(100/COLS+1.0).toFixed(3)}%;height:${(100/ROWS+1.0).toFixed(3)}%;background:hsla(${hue.toFixed(0)},${sat}%,${light.toFixed(0)}%,${alpha.toFixed(3)})"></i>`);
  }
  return `<div class="heatmap-pitch detailed-field-heatmap">
    <div class="heat-pitch-lines"><i class="heat-half"></i><i class="heat-circle"></i><i class="heat-pa heat-pa-top"></i><i class="heat-pa heat-pa-bottom"></i></div>
    <div class="heat-layer">${cells.join('')}</div>
    <div class="heatmap-caption">${samples?`${samples.toLocaleString('ja-JP')} samples / `:''}上方向が攻撃方向</div>
  </div>`;
}
function renderAllPositionAreas(pr){
 $('fpHeatmaps').innerHTML=['DF','MF','FW'].map(p=>`<article class="fp-pos-card"><div class="fp-pos-title"><span class="pos-label">${p}</span><small>${minutesText(pr[p])}</small></div>${heatmapHtml(pr[p])}</article>`).join('');
 if($('gkArea')) $('gkArea').innerHTML='';
}
function view(v){document.querySelectorAll('.player-view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view===v));$('abilityView').hidden=v!=='ability';$('statsView').hidden=v!=='stats';$('matchesView').hidden=v!=='matches'}

function renderStatsHeatmaps(rows){
  const host=$('statsHeatmaps');
  if(!host)return;
  const byPos={DF:[],MF:[],FW:[]};
  for(const r of rows){
    for(const part of r.stats?.positionStats||[{position:r.position,stats:r.stats}])if(byPos[part.position])byPos[part.position].push({...r,position:part.position,stats:part.stats});
  }
  host.innerHTML=['DF','MF','FW'].map(p=>`
    <article class="fp-pos-card detailed-heatmap-card">
      <div class="fp-pos-title"><span class="pos-label">${p}</span><small>${minutesText(byPos[p])}</small></div>
      ${heatmapHtml(byPos[p])}
    </article>`).join('');
}
function matchTeamObjects(match, playerRow){
  const side=String(playerRow.teamSide||playerRow.team_side||'');
  const teams=match?.teams||match?.teamStats||match?.stats?.teams||{};
  let own=null,opp=null;
  if(Array.isArray(teams)){
    own=teams.find(t=>String(t.teamSide||t.side||'')===side)||null;
    opp=teams.find(t=>String(t.teamSide||t.side||'')!==side)||null;
  }else if(side.includes('WEST')){
    own=teams.TEAM_WEST||teams.west||teams.WEST||null;
    opp=teams.TEAM_EAST||teams.east||teams.EAST||null;
  }else if(side.includes('EAST')){
    own=teams.TEAM_EAST||teams.east||teams.EAST||null;
    opp=teams.TEAM_WEST||teams.west||teams.WEST||null;
  }
  return {own,opp};
}
function finiteNum(v){
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function perMatchTeamStat(match,playerRow,key){
  const {own,opp}=matchTeamObjects(match,playerRow);
  if(!own)return null;

  if(key==='possession')
    return finiteNum(own.possession?.percent ?? own.possessionPercent ?? own.possession);

  // IMPORTANT:
  // For xG cards use the match-local shot/chance total first.
  // Do not use any season/player aggregate aliases if they exist.
  if(key==='xg')
    return finiteNum(
      own.shots?.xg ??
      own.matchXG ??
      own.matchXg ??
      own.xG ??
      own.pseudoXg
    );

  if(key==='xga')
    return finiteNum(
      opp?.shots?.xg ??
      opp?.matchXG ??
      opp?.matchXg ??
      opp?.xG ??
      opp?.pseudoXg
    );

  return null;
}
function avgTeamStat(rows,key){
  // One value per actual match, then arithmetic mean.
  // This deliberately ignores repeated player rows and never sums xG across matches.
  const byGame=new Map();
  for(const r of rows){
    const gid=String(r.match?.gameId||r.match?.id||r.match?.game_uid||'');
    if(!gid || byGame.has(gid))continue;
    const v=perMatchTeamStat(r.match,r,key);
    if(v!==null)byGame.set(gid,v);
  }
  const vals=[...byGame.values()];
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function teamCompanionCards(rows){
  const poss=avgTeamStat(rows,'possession');
  const xg=avgTeamStat(rows,'xg');
  const xga=avgTeamStat(rows,'xga');
  const card=(label,value,detail)=>`<div class="metric-card team-metric-card"><div class="label">${label}</div><div class="value">${value}</div><div class="detail">${detail}</div></div>`;
  return [
    card('チーム平均ポゼッション',poss===null?'—':`${fmt(poss,1)}%`,'出場試合時の1試合平均'),
    card('チーム平均xG',xg===null?'—':fmt(xg,2),'出場試合時の1試合平均'),
    card('チーム平均被xG',xga===null?'—':fmt(xga,2),'出場試合時の1試合平均')
  ].join('');
}
function render(){const identity=findIdentity();if(!identity){$('status').textContent='選手が見つかりません';return}document.title=`${identity.currentName} - 選手詳細`;$('playerName').textContent=identity.currentName;if($('profileSkin').dataset.name!==identity.currentName){$('profileSkin').dataset.name=identity.currentName;$('profileSkin').replaceChildren(window.EntitySkins.avatar(identity.currentName,64));}const aliases=(identity.aliases||[]).filter(x=>x!==identity.currentName);$('aliases').textContent=aliases.length?`旧名・別名：${aliases.join(' / ')}`:'';renderPresets();const rows=appearances(),a=aggregate(rows);renderStatsHeatmaps(rows);$('status').textContent=`出場時間 ${minutesText(rows)}（選択したポジションの実績）`;$('overview').innerHTML=[['出場時間',minutesText(rows),''],['勝敗',`${a.wins}勝 ${a.draws}分 ${a.losses}敗`,`${a.points} pt`],['GF / GA',`${a.gf} / ${a.ga}`,a.games?`平均 ${fmt(a.gf/a.games,2)} / ${fmt(a.ga/a.games,2)}`:'平均 —'],['平均採点',a.avgRating===null?'—':fmt(a.avgRating,2),a.ratedGames?minutesText(rows):'採点なし']].map(x=>`<div class="metric-card"><div class="label">${x[0]}</div><div class="value ${x[0]==='勝敗'?'small-value':''}">${x[1]}</div><div class="detail">${x[2]}</div></div>`).join('')+teamCompanionCards(rows);renderAbility(identity.playerId);renderHistory(rows);$('matchRows').innerHTML=rows.length?[...rows].sort((a,b)=>b.match.gameId.localeCompare(a.match.gameId)).map(r=>`<tr><td>${r.match.date||'—'}</td><td><a href="match.html?id=${encodeURIComponent(r.match.gameId)}">${escapeHtml(r.match.gameId)}</a></td><td>${r.match.category==='exhibition'?'EX':'通常'}</td><td>${positionBadges(r.positionLabel||r.position)}</td><td>${escapeHtml(r.preset||'—')}</td><td class="num"><b class="${get(r.stats,'rating.mom',false)?'player-match-mom':''}">${get(r.stats,'rating.mom',false)?'★ ':''}${Number.isFinite(Number(get(r.stats,'rating.value',NaN)))?fmt(get(r.stats,'rating.value'),2):'—'}</b></td><td class="num">${get(r.stats,'shots.goals')}</td><td class="num">${get(r.stats,'passes.successful')}/${get(r.stats,'passes.attempts')}</td><td class="num">${fmt(get(r.stats,'runningDistance'),1)}m</td></tr>`).join(''):'<tr><td colspan="9" class="empty">該当試合なし</td></tr>'}
document.querySelectorAll('.player-view-tab').forEach(b=>b.onclick=()=>view(b.dataset.view));document.querySelectorAll('#categoryTabs .tab').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;document.querySelectorAll('#categoryTabs .tab').forEach(x=>x.classList.toggle('active',x===b));selectedPresets.clear();render()}));document.querySelectorAll('#positionChecks input').forEach(i=>i.addEventListener('change',()=>{i.checked?selectedPositions.add(i.value):selectedPositions.delete(i.value);selectedPresets.clear();render()}));$('positionAll').onclick=()=>setPositions(['GK','DF','MF','FW']);$('positionFP').onclick=()=>setPositions(['DF','MF','FW']);$('positionNone').onclick=()=>setPositions([]);['from','to'].forEach(id=>$(id).addEventListener('input',()=>{selectedPresets.clear();render()}));$('resetPeriod').onclick=()=>{$('from').value='';$('to').value='';selectedPresets.clear();render()};fetch('data/player-match-stats.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(j=>{data=j;syncPositionChecks();render();view('stats')}).catch(e=>$('status').textContent=`読込失敗: ${e.message}`);

function renderHistory(rows){const order=['playedMinutes','shots.goals','assists','keyPasses','passes.attempts','passes.successful','passes.failed','passes.out','shots.attempts','shots.onTarget','shots.offTarget','shots.blocked','shots.woodwork','shots.xg','dribbles.attempts','dribbles.successful','dribbles.failed','tackles.attempts','tackles.won','tackles.failed','runningDistance'];const cols=metrics.filter((m,i,a)=>a.findIndex(x=>x[1]===m[1])===i).sort((a,b)=>(order.includes(a[1])?order.indexOf(a[1]):99)-(order.includes(b[1])?order.indexOf(b[1]):99));const read=(r,path)=>{const v=path.split('.').reduce((x,k)=>x?.[k],r.stats);return v!=null&&Number.isFinite(Number(v))?Number(v):null;};const text=(v,d)=>v===null?'—':fmt(v,d);const sums=cols.map(([,path])=>{const vals=rows.map(r=>read(r,path)).filter(v=>v!==null);return{value:vals.length?vals.reduce((a,b)=>a+b,0):null,n:vals.length};});const table=$('statRows').closest('table');table.classList.add('history-matrix');table.innerHTML='<thead><tr><th>試合 / 日付</th><th>POS</th><th>採点</th>'+cols.map(([label,,unit])=>'<th>'+label+(unit?' ('+unit+')':'')+'</th>').join('')+'</tr><tr class="summary-row"><th>合計 ('+minutesText(rows)+')</th><td>—</td><td>—</td>'+cols.map((m,i)=>'<td>'+text(sums[i].value,m[3])+'</td>').join('')+'</tr><tr class="summary-row"><th>実績のある試合平均</th><td>—</td><td>'+text(aggregate(rows).avgRating,2)+'</td>'+cols.map((m,i)=>'<td title="記録のある'+sums[i].n+'試合で平均">'+text(sums[i].n?sums[i].value/sums[i].n:null,2)+'</td>').join('')+'</tr></thead><tbody id="statRows">'+[...rows].sort((a,b)=>b.match.gameId.localeCompare(a.match.gameId)).map(r=>'<tr><th><a href="match.html?id='+encodeURIComponent(r.match.gameId)+'">'+escapeHtml(r.match.gameId)+'</a><small>'+escapeHtml(r.match.date||'')+'</small></th><td>'+positionBadges(r.positionLabel||r.position)+'</td><td>'+text(read(r,'rating.value'),2)+'</td>'+cols.map((m,i)=>'<td>'+text(read(r,m[1]),m[3])+'</td>').join('')+'</tr>'+(r.stats.positionStats?.length>1?r.stats.positionStats.map(part=>'<tr class="position-detail-row"><th>↳ '+escapeHtml(part.position)+' '+(part.seconds/60).toFixed(1)+'分</th><td>'+positionBadges(part.position)+'</td><td>'+text(part.stats.rating?.value??null,2)+'</td>'+cols.map(m=>'<td>'+text(read({stats:part.stats},m[1]),m[3])+'</td>').join('')+'</tr>').join(''):'')).join('')+'</tbody>';
}
