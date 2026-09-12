const $=id=>document.getElementById(id);
const get=(o,p,d=0)=>p.split(".").reduce((v,k)=>v?.[k],o)??d;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(v,d=1)=>Number(v||0).toFixed(d);
const POS=['GK','DF','MF','FW'];
const ABILITIES=[
 {key:'pass',label:'パス'},
 {key:'shoot',label:'シュート'},
 {key:'dribble',label:'ドリブル'},
 {key:'tackle',label:'タックル'},
 {key:'intercept',label:'カット/ブロック'},
 {key:'activity',label:'積極性'}
];
const ATTACK_W={shoot:.35,pass:.25,dribble:.20,activity:.10,tackle:.05,intercept:.05};
const DEFENSE_W={intercept:.35,tackle:.25,pass:.15,dribble:.10,activity:.10,shoot:.05};

let data=null,profiles=[],selected=new Set(),west=[],east=[],assignedPos={},solutions=[],solutionIndex=0;

function num(v){v=Number(v);return Number.isFinite(v)?v:0}
function categoryOk(m){
 const c=$('category').value;
 return c==='all'||(c==='official'?m.includeOverall:m.category==='exhibition');
}
function sum(rows,path){return rows.reduce((a,r)=>a+num(get(r.stats,path,0)),0)}
function currentEventCount(){
 const keys=new Set();
 for(const m of data.matches||[])if(categoryOk(m)){
   const id=String(m.gameId||'');
   const hit=id.match(/^(\d{8})/);
   keys.add(hit?hit[1]:String(m.date||id));
 }
 return Math.max(1,keys.size);
}
function abilityConfidence(rows){return Math.max(0,Math.min(1,rows.length/Math.max(1,currentEventCount()*2)))}
function lerpAbility(raw,points){
 if(!Number.isFinite(raw))return 50;
 if(raw<=points[0][0]){const [x0,y0]=points[0],[x1,y1]=points[1];return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 for(let i=1;i<points.length;i++){const [x0,y0]=points[i-1],[x1,y1]=points[i];if(raw<=x1)return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 const [x0,y0]=points.at(-2),[x1,y1]=points.at(-1);return y1+(raw-x1)*(y1-y0)/(x1-x0)
}
function posFactor(pos,key){
 const table={
  pass:{GK:1.5,DF:1,MF:1,FW:1.2},
  shoot:{GK:1,DF:2,MF:1.5,FW:1},
  dribble:{GK:1,DF:1,MF:1,FW:1},
  tackle:{GK:1,DF:1,MF:1.5,FW:1.6},
  intercept:{GK:1,DF:1,MF:1.4,FW:1.4}
 };
 return table[key]?.[pos]??1;
}
function abilityRaw(rows,pos,key){
 if(!rows.length)return 0;
 const g=rows.length,av=p=>sum(rows,p)/g;
 if(key==='pass'){const ok=av('stats.passes.successful'),att=av('stats.passes.attempts');return (ok-Math.max(0,att-ok)*.25+av('stats.keyPasses')*.25+av('stats.assists')*.25)*posFactor(pos,key)}
 if(key==='shoot'){const att=av('stats.shots.attempts');if(att<=0)return 0;const on=av('stats.shots.onTarget');return (on-Math.max(0,att-on)*.25+(av('stats.shots.goals')-av('stats.shots.xg'))*.5)*posFactor(pos,key)}
 if(key==='dribble'){const ok=av('stats.dribbles.successful'),att=av('stats.dribbles.attempts');return (ok-Math.max(0,att-ok)*.25)*posFactor(pos,key)}
 if(key==='tackle'){const ok=av('stats.tackles.won'),att=av('stats.tackles.attempts');return (ok-Math.max(0,att-ok)*.1)*posFactor(pos,key)}
 if(key==='intercept'){
   if(pos==='GK')return av('stats.saves.total');
   return (av('stats.interceptions.won')+av('stats.interceptions.blocked')+av('stats.blocks.shot'))*posFactor(pos,key);
 }
 if(key==='activity'){
   if(pos==='GK')return av('stats.runningDistance')/20;
   return av('stats.runningDistance')/100+av('stats.touches')/20;
 }
 return 0;
}
function baseAbility(raw,pos,key){
 if(key==='pass')return lerpAbility(raw,[[0,35],[2,45],[4,55],[6,65],[8,75],[10,85],[12,95]]);
 if(key==='shoot')return lerpAbility(raw,[[0,35],[1,45],[2,55],[3,65],[4,75],[5,80],[7,90],[10,99]]);
 if(key==='dribble')return lerpAbility(raw,[[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]);
 if(key==='tackle')return lerpAbility(raw,[[-1,30],[0,35],[1,45],[2,55],[3,65],[4,75],[5,85],[6,92]]);
 if(key==='intercept'){
   if(pos==='GK')return lerpAbility(raw,[[0,35],[2,45],[4,58],[5,65],[6,70],[7,76],[8,81],[10,90]]);
   return lerpAbility(raw,[[0,35],[1,47],[2,58],[3,68],[4,78],[5,86],[6,92]]);
 }
 if(key==='activity'){
   if(pos==='GK')return lerpAbility(raw,[[4,40],[5,45],[6,50],[7,55],[8,60],[9,65],[10,70]]);
   return lerpAbility(raw,[[5,40],[6,45],[7,50],[8,55],[9,60],[10,65],[11,70],[12,75],[14,85]]);
 }
 return 50;
}
function ability(rows,pos,key){
 if(!rows.length)return 50;
 if(key==='pass'&&sum(rows,'stats.passes.attempts')<=0)return 50;
 if(key==='shoot'&&sum(rows,'stats.shots.attempts')<=0)return 50;
 if(key==='dribble'&&sum(rows,'stats.dribbles.attempts')<=0)return 50;
 if(key==='tackle'&&sum(rows,'stats.tackles.attempts')<=0)return 50;
 if(key==='intercept'&&pos==='GK'&&sum(rows,'stats.saves.total')<=0)return 50;
 const base=baseAbility(abilityRaw(rows,pos,key),pos,key);
 return Math.max(20,Math.min(99,Math.round(50+(base-50)*abilityConfidence(rows))));
}

function profileFor(identity){
 const rows=[];
 for(const m of data.matches||[])if(categoryOk(m))for(const p of m.players||[])if(p.playerId===identity.playerId)rows.push({...p,match:m});
 if(!rows.length)return null;
 const posCount={GK:0,DF:0,MF:0,FW:0};
 for(const r of rows){const p=String(r.position||'').toUpperCase();if(p in posCount)posCount[p]++}
 const mainPos=Object.entries(posCount).sort((a,b)=>b[1]-a[1])[0]?.[0]||'DF';
 const posRows={};
 for(const pos of POS)posRows[pos]=rows.filter(r=>String(r.position||'').toUpperCase()===pos);
 return {id:identity.playerId,name:identity.currentName||identity.name||identity.playerId,rows,games:rows.length,posCount,mainPos,posRows};
}
function rebuildProfiles(){
 profiles=(data.players||[]).map(profileFor).filter(Boolean);
 const min=Number($('minGames').value||1);
 profiles=profiles.filter(p=>p.games>=min);
 const ids=new Set(profiles.map(p=>p.id));
 selected=new Set([...selected].filter(id=>ids.has(id)));
 west=west.filter(id=>ids.has(id));east=east.filter(id=>ids.has(id));
 render();
}
function pby(id){return profiles.find(p=>p.id===id)}
function chosenPos(id){
 const p=pby(id);if(!p)return 'DF';
 const requested=assignedPos[id];
 if(requested&&p.posRows[requested]?.length)return requested;
 return p.mainPos;
}
function playerAbilities(id){
 const p=pby(id);if(!p)return Object.fromEntries(ABILITIES.map(a=>[a.key,50]));
 const pos=chosenPos(id),rows=p.posRows[pos]?.length?p.posRows[pos]:p.rows;
 return Object.fromEntries(ABILITIES.map(a=>[a.key,ability(rows,pos,a.key)]));
}
function attackScore(id){const a=playerAbilities(id);return Object.entries(ATTACK_W).reduce((s,[k,w])=>s+a[k]*w,0)}
function defenseScore(id){const a=playerAbilities(id);return Object.entries(DEFENSE_W).reduce((s,[k,w])=>s+a[k]*w,0)}
function teamMean(ids,fn){return ids.length?ids.reduce((s,id)=>s+fn(id),0)/ids.length:0}
function teamAbility(ids,key){return ids.length?ids.reduce((s,id)=>s+playerAbilities(id)[key],0)/ids.length:0}

function normalizedTeamWeights(){
 let a=Number($('attackWeight').value),d=Number($('defenseWeight').value);
 if(a+d<=0)return {attack:.5,defense:.5};
 return {attack:a/(a+d),defense:d/(a+d)};
}
function splitScore(w,e){
 const tw=normalizedTeamWeights();
 const attack=Math.abs(teamMean(w,attackScore)-teamMean(e,attackScore));
 const defense=Math.abs(teamMean(w,defenseScore)-teamMean(e,defenseScore));
 const abilityDiff=ABILITIES.reduce((s,a)=>s+Math.abs(teamAbility(w,a.key)-teamAbility(e,a.key)),0)/ABILITIES.length;
 return attack*tw.attack+defense*tw.defense+abilityDiff*.15;
}

function posOptions(p,id){
 return POS.map(pos=>{
   const n=p.posRows[pos]?.length||0;
   return `<option value="${pos}" ${chosenPos(id)===pos?'selected':''} ${n===0?'disabled':''}>${pos}${n?` (${n})`:''}</option>`;
 }).join('');
}
function candidateCard(p){
 const side=west.includes(p.id)?'west':east.includes(p.id)?'east':'';
 const checked=selected.has(p.id);
 return `<article class="candidate-card ${side?`assigned-${side}`:''}" draggable="true" data-drag-id="${esc(p.id)}">
   <input type="checkbox" data-select="${esc(p.id)}" ${checked?'checked':''}>
   <div class="candidate-main"><b>${esc(p.name)}</b><span class="pos-badge">${p.mainPos}</span><small>${p.games}試合</small></div>
   <div class="candidate-actions">
     <button data-assign="west" data-id="${esc(p.id)}" type="button">W</button>
     <button data-assign="east" data-id="${esc(p.id)}" type="button">E</button>
     ${side?`<button data-assign="none" data-id="${esc(p.id)}" type="button">×</button>`:''}
   </div>
 </article>`;
}
function renderCandidates(){
 const q=$('search').value.trim().toLowerCase();
 const list=profiles.filter(p=>!q||p.name.toLowerCase().includes(q)).sort((a,b)=>b.games-a.games||a.name.localeCompare(b.name));
 $('candidateList').innerHTML=list.map(candidateCard).join('')||'<div class="empty">該当選手なし</div>';
 $('candidateList').querySelectorAll('[data-select]').forEach(x=>x.onchange=()=>{
   if(x.checked)selected.add(x.dataset.select);else{selected.delete(x.dataset.select);assign(x.dataset.select,'none',false)}
   solutions=[];renderCandidates();
 });
 $('candidateList').querySelectorAll('[data-assign]').forEach(b=>b.onclick=()=>assign(b.dataset.id,b.dataset.assign));
 $('candidateList').querySelectorAll('[draggable]').forEach(el=>el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.dragId));
 $('selectionStatus').textContent=`自動分け候補 ${selected.size}人`;
}
function teamCard(id,side){
 const p=pby(id);if(!p)return '';
 const a=playerAbilities(id);
 return `<article class="team-player ${side}" draggable="true" data-drag-id="${esc(id)}">
   <div class="team-player-main"><b>${esc(p.name)}</b><small>${chosenPos(id)}時の能力を使用</small></div>
   <select class="pos-select" data-pos-id="${esc(id)}">${posOptions(p,id)}</select>
   <div class="team-mini-score"><span>攻 ${fmt(attackScore(id),0)}</span><span>守 ${fmt(defenseScore(id),0)}</span></div>
   <button class="remove-player" data-remove="${esc(id)}" type="button">×</button>
 </article>`;
}
function assign(id,side,doRender=true){
 const size=Number($('teamSize').value);
 selected.add(id);
 west=west.filter(x=>x!==id);east=east.filter(x=>x!==id);
 if(side==='west'){if(west.length>=size){if(doRender)alert(`WESTは${size}人までです。`);return}west.push(id)}
 if(side==='east'){if(east.length>=size){if(doRender)alert(`EASTは${size}人までです。`);return}east.push(id)}
 solutions=[];
 if(doRender)render();
}
function renderTeams(){
 $('westCount').textContent=`${west.length}人`;$('eastCount').textContent=`${east.length}人`;
 $('westTeam').innerHTML=west.map(id=>teamCard(id,'west')).join('')||'<div class="team-empty">ここへドラッグ</div>';
 $('eastTeam').innerHTML=east.map(id=>teamCard(id,'east')).join('')||'<div class="team-empty">ここへドラッグ</div>';

 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>assign(b.dataset.remove,'none'));
 document.querySelectorAll('[data-pos-id]').forEach(sel=>sel.onchange=()=>{assignedPos[sel.dataset.posId]=sel.value;solutions=[];renderComparison();renderTeams()});
 document.querySelectorAll('.team-player[draggable]').forEach(el=>el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.dragId));
 renderComparison();
}
function setupDropZones(){
 document.querySelectorAll('.drop-zone').forEach(zone=>{
   zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over')};
   zone.ondragleave=()=>zone.classList.remove('drag-over');
   zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(id)assign(id,zone.dataset.side)};
 });
}

