const $=x=>document.getElementById(x),pct=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:"—",fmt=(v,d=2)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toFixed(d),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let stats,raw,ai={players:{}},legacyListPos='ALL',legacySort={key:'games',dir:-1};
function mainPos(p){return Object.entries(p.positions||{}).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—"}
function rowFor(name){return stats.players.find(p=>p.name===name)}
function filteredRaw(name,pos=''){return raw.playerMatches.filter(r=>r.player===name&&(!pos||String(r.position||'').toUpperCase()===pos))}
function legacyDate(r){
 const m=String(r?.gameId||'').match(/(\d{4})(\d{2})(\d{2})/);
 return m?`${m[1]}-${m[2]}-${m[3]}`:'';
}
function legacyListDateOk(r){
 const d=legacyDate(r),from=$('legacyFrom')?.value||'',to=$('legacyTo')?.value||'';
 return (!from||d>=from)&&(!to||d<=to);
}
function legacyFilteredRows(name='',pos=''){
 return (raw?.playerMatches||[]).filter(r=>
   (!name||r.player===name)&&
   (!pos||String(r.position||'').toUpperCase()===pos)&&
   legacyListDateOk(r)
 );
}
function aggregateRaw(name,pos=''){
 const rs=filteredRaw(name,pos);
 if(!pos)return rowFor(name);
 if(!rs.length)return null;
 const base={name,games:rs.length,wins:0,draws:0,losses:0,gf:0,ga:0,goals:0,assists:0,ratingSum:0,ratingN:0,positions:{[pos]:rs.length},detailGames:0,passS:0,passF:0,dribbleS:0,dribbleF:0,tackleS:0,tackleF:0,cut:0,save:0,shoot:0,touches:0};
 for(const r of rs){
   base.gf+=Number(r.teamGoalsFor||0);base.ga+=Number(r.teamGoalsAgainst||0);
   if(r.teamGoalsFor>r.teamGoalsAgainst)base.wins++;else if(r.teamGoalsFor<r.teamGoalsAgainst)base.losses++;else base.draws++;
   const st=r.stats||{};
   base.goals+=Number(st.goals??r.goal??r.goals??0);
   base.assists+=Number(st.assists??r.assist??r.assists??0);
   if(Number.isFinite(Number(st.rating??r.rating))){base.ratingSum+=Number(st.rating??r.rating);base.ratingN++}
   const d=st.detail||r.detail||{};
   if(Object.keys(d).length){
     base.detailGames++;
     base.passS+=Number(d.PS||d.passS||0);base.passF+=Number(d.PF||d.passF||0);
     base.dribbleS+=Number(d.DS||d.dribbleS||0);base.dribbleF+=Number(d.DF||d.dribbleF||0);
     base.tackleS+=Number(d.TS||d.tackleS||0);base.tackleF+=Number(d.TF||d.tackleF||0);
     base.cut+=Number(d.CUT||d.cut||0);base.save+=Number(d.SAVE||d.save||0);base.shoot+=Number(d.SHOOT||d.shoot||0);base.touches+=Number(d.HOLD||d.hold||0);
   }
 }
 base.rating=base.ratingN?base.ratingSum/base.ratingN:null;
 return base;
}
function legacyListAggregate(name,pos=''){
 const rs=legacyFilteredRows(name,pos);
 if(!rs.length)return null;
 const base={name,games:rs.length,wins:0,draws:0,losses:0,goals:0,assists:0,ratingSum:0,ratingN:0,positions:{},detailGames:0,passS:0,passF:0,dribbleS:0,dribbleF:0,tackleS:0,tackleF:0,cut:0,save:0,shoot:0,touches:0};
 for(const r of rs){
   const rp=String(r.position||'').toUpperCase();base.positions[rp]=(base.positions[rp]||0)+1;
   if(r.teamGoalsFor>r.teamGoalsAgainst)base.wins++;else if(r.teamGoalsFor<r.teamGoalsAgainst)base.losses++;else base.draws++;
   const st=r.stats||{};base.goals+=Number(st.goals||0);base.assists+=Number(st.assists||0);
   if(Number.isFinite(Number(st.rating))){base.ratingSum+=Number(st.rating);base.ratingN++}
   const d=st.detail||{};
   if(d&&Object.keys(d).length){base.detailGames++;base.passS+=Number(d.PS||0);base.passF+=Number(d.PF||0);base.dribbleS+=Number(d.DS||0);base.dribbleF+=Number(d.DF||0);base.tackleS+=Number(d.TS||0);base.tackleF+=Number(d.TF||0);base.cut+=Number(d.CUT||0);base.save+=Number(d.SAVE||0);base.shoot+=Number(d.SHOOT||0);base.touches+=Number(d.HOLD||0)}
 }
 base.rating=base.ratingN?base.ratingSum/base.ratingN:null;
 return base;
}
function legacyAbilityCell(p,pos,key,ok=true){
 if(!ok)return '―';
 const v=legacyAbility(p,pos,key);if(v==null)return '―';
 const n=Math.max(20,Math.min(99,Math.round(v))),r=legacyRank(n);
 return `<span class="legacy-list-ability"><b class="power-rank ${legacyRankClass(r)}">${r}</b><small>${n}</small></span>`;
}
function legacySortValue(p,key,pos){
 if(key==='name')return p.name.toLowerCase();
 if(key==='mainPos')return mainPos(p);
 if(key==='wdl')return p.wins*3+p.draws;
 if(key==='overall')return legacyOverallValue(p,p.name,pos);
 if(['pass','shoot','dribble','tackle','cut','activity'].includes(key)){
   if((key==='shoot'||key==='dribble'||key==='tackle'||key==='activity')&&pos==='GK')return -Infinity;
   const v=legacyAbility(p,pos,key);return v==null?-Infinity:v;
 }
 return Number(p[key]??-Infinity);
}
function legacySortableHead(label,key,cls=''){
 const active=legacySort.key===key,arrow=active?(legacySort.dir>0?' ▲':' ▼'):'';
 return `<th class="${cls} sortable-head" data-sort-key="${key}">${label}<span>${arrow}</span></th>`;
}
function renderStats(){
 const q=$("legacySearch").value.toLowerCase(),pos=legacyListPos==='ALL'?'':legacyListPos;
 const names=[...new Set((raw?.playerMatches||[]).filter(legacyListDateOk).map(r=>r.player))];
 let rows=names.map(name=>legacyListAggregate(name,pos)).filter(Boolean).filter(p=>!q||p.name.toLowerCase().includes(q));
 rows.sort((a,b)=>{
   const av=legacySortValue(a,legacySort.key,pos),bv=legacySortValue(b,legacySort.key,pos);
   if(typeof av==='string')return av.localeCompare(bv)*legacySort.dir;
   return ((av===bv)?a.name.localeCompare(b.name):(av-bv)*legacySort.dir);
 });
 const head=$('legacyListHead');
 if(pos){
   head.innerHTML=`<tr>${legacySortableHead('選手','name')}${legacySortableHead('試合','games','num')}${legacySortableHead('総合','overall','num')}${legacySortableHead('パス','pass','num')}${legacySortableHead('シュート','shoot','num')}${legacySortableHead('ドリブル','dribble','num')}${legacySortableHead('タックル','tackle','num')}${legacySortableHead(pos==='GK'?'セーブ':'カット/ブロック','cut','num')}${legacySortableHead('積極性','activity','num')}</tr>`;
   $("legacyRows").innerHTML=rows.map(p=>`<tr class="legacy-row" data-player="${esc(p.name)}" data-pos="${pos}"><td><b>${esc(p.name)}</b></td><td class="num">${p.games}</td><td class="num">${(()=>{const v=legacyOverallValue(p,p.name,pos),r=legacyRank(v);return `<span class="legacy-list-ability"><b class="power-rank ${legacyRankClass(r)}">${r}</b><small>${v}</small></span>`})()}</td><td class="num">${legacyAbilityCell(p,pos,'pass')}</td><td class="num">${legacyAbilityCell(p,pos,'shoot',pos!=='GK')}</td><td class="num">${legacyAbilityCell(p,pos,'dribble',pos!=='GK')}</td><td class="num">${legacyAbilityCell(p,pos,'tackle',pos!=='GK')}</td><td class="num">${legacyAbilityCell(p,pos,'cut')}</td><td class="num">${legacyAbilityCell(p,pos,'activity',pos!=='GK')}</td></tr>`).join('');
 }else{
   head.innerHTML=`<tr>${legacySortableHead('選手','name')}${legacySortableHead('主POS','mainPos')}${legacySortableHead('試合','games','num')}${legacySortableHead('W-D-L','wdl','num')}${legacySortableHead('G','goals','num')}${legacySortableHead('A','assists','num')}${legacySortableHead('Rating','rating','num')}</tr>`;
   $("legacyRows").innerHTML=rows.map(p=>`<tr class="legacy-row" data-player="${esc(p.name)}"><td><b>${esc(p.name)}</b><small class="pos-history">${Object.entries(p.positions).map(([k,v])=>`${k}:${v}`).join(" ")}</small></td><td>${mainPos(p)}</td><td class="num">${p.games}</td><td class="num">${p.wins}-${p.draws}-${p.losses}</td><td class="num">${p.goals}</td><td class="num">${p.assists}</td><td class="num">${fmt(p.rating)}</td></tr>`).join('');
 }
 $('legacyListCount').textContent=`${rows.length}選手`;
 head.querySelectorAll('[data-sort-key]').forEach(th=>th.onclick=()=>{
   const key=th.dataset.sortKey;
   if(legacySort.key===key)legacySort.dir*=-1;else{legacySort.key=key;legacySort.dir=key==='name'||key==='mainPos'?1:-1}
   renderStats();
 });
 document.querySelectorAll('.legacy-row').forEach(tr=>tr.onclick=()=>{
   const q=new URLSearchParams({player:tr.dataset.player});
   if(tr.dataset.pos)q.set('pos',tr.dataset.pos);
   location.href=`legacy-player.html?${q}`;
 });
}
function showLegacyList(){
 $('playersTab').hidden=true;$('pairTab').hidden=true;$('statsTab').hidden=false;
 document.querySelectorAll('.legacy-tabs [data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab==='stats'));
 renderStats();
}
function posBars(p){const total=Math.max(1,p.games);return Object.entries(p.positions||{}).sort((a,b)=>b[1]-a[1]).map(([pos,n])=>`<div class="legacy-pos-bar"><b class="legacy-pos legacy-pos-${pos.toLowerCase()}">${pos}</b><div><i style="width:${n/total*100}%"></i></div><span>${n}試合 <small>${(n/total*100).toFixed(0)}%</small></span></div>`).join('')}
function rateCard(label,s,f,extra=''){const a=Number(s||0)+Number(f||0);return `<div class="legacy-rate-card"><span>${label}</span><b>${pct(s,a)}</b><small>${fmt(s,0)}成功 / ${fmt(f,0)}失敗${extra}</small></div>`}

const LEGACY_POS_FACTOR={
 pass:{GK:1.00,DF:1.00,MF:1.00,FW:1.00},
 shoot:{GK:1.00,DF:1.00,MF:1.00,FW:1.00},
 dribble:{GK:1.00,DF:1.00,MF:1.00,FW:1.00},
 tackle:{GK:1.00,DF:1.00,MF:1.30,FW:1.40},
 cut:{GK:1.00,DF:1.00,MF:1.25,FW:1.25}
};
function legacyLerp(raw,points){
 if(!Number.isFinite(raw))return null;
 if(raw<=points[0][0]){const [x0,y0]=points[0],[x1,y1]=points[1];return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 for(let i=1;i<points.length;i++){const [x0,y0]=points[i-1],[x1,y1]=points[i];if(raw<=x1)return y0+(raw-x0)*(y1-y0)/(x1-x0)}
 const [x0,y0]=points[points.length-2],[x1,y1]=points[points.length-1];return y1+(raw-x1)*(y1-y0)/(x1-x0)
}
function legacyPosConfidence(games){
 const n=Math.max(0,Number(games)||0);
 if(n<=10)return Math.min(.8,n/10*.8);
 return Math.min(1,.8+(n-10)/10*.2);
}
function applyLegacyConfidence(base,games){
 if(!Number.isFinite(base))return null;
 const c=legacyPosConfidence(games);
 return 50+(base-50)*c;
}
function legacyAbility(p,pos,key){
 if(!p||!p.games)return null;
 const g=Math.max(1,p.detailGames||p.games),f=LEGACY_POS_FACTOR[key]?.[pos]??1;
 let base=null;

 if(key==='pass'){
   if(!p.detailGames||p.passS+p.passF<=0)return null;
   // 旧式は成功率の意味が新版と異なるため成功率基準へ。
   // 50%を「明確に優秀」= B(70)相当とする。
   const rate=p.passS/(p.passS+p.passF);
   base=legacyLerp(rate,[[0.10,30],[0.20,40],[0.30,50],[0.40,60],[0.50,70],[0.60,80],[0.70,90],[0.80,95]]);
 }
 if(key==='shoot'){
   if(!p.detailGames||p.shoot<=0)return null;
   // 旧式はシュート数・ゴール数・試合数のみ。
   // FP共通基準とし、0得点と1得点の差を明確にするためゴール係数を3→6へ。
   const shotsPerGame=p.shoot/g;
   const goalsPerGame=p.goals/Math.max(1,p.games);
   const raw=(shotsPerGame+goalsPerGame*6)*f;
   base=legacyLerp(raw,[[0,35],[1,45],[2,55],[3,65],[4,72],[5,78],[6.5,85],[8,91],[10,96]]);
 }
 if(key==='dribble'){
   if(!p.detailGames||p.dribbleS+p.dribbleF<=0)return null;
   // 旧基準は高騰したため量の伸びを抑え、成功率も加味。
   const attempts=(p.dribbleS+p.dribbleF)/g,rate=p.dribbleS/(p.dribbleS+p.dribbleF);
   const volume=legacyLerp(attempts,[[0,35],[2,45],[4,55],[6,65],[9,75],[13,85],[18,92]]);
   const quality=legacyLerp(rate,[[.20,35],[.35,45],[.50,55],[.60,65],[.70,75],[.80,85],[.90,92]]);
   base=volume*.55+quality*.45;
 }
 if(key==='activity'){
   if(pos==='GK'||!p.detailGames)return null;
   // 旧式では走行距離がないため HOLD をタッチ数として積極性を評価。
   const touches=p.touches/g;
   base=legacyLerp(touches,[[1,40],[3,50],[5,60],[8,70],[12,80],[18,90],[26,97]]);
 }
 if(key==='tackle'){
   if(!p.detailGames||p.tackleS+p.tackleF<=0)return null;
   const ok=p.tackleS/g,ng=p.tackleF/g;
   const raw=(ok-ng*.10)*f;
   base=legacyLerp(raw,[[-1,30],[0,38],[.5,45],[1,52],[2,62],[3,72],[4,80],[5.5,90]]);
 }
 if(key==='cut'){
   if(!p.detailGames)return null;
   if(pos==='GK'){
     const raw=p.save/g;
     base=legacyLerp(raw,[[0,35],[1,43],[2,50],[3,58],[4,66],[5.5,75],[7.5,85],[10,93]]);
   }else{
     // CUTも旧基準では99が多かったため、高域をかなり緩やかに。
     const raw=(p.cut/g)*f;
     base=legacyLerp(raw,[[0,35],[1,43],[2,50],[3,57],[4,64],[5,70],[7,78],[10,86],[14,93]]);
   }
 }
 return applyLegacyConfidence(base,p.games);
}
function legacyRank(v){if(v==null)return'—';return v>=90?'S':v>=80?'A':v>=70?'B':v>=60?'C':v>=50?'D':v>=40?'E':'F'}
function legacyRankClass(r){return r==='S'?'rank-s':r==='A'?'rank-a':r==='B'?'rank-b':r==='C'?'rank-c':r==='D'?'rank-d':r==='E'?'rank-e':'rank-f'}
function legacyAbilityHtml(label,v){
 if(v==null)return `<div class="power-ability"><span>${label}</span><b class="power-rank rank-na">―</b><strong>―</strong></div>`;
 const n=Math.max(20,Math.min(99,Math.round(v))),r=legacyRank(n),cls=legacyRankClass(r);
 return `<div class="power-ability"><span>${label}</span><b class="power-rank ${cls}">${r}</b><strong>${n}</strong></div>`;
}
function legacyRatingRows(name,pos=''){return filteredRaw(name,pos).map(r=>({result:Number(r.teamGoalsFor)>Number(r.teamGoalsAgainst)?'win':Number(r.teamGoalsFor)<Number(r.teamGoalsAgainst)?'loss':'draw',rating:Number(r.stats?.rating??r.rating)})).filter(r=>Number.isFinite(r.rating))}
function legacyTraitIndex(value,allValues,invert=false,games=20){
 const vals=allValues.filter(Number.isFinite).sort((a,b)=>a-b);if(!Number.isFinite(value)||vals.length<3)return null;
 const less=vals.filter(v=>invert?v>=value:v<=value).length;
 const raw=Math.max(0,Math.min(99,less/vals.length*100));
 return Math.round(50+(raw-50)*legacyPosConfidence(games));
}
function legacyEventCount(){
 const keys=new Set();
 for(const r of raw.playerMatches||[]){
   const id=String(r.gameId||'');
   const m=id.match(/^(\d{8})/);
   if(m)keys.add(m[1]);
 }
 return Math.max(1,keys.size);
}
function legacyResultLuck(p){
 const decided=(p?.wins||0)+(p?.losses||0);
 if(!p||decided<10)return {eligible:false,score:null,color:'luck'};
 return {eligible:true,score:p.wins/decided*100,color:'luck'};
}
function legacyTraitData(name,pos,p){
 const allNames=stats.players.map(x=>x.name),out=[];
 const posRows=n=>aggregateRaw(n,pos)||rowFor(n);
 const allVals=fn=>allNames.map(n=>fn(posRows(n),n)).filter(Number.isFinite);
 const add=(name,color,val,vals,eligible=true)=>out.push({name,color,score:eligible?legacyTraitIndex(val,vals,false,p.games):null});
 const luck=legacyResultLuck(p);
 out.push({name:'勝敗運',color:'luck',score:luck.score,eligible:luck.eligible});
 const ratings=legacyRatingRows(name,pos);
 {
   // 安定感: 6.5未満に落ちる試合の割合を直接スコア化。
   const eligible=ratings.length>=3;
   const lowRate=eligible?ratings.filter(r=>r.rating<6.5).length/ratings.length:NaN;
   const rawScore=eligible?Math.max(0,Math.min(100,100-lowRate*100)):NaN;
   // 専用信頼度。3試合で0.70、10試合で0.90、20試合で1.00。
   let conf=0;
   if(p.games>=3){
     if(p.games<=10)conf=.70+(p.games-3)/7*.20;
     else conf=.90+Math.min(10,p.games-10)/10*.10;
   }
   out.push({name:'安定感○',color:'blue',score:eligible?50+(rawScore-50)*conf:null,eligible});
 }
 const lossProfile=(()=>{
   const l=ratings.filter(r=>r.result==='loss').map(r=>r.rating);
   if(!l.length)return null;
   return {lossAvg:l.reduce((a,b)=>a+b,0)/l.length,losses:l.length};
 })();
 {
   const vals=allNames.map(n=>{
     const rr=legacyRatingRows(n,pos),l=rr.filter(r=>r.result==='loss').map(r=>r.rating);
     return l.length?l.reduce((a,b)=>a+b,0)/l.length:NaN;
   }).filter(Number.isFinite);
   const eligible=Boolean(lossProfile&&lossProfile.losses>=3&&lossProfile.lossAvg>=6.50);
   add('逆境○','blue',eligible?lossProfile.lossAvg:NaN,vals,eligible);
 }
 if(p.detailGames){
   const passAttempts=p.passS+p.passF;
   const passRate=p.passS/(passAttempts||1);
   // 旧版は成功率だけで付きやすかったため、最低成功率も要求する。
   add('ゲームメーカー','blue',passRate,allVals(x=>x&&x.detailGames&&x.passS+x.passF?x.passS/(x.passS+x.passF):NaN),
     passAttempts/p.detailGames>=10 && passRate>=0.55);

   const keepAttempts=p.passS+p.passF+p.dribbleS+p.dribbleF;
   const keep=(p.passS+p.dribbleS)/(keepAttempts||1);
   // 単に平均以上ではなく、明確にロストが少ない選手だけを対象。
   add('ボールキープ○','blue',keep,allVals(x=>x&&x.detailGames?(x.passS+x.dribbleS)/(x.passS+x.passF+x.dribbleS+x.dribbleF||1):NaN),
     keepAttempts/p.detailGames>=12 && keep>=0.70);

   const duelAttempts=p.tackleS+p.tackleF;
   const duel=p.tackleS/(duelAttempts||1);
   // デュエルは質の基準は維持しつつ、試行回数を3→5/詳細試合へ引き上げる。
   add('デュエル○','blue',duel,allVals(x=>x&&x.detailGames&&x.tackleS+x.tackleF?x.tackleS/(x.tackleS+x.tackleF):NaN),
     duelAttempts/p.detailGames>=5);

   const cutPerGame=p.cut/p.detailGames;
   // 旧版はCUTが多く記録されるため、量・総サンプルの両方を厳しくする。
   add('インターセプター','blue',cutPerGame,allVals(x=>x&&x.detailGames?x.cut/x.detailGames:NaN),
     cutPerGame>=5 && p.cut>=20);
 }
return out;
}
const LEGACY_GOLD={'勝敗運':'勝者','安定感○':'明鏡止水','逆境○':'鶏群の一鶴','ゲームメーカー':'マエストロ','ボールキープ○':'金剛不壊','デュエル○':'闘将','インターセプター':'未来予知'};
const LEGACY_TRAIT_DESC={
 '勝敗運':'引き分けを除いた試合での勝率。65以上は勝ち運、35以下は負け運。','安定感○':'6.5未満の採点になる試合の割合が低く、低評価になりにくい。',
 '逆境○':'敗戦時でも平均採点が高く、チーム結果が悪い試合でも個人評価を保つ。',
 'ゲームメーカー':'十分なパス試行があり、パス成功率も高い。',
 'ボールキープ○':'十分にボールへ関与し、パス・ドリブルによるロストが少ない。',
 'デュエル○':'多くのタックルを試みたうえで、成功率が高い。',
 'インターセプター':'継続してパスカット数が多い。',
};
function legacyTraitCell(t){
 const eligible=Number.isFinite(t.score),score=eligible?Math.round(t.score):null;
 if(t.color==='luck'){
   const active=eligible&&(score>=65||score<=35);
   const winSide=eligible&&score>=50;
   const gold=eligible&&score>=90;
   const cls=gold?'trait-gold':active?(winSide?'trait-blue':'trait-red'):'trait-inactive';
   const name=gold?'勝者':winSide?'勝ち運':'負け運';
   const desc=LEGACY_TRAIT_DESC['勝敗運']||'';
   return `<span class="trait-cell ${cls}" title="${esc(desc+' / 勝率 '+(score??'—')+'%')}"><b>${esc(name)}</b><small>${score==null?'—':score}</small></span>`;
 }
 const gold=eligible&&t.color==='blue'&&score>=90,active=eligible&&score>=65;
 const cls=gold?'trait-gold':active?(t.color==='dual'?'trait-dual':`trait-${t.color}`):'trait-inactive';
 const name=gold?(LEGACY_GOLD[t.name]||t.name):t.name;
 return `<span class="trait-cell ${cls}" title="${esc((LEGACY_TRAIT_DESC[t.name]||'')+' / スコア '+(score??'—'))}"><b>${esc(name)}</b><small>${score??'—'}</small></span>`;
}

const LEGACY_OVERALL_ABILITY_WEIGHTS={"GK":{"pass":0.18,"intercept":0.62,"activity":0.2},"DF":{"intercept":0.3,"tackle":0.25,"pass":0.2,"activity":0.12,"dribble":0.08,"shoot":0.05},"MF":{"pass":0.3,"dribble":0.22,"activity":0.18,"tackle":0.12,"intercept":0.1,"shoot":0.08},"FW":{"shoot":0.32,"dribble":0.23,"pass":0.18,"activity":0.12,"intercept":0.075,"tackle":0.075}};
const LEGACY_OVERALL_TRAIT_WEIGHTS={"GK":{"ビッグセーバー":4,"安定感○":2,"逆境○":2,"勝敗運":1},"DF":{"インターセプター":4,"鉄壁":4,"デュエル○":3,"ディフェンスリーダー":3,"ボールキープ○":2,"ゲームメーカー":1.5,"ダイナモ":1.5,"安定感○":1.5,"逆境○":1},"MF":{"ゲームメーカー":4,"チャンスメーカー":4,"ボールキープ○":3,"ダイナモ":2.5,"デュエル○":2,"インターセプター":1.5,"安定感○":1.5,"逆境○":1.5,"決定力○":1},"FW":{"決定力○":4,"チャンスメーカー":3,"ボールキープ○":2.5,"ダイナモ":2,"ゲームメーカー":1.5,"デュエル○":1,"インターセプター":0.5,"安定感○":1.5,"逆境○":2,"勝負師":2.5}};
function legacyOverallBase(p,pos){
 const ws=LEGACY_OVERALL_ABILITY_WEIGHTS[pos]||LEGACY_OVERALL_ABILITY_WEIGHTS.MF;
 let total=0,w=0;
 for(const [k,weight] of Object.entries(ws)){
   if(pos==='GK'&&['shoot','dribble','tackle','activity'].includes(k))continue;
   const v=legacyAbility(p,pos,k==='intercept'?'cut':k);
   if(Number.isFinite(v)){total+=v*weight;w+=weight}
 }
 return w?total/w:50;
}
function legacyOverallTrait(p,name,pos){
 const ws=LEGACY_OVERALL_TRAIT_WEIGHTS[pos]||{};
 const map=new Map(legacyTraitData(name,pos,p).map(t=>[t.name,t]));
 let total=0,w=0;
 for(const [trait,weight] of Object.entries(ws)){
   const t=map.get(trait);
   if(!t||!Number.isFinite(t.score))continue;
   total+=t.score*weight;w+=weight;
 }
 return w?total/w:50;
}
function legacyOverallValue(p,name,pos){
 const base=legacyOverallBase(p,pos),trait=legacyOverallTrait(p,name,pos);
 return Math.max(20,Math.min(99,Math.round(base+(trait-50)*.08)));
}
function legacyOverallBadge(p,name,pos){
 const v=legacyOverallValue(p,name,pos),r=legacyRank(v),cls=legacyRankClass(r);
 return `<span class="overall-badge"><em>総合</em><b class="${cls}">${r}</b><strong>${v}</strong></span>`;
}
function renderLegacyPositionCard(name,all,pos){
 const p=aggregateRaw(name,pos);
 if(!p)return '';
 const conf=legacyPosConfidence(p.games);
 const abilities=[
   legacyAbilityHtml('パス',legacyAbility(p,pos,'pass')),
   legacyAbilityHtml('シュート',pos==='GK'?null:legacyAbility(p,pos,'shoot')),
   legacyAbilityHtml('ドリブル',pos==='GK'?null:legacyAbility(p,pos,'dribble')),
   legacyAbilityHtml('タックル',pos==='GK'?null:legacyAbility(p,pos,'tackle')),
   legacyAbilityHtml(pos==='GK'?'セーブ':'カット/ブロック',legacyAbility(p,pos,'cut')),
   legacyAbilityHtml('積極性',pos==='GK'?null:legacyAbility(p,pos,'activity'))
 ].join('');
 const traits=legacyTraitData(name,pos,p).map(legacyTraitCell).join('');
 return `<article class="power-player-card legacy-modern-card legacy-pos-card" data-legacy-pos="${pos}">
  <header class="power-card-head">
   <div class="power-card-player"><span class="power-pos power-pos-${pos.toLowerCase()}">${pos}</span><b>${esc(name)}</b>${legacyOverallBadge(p,name,pos)}<small>${p.games}試合</small></div>
   <div class="legacy-card-rating"><span>平均採点</span><b>${fmt(p.rating)}</b><small>信頼度 ${Math.round(conf*100)}%</small></div>
  </header>
  <div class="power-card-body">
   <section class="power-ability-list">${abilities}</section>
   <section class="power-card-right">
    <div class="power-summary legacy-power-summary">
      <div class="legacy-result-summary"><span>勝敗</span><b>${p.wins}勝 ${p.draws}分 ${p.losses}敗</b><small>平均勝ち点 ${fmt((p.wins*3+p.draws)/Math.max(1,p.games),2)}</small></div>
      <div><span>G / A</span><b>${p.goals} / ${p.assists}</b></div>
    </div>
    <div class="power-special-block">
      <div class="power-special-title">特性</div>
      <div class="power-special-grid">${traits||'<span class="subtle">判定可能な特性なし</span>'}</div>
      <p class="power-special-note">旧式ログで集計可能な特性のみ。プレースタイルは集計不可のため非表示。</p>
    </div>
   </section>
  </div>
 </article>`;
}
function renderPlayer(){
 const name=$('legacyPlayerSelect').value,all=rowFor(name);
 if(!all){$('legacyPlayerDetail').innerHTML='<div class="empty">該当データなし</div>';return}
 const positions=['GK','DF','MF','FW'].filter(pos=>(all.positions?.[pos]||0)>0);
 if(!positions.length){$('legacyPlayerDetail').innerHTML='<div class="empty">ポジション別データなし</div>';return}

 let active=$('legacyPlayerPos').value;
 if(!positions.includes(active))active=positions[0];
 $('legacyPlayerPos').innerHTML=positions.map(pos=>`<option value="${pos}" ${pos===active?'selected':''}>${pos} (${all.positions[pos]}試合)</option>`).join('');

 const aiText=ai.players?.[name]?.text||'AI総評は未生成です。';
 const p=aggregateRaw(name,active),detail=p?.detailGames>0,gpg=all.goals/Math.max(1,all.games),apg=all.assists/Math.max(1,all.games);

 $('legacyPlayerDetail').innerHTML=`
 <div class="legacy-player-back"><button type="button" id="legacyBackToList">← 選手一覧へ</button></div>
 <div class="position-card-tabs legacy-position-tabs">${positions.map(pos=>`<button class="position-card-tab ${pos===active?'active':''}" data-card-pos="${pos}" type="button">${pos}<small>${all.positions[pos]}試合</small></button>`).join('')}</div>
 <div id="legacyPositionCardHost">${renderLegacyPositionCard(name,all,active)}</div>

 <section class="legacy-ai-card">
  <div class="legacy-section-title"><div><span>AI PLAYER REVIEW</span><h3>AI総評</h3></div><small>全ポジション通算 / legacy-ai-summaries.json</small></div>
  <p>${esc(aiText)}</p>
 </section>

 <div class="legacy-detail-grid">
  <section class="legacy-panel"><div class="legacy-section-title"><h3>ポジション履歴</h3></div><div class="legacy-pos-bars">${posBars(all)}</div></section>
  <section class="legacy-panel"><div class="legacy-section-title"><h3>全体主要成績</h3></div>
   <div class="legacy-overview-grid compact">
    <div><span>試合</span><b>${all.games}</b><small>${all.wins}勝 ${all.draws}分 ${all.losses}敗</small></div>
    <div><span>得点</span><b>${all.goals}</b><small>${fmt(gpg,2)} / 試合</small></div>
    <div><span>アシスト</span><b>${all.assists}</b><small>${fmt(apg,2)} / 試合</small></div>
    <div><span>平均採点</span><b>${fmt(all.rating)}</b><small>全ポジション</small></div>
   </div>
  </section>
 </div>

 `;

 $('legacyBackToList').onclick=()=>location.href='legacy.html';
 function renderActive(pos){
   const pp=aggregateRaw(name,pos),d=pp?.detailGames>0;
   $('legacyPositionCardHost').innerHTML=renderLegacyPositionCard(name,all,pos);
   document.querySelectorAll('.position-card-tab[data-card-pos]').forEach(b=>b.classList.toggle('active',b.dataset.cardPos===pos));
   $('legacyPlayerPos').value=pos;
 }
 renderActive(active);
 document.querySelectorAll('.position-card-tab[data-card-pos]').forEach(btn=>btn.onclick=()=>renderActive(btn.dataset.cardPos));
}
function pairData(a,b){let same=[],versus=[];const byGame=new Map;for(const p of raw.playerMatches){if(p.player!==a&&p.player!==b)continue;(byGame.get(p.gameId)||byGame.set(p.gameId,[]).get(p.gameId)).push(p)}for(const [game,ps] of byGame)if(ps.length===2){let A=ps.find(x=>x.player===a),B=ps.find(x=>x.player===b);if(A.team===B.team)same.push(A);else versus.push(A)}function sum(rs){let w=0,d=0,l=0,gf=0,ga=0;for(const r of rs){gf+=r.teamGoalsFor;ga+=r.teamGoalsAgainst;if(r.teamGoalsFor>r.teamGoalsAgainst)w++;else if(r.teamGoalsFor<r.teamGoalsAgainst)l++;else d++}return{n:rs.length,w,d,l,gf,ga}}return{same:sum(same),versus:sum(versus)}}
function renderPair(){let a=$("pairA").value,b=$("pairB").value;if(!a||!b||a===b){$("pairResult").innerHTML='<div class="empty">異なる2選手を選択</div>';return}let r=pairData(a,b);$("pairResult").innerHTML=`<div class="legacy-card"><span>同チーム時</span><b>${r.same.n}試合</b><strong>${r.same.w}勝 ${r.same.d}分 ${r.same.l}敗</strong><small>${r.same.gf}得点 ${r.same.ga}失点</small></div><div class="legacy-card"><span>${esc(a)}視点で対戦</span><b>${r.versus.n}試合</b><strong>${r.versus.w}勝 ${r.versus.d}分 ${r.versus.l}敗</strong><small>${r.versus.gf}得点 ${r.versus.ga}失点</small></div>`}
function switchTab(tab){document.querySelectorAll('.legacy-tabs [data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$('playersTab').hidden=true;$('statsTab').hidden=tab!=='stats';$('pairTab').hidden=tab!=='pair';if(tab==='stats')renderStats()}
Promise.all([fetch('data/legacy-player-stats.json').then(r=>r.json()),fetch('data/legacy.json').then(r=>r.json()),fetch('data/legacy-ai-summaries.json').then(r=>r.ok?r.json():({players:{}}))]).then(([st,r,a])=>{
 stats=st;raw=r;ai=a;const names=st.players.slice().sort((a,b)=>a.name.localeCompare(b.name));const opts=names.map(p=>`<option>${esc(p.name)}</option>`).join('');
 $('legacyPlayerSelect').innerHTML=opts;$('pairA').innerHTML='<option value="">選択</option>'+opts;$('pairB').innerHTML='<option value="">選択</option>'+opts;
 if(window.LEGACY_PLAYER_PAGE){
   const qp=new URLSearchParams(location.search),name=qp.get('player')||names[0]?.name||'',pos=qp.get('pos')||'';
   $('legacyPlayerSelect').value=name;renderPlayer();if(pos&&[...$('legacyPlayerPos').options].some(o=>o.value===pos)){$('legacyPlayerPos').value=pos;renderPlayer()}
 }else showLegacyList();
});
if(!window.LEGACY_PLAYER_PAGE){
 $('legacySearch').oninput=renderStats;
 ['legacyFrom','legacyTo'].forEach(id=>$(id).oninput=renderStats);
 $('legacyDateReset').onclick=()=>{$('legacyFrom').value='';$('legacyTo').value='';renderStats()};
}
document.querySelectorAll('[data-legacy-list-pos]').forEach(b=>b.onclick=()=>{legacyListPos=b.dataset.legacyListPos;document.querySelectorAll('[data-legacy-list-pos]').forEach(x=>x.classList.toggle('active',x===b));renderStats()});
$('legacyPlayerSelect').onchange=()=>renderPlayer();$('legacyPlayerPos').onchange=renderPlayer;$('pairA').onchange=renderPair;$('pairB').onchange=renderPair;document.querySelectorAll('.legacy-tabs [data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
