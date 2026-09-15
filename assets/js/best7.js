import {playedSeconds} from './appearance-format.mjs';
import {selectRatingTeam} from './rating-best7.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const POS=['GK','DF','MF','FW'];
let data=null,days=[],dayIndex=0;

function ratingOf(p){
  const v=Number(p?.stats?.rating?.value);
  return Number.isFinite(v)?v:null;
}
function dayKey(m){
  if(m?.date)return String(m.date);
  const id=String(m?.gameId||m?.matchId||'');
  const x=id.match(/^(\d{4})(\d{2})(\d{2})/);
  return x?`${x[1]}-${x[2]}-${x[3]}`:id.slice(0,8);
}
function officialMatches(){
  return (data?.matches||[]).filter(m=>m.includeOverall!==false && m.category!=='exhibition');
}
function buildDays(){
  const set=new Set(officialMatches().map(dayKey).filter(Boolean));
  days=[...set].sort();
}
function rowsForDay(day){
  return officialMatches().filter(m=>dayKey(m)===day);
}
function candidatesForDay(day){
  const matches=rowsForDay(day);
  const buckets=new Map();
  for(const m of matches){
    for(const original of m.players||[])for(const part of original.stats?.positionStats||[{position:original.position,stats:original.stats}]){const p={...original,position:part.position,stats:part.stats};
      const pos=String(p.position||'').toUpperCase();
      if(!POS.includes(pos))continue;
      const rating=ratingOf(p);
      if(rating===null)continue;
      const key=`${p.playerId}|${pos}`;
      const b=buckets.get(key)||{playerId:p.playerId,name:p.currentName||p.name||p.playerId,pos,seconds:0,timeKnown:true,games:0,ratings:[],matchIds:[]};
      const seconds=part.seconds??playedSeconds(original);if(seconds==null)b.timeKnown=false;else b.seconds+=seconds;b.games+=pos===(original.countPosition||original.position)?1:0;
      b.ratings.push(rating);
      b.matchIds.push(m.gameId||m.matchId||'');
      buckets.set(key,b);
    }
  }
  const byPos={GK:[],DF:[],MF:[],FW:[]};
  for(const b of buckets.values()){
    if(b.games<2)continue;
    b.avg=b.ratings.reduce((a,x)=>a+x,0)/b.ratings.length;
    b.min=Math.min(...b.ratings); b.max=Math.max(...b.ratings);
    byPos[b.pos].push(b);
  }
  for(const pos of POS)byPos[pos].sort((a,b)=>b.avg-a.avg||b.games-a.games||a.name.localeCompare(b.name));
  return byPos;
}

function initialFormation(cands){
  const counts={DF:2,MF:2,FW:2};
  const notes=[];
  let best=null;
  for(const gainPos of ['DF','MF','FW']){
    const third=cands[gainPos][2];
    if(!third)continue;
    for(const losePos of ['DF','MF','FW']){
      if(losePos===gainPos)continue;
      const second=cands[losePos][1];
      if(!second)continue;
      const diff=third.avg-second.avg;
      if(diff>=0.5 && (!best||diff>best.diff)){
        best={gainPos,losePos,diff,third,second};
      }
    }
  }
  if(best){
    counts[best.gainPos]=3;
    counts[best.losePos]=1;
    notes.push(`${best.gainPos}3位 ${best.third.name}（${best.third.avg.toFixed(2)}）が${best.losePos}2位 ${best.second.name}（${best.second.avg.toFixed(2)}）を${best.diff.toFixed(2)}上回ったため、${best.gainPos}を3名・${best.losePos}を1名に変更。`);
  }else{
    notes.push('FPは基本フォーメーションの2-2-2で選出。3位と他ポジション2位に0.50以上の差がないため変更なし。');
  }
  return {counts,notes};
}

function resolveUnique(cands,formation){
 const result=selectRatingTeam(cands,{GK:1,...formation.counts});
 const notes=[result.count===7?'同一選手の重複を避け、7人の平均採点が最大になるポジションの組合せを選出。チーム平均採点 '+result.average.toFixed(3)+'。':'選出可能な人数を優先し、その中で採点合計が最大になる組合せを選出。'];
 for(const [pos,list] of Object.entries(result.selected))for(const p of list){const alternatives=Object.entries(cands).filter(([other,rows])=>other!==pos&&rows.some(x=>x.playerId===p.playerId));if(alternatives.length)notes.push(p.name+'は '+[pos,...alternatives.map(([other])=>other)].join(' / ')+' の候補。代わりに選出される選手も含めたチーム平均を比較し、'+pos+'で選出。');}
 return {...result,notes};
}