function renderComparison(){
 const visible=west.length>0&&east.length>0;
 $('comparisonArea').classList.toggle('comparison-disabled',!visible);
 if(!visible){
   $('balanceSummary').innerHTML='<div class="balance-placeholder">WEST / EASTに1人以上配置すると比較を表示します。</div>';
   $('offenseDefenseCompare').innerHTML='';
   $('balanceRows').innerHTML='<tr><td colspan="4" class="empty">比較待ち</td></tr>';
   $('historySummary').innerHTML='';
   return;
 }
 const wa=teamMean(west,attackScore),ea=teamMean(east,attackScore),wd=teamMean(west,defenseScore),ed=teamMean(east,defenseScore);
 const tw=normalizedTeamWeights();
 const overallW=wa*tw.attack+wd*tw.defense,overallE=ea*tw.attack+ed*tw.defense;
 const diff=overallW-overallE;
 $('balanceSummary').innerHTML=`
   <div class="balance-card west-card"><span>WEST 総合</span><b>${fmt(overallW,1)}</b><small>攻 ${fmt(wa,1)} / 守 ${fmt(wd,1)}</small></div>
   <div class="balance-card center-card"><span>戦力差</span><b>${Math.abs(diff)<.05?'ほぼ互角':`${diff>0?'WEST':'EAST'} +${fmt(Math.abs(diff),1)}`}</b><small>攻撃 ${Math.round(tw.attack*100)}% / 守備 ${Math.round(tw.defense*100)}%</small></div>
   <div class="balance-card east-card"><span>EAST 総合</span><b>${fmt(overallE,1)}</b><small>攻 ${fmt(ea,1)} / 守 ${fmt(ed,1)}</small></div>`;

 const odRow=(label,w,e,cls)=>{const max=Math.max(1,w,e),dw=w-e;return `<div class="od-row ${cls}">
   <div class="od-label">${label}</div>
   <div class="od-side west-text"><b>${fmt(w,1)}</b><div class="meter west-meter"><i style="width:${Math.min(100,w/max*100)}%"></i></div></div>
   <div class="od-diff">${Math.abs(dw)<.05?'±0':`${dw>0?'W':'E'} +${fmt(Math.abs(dw),1)}`}</div>
   <div class="od-side east-text"><b>${fmt(e,1)}</b><div class="meter east-meter"><i style="width:${Math.min(100,e/max*100)}%"></i></div></div>
 </div>`};
 $('offenseDefenseCompare').innerHTML=odRow('攻撃',wa,ea,'attack-row')+odRow('守備',wd,ed,'defense-row');

 $('balanceRows').innerHTML=ABILITIES.map(a=>{
   const w=teamAbility(west,a.key),e=teamAbility(east,a.key),d=w-e;
   return `<tr><td>${a.label}</td><td class="num west-text">${fmt(w,1)}</td><td class="num east-text">${fmt(e,1)}</td><td class="num">${Math.abs(d)<.05?'±0':`${d>0?'W':'E'} +${fmt(Math.abs(d),1)}`}</td></tr>`;
 }).join('');
 renderHistory();
}

function sideSet(m,side){return new Set((m.players||[]).filter(p=>p.teamSide===side).map(p=>p.playerId))}
function containsAll(set,ids){return ids.every(id=>set.has(id))}
function historicalMatchups(){
 if(!west.length||!east.length)return [];
 const out=[];
 for(const m of data.matches||[]){
   if(!categoryOk(m))continue;
   const mw=sideSet(m,'TEAM_WEST'),me=sideSet(m,'TEAM_EAST');
   if(containsAll(mw,west)&&containsAll(me,east)){
     const w=Number(m.finalScore?.west ?? (m.players||[]).find(p=>p.teamSide==='TEAM_WEST')?.goalsFor ?? 0);
     const e=Number(m.finalScore?.east ?? (m.players||[]).find(p=>p.teamSide==='TEAM_EAST')?.goalsFor ?? 0);
     out.push({gameId:m.gameId,date:m.date,west:w,east:e,reversed:false});
   }else if(containsAll(me,west)&&containsAll(mw,east)){
     const oldW=Number(m.finalScore?.west ?? (m.players||[]).find(p=>p.teamSide==='TEAM_WEST')?.goalsFor ?? 0);
     const oldE=Number(m.finalScore?.east ?? (m.players||[]).find(p=>p.teamSide==='TEAM_EAST')?.goalsFor ?? 0);
     out.push({gameId:m.gameId,date:m.date,west:oldE,east:oldW,reversed:true});
   }
 }
 return out;
}
function renderHistory(){
 const rows=historicalMatchups();
 if(!rows.length){
   $('historySummary').innerHTML='<div class="history-card"><span>該当対戦</span><b>0試合</b><small>指定した左右の選手が同陣営対別陣営で出場した過去試合なし</small></div>';
   return;
 }
 let win=0,draw=0,loss=0,gf=0,ga=0;
 for(const r of rows){gf+=r.west;ga+=r.east;if(r.west>r.east)win++;else if(r.west<r.east)loss++;else draw++}
 $('historySummary').innerHTML=`
   <div class="history-card"><span>該当対戦</span><b>${rows.length}試合</b><small>現在のWEST視点</small></div>
   <div class="history-card"><span>通算</span><b>${win}勝 ${draw}分 ${loss}敗</b><small>${gf}得点 ${ga}失点</small></div>
   <div class="history-games">${rows.slice().sort((a,b)=>String(b.gameId).localeCompare(String(a.gameId))).map(r=>`<a href="match.html?id=${encodeURIComponent(r.gameId)}"><span>${esc(r.date||r.gameId)}</span><b>${r.west} - ${r.east}</b>${r.reversed?'<small>東西逆</small>':''}</a>`).join('')}</div>`;
}