function card(x,pos){
  if(!x)return `<div class="best7-player missing"><span>${pos}</span><b>選出なし</b><small>資格者不足</small></div>`;
  return `<a class="best7-player pos-${pos.toLowerCase()}" href="player.html?id=${encodeURIComponent(x.playerId)}">
    <span class="best7-pos">${pos}</span>
    <b>${esc(x.name)}</b>
    <strong>${x.avg.toFixed(2)}</strong>
    <small>${x.timeKnown?(x.seconds/60).toFixed(1)+'分':'時間未取得'}</small>
  </a>`;
}
function renderLine(id,pos,list,count){
  const host=$(id);
  const arr=[...list];
  while(arr.length<count)arr.push(null);
  host.dataset.count=count;
  host.innerHTML=arr.map(x=>card(x,pos)).join('');
}

function renderCandidates(cands,selected){
  $('candidateColumns').innerHTML=POS.map(pos=>{
    const chosen=new Set(selected[pos].map(x=>x.playerId));
    const rows=cands[pos];
    return `<div class="candidate-column"><div class="candidate-head pos-${pos.toLowerCase()}"><b>${pos}</b><span>${rows.length}人</span></div>
      <div class="candidate-list">${rows.length?rows.map((x,i)=>`<a href="player.html?id=${encodeURIComponent(x.playerId)}" class="${chosen.has(x.playerId)?'is-selected':''}">
        <span class="candidate-rank">${i+1}</span><b>${esc(x.name)}</b><strong>${x.avg.toFixed(2)}</strong><small>${x.timeKnown?(x.seconds/60).toFixed(1)+'分':'時間未取得'}</small>
      </a>`).join(''):'<div class="candidate-empty">資格者なし</div>'}</div></div>`;
  }).join('');
}

function render(){
  if(!days.length){
    $('status').textContent='対象となる通常試合がありません。';
    return;
  }
  const day=days[dayIndex];
  $('daySelect').value=day;
  const matches=rowsForDay(day);
  const cands=candidatesForDay(day);
  const formation=initialFormation(cands);
  const resolved=resolveUnique(cands,formation);
  const sel=resolved.selected;

  $('sectionDate').textContent=day;
  $('sectionGames').textContent=`${matches.length}試合`;
  $('formation').textContent=`1-${formation.counts.DF}-${formation.counts.MF}-${formation.counts.FW}`;
  $('status').textContent='';

  renderLine('gkLine','GK',sel.GK,1);
  renderLine('dfLine','DF',sel.DF,formation.counts.DF);
  renderLine('mfLine','MF',sel.MF,formation.counts.MF);
  renderLine('fwLine','FW',sel.FW,formation.counts.FW);

  const total=POS.reduce((n,p)=>n+sel[p].length,0);
  const shortage=[];
  for(const pos of POS)if(sel[pos].length<resolved.needs[pos])shortage.push(`${pos} ${resolved.needs[pos]-sel[pos].length}枠`);
  const reasons=[...formation.notes,...resolved.notes];
  if(shortage.length)reasons.push(`選出資格者が不足しているため、${shortage.join('・')}は空席。`);
  $('selectionReason').innerHTML=reasons.map((x,i)=>`<p><span>${i+1}</span>${esc(x)}</p>`).join('');

  $('selectedList').innerHTML=POS.flatMap(pos=>sel[pos].map(x=>`<a href="player.html?id=${encodeURIComponent(x.playerId)}"><span class="mini-pos pos-${pos.toLowerCase()}">${pos}</span><b>${esc(x.name)}</b><strong>${x.avg.toFixed(2)}</strong><small>${x.timeKnown?(x.seconds/60).toFixed(1)+'分':'時間未取得'}</small></a>`)).join('') || '<div class="candidate-empty">選出なし</div>';
  renderCandidates(cands,sel);

  $('prevDay').disabled=dayIndex<=0;
  $('nextDay').disabled=dayIndex>=days.length-1;
}
function initSelect(){
  $('daySelect').innerHTML=days.map(d=>`<option value="${d}">${d}</option>`).join('');
  dayIndex=Math.max(0,days.length-1);
  $('daySelect').value=days[dayIndex]||'';
}
$('prevDay').onclick=()=>{if(dayIndex>0){dayIndex--;render()}};
$('nextDay').onclick=()=>{if(dayIndex<days.length-1){dayIndex++;render()}};
$('daySelect').onchange=e=>{const i=days.indexOf(e.target.value);if(i>=0){dayIndex=i;render()}};

fetch('data/player-match-stats.json').then(r=>{
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  return r.json();
}).then(j=>{
  data=j;buildDays();initSelect();render();
}).catch(e=>{
  $('status').textContent=`読込失敗: ${e.message}`;
});