function combinations(arr,k,limit=250000){
 const out=[],cur=[];
 function rec(start){if(out.length>=limit)return;if(cur.length===k){out.push([...cur]);return}for(let i=start;i<=arr.length-(k-cur.length);i++){cur.push(arr[i]);rec(i+1);cur.pop();if(out.length>=limit)return}}
 rec(0);return out;
}
function autoSplit(){
 const size=Number($('teamSize').value);
 const ids=[...selected];
 if(ids.length!==size*2){alert(`自動分けする候補を${size*2}人選択してください。`);return}
 for(const id of ids)if(!assignedPos[id])assignedPos[id]=pby(id)?.mainPos||'DF';
 const anchor=ids[0],rest=ids.slice(1),comb=combinations(rest,size-1);
 const ranked=[];
 for(const c of comb){const w=[anchor,...c],set=new Set(w),e=ids.filter(x=>!set.has(x));ranked.push({w,e,score:splitScore(w,e)})}
 ranked.sort((a,b)=>a.score-b.score);
 solutions=ranked.slice(0,Math.min(50,ranked.length));solutionIndex=0;applySolution();
}
function applySolution(){if(!solutions.length)return;const s=solutions[solutionIndex%solutions.length];west=[...s.w];east=[...s.e];render()}
function selectTop(){
 const need=Number($('teamSize').value)*2;
 selected=new Set(profiles.slice().sort((a,b)=>b.games-a.games).slice(0,need).map(p=>p.id));
 west=[];east=[];solutions=[];render();
}
function clearTeams(){west=[];east=[];solutions=[];render()}

function syncWeightLabels(){
 $('attackWeightValue').textContent=`${$('attackWeight').value}%`;
 $('defenseWeightValue').textContent=`${$('defenseWeight').value}%`;
 solutions=[];renderComparison();
}
function render(){renderCandidates();renderTeams()}

for(let i=1;i<=9;i++)$('teamSize').insertAdjacentHTML('beforeend',`<option value="${i}" ${i===7?'selected':''}>${i} vs ${i}</option>`);
setupDropZones();

$('category').onchange=rebuildProfiles;
$('minGames').onchange=rebuildProfiles;
$('teamSize').onchange=()=>{west=[];east=[];solutions=[];render()};
$('search').oninput=renderCandidates;
$('selectTop').onclick=selectTop;
$('autoSplit').onclick=autoSplit;
$('nextSplit').onclick=()=>{if(!solutions.length){autoSplit();return}solutionIndex=(solutionIndex+1)%solutions.length;applySolution()};
$('clearTeams').onclick=clearTeams;
$('attackWeight').oninput=syncWeightLabels;
$('defenseWeight').oninput=syncWeightLabels;
$('resetWeights').onclick=()=>{$('attackWeight').value=50;$('defenseWeight').value=50;syncWeightLabels()};

fetch('data/player-match-stats.json').then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(j=>{
 data=j;rebuildProfiles();
}).catch(e=>{
 $('candidateList').innerHTML=`<div class="empty">読込失敗: ${esc(e.message)}</div>`;
});
