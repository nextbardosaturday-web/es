export const themes=[
 {id:'spacing',title:'広がるべきか、集まるべきか',metric:'close',threshold:.25,a:'近接が多い',b:'近接が少ない',phase:'attack',question:'味方保持中、近くのサポートと離れた受け口を両方作れているか。',practice:'保持者の近くで受ける役と、逆側・前方で幅を作る役を分担する。近接がパス交換や回収に役立つ場面も確認する。'},
 {id:'keeper',title:'GKを孤立させない方がよいか',metric:'keeperAlone',threshold:.5,a:'GK単独が多い',b:'カバー候補が近い',phase:'defend',question:'相手保持中、GK周辺のカバーと前方の守備を両立できているか。',practice:'中央突破に対するカバー役と、保持者へ寄せる役を分ける。GKの近くに残すことで空く場所も確認する。'},
 {id:'free',title:'フリーの味方を作れているか',metric:'free',threshold:.5,a:'相手から離れた選手が多い',b:'相手から離れた選手が少ない',phase:'attack',question:'保持者以外の選手が相手から離れて受け口を作れているか。',practice:'相手の背後に隠れず、保持者から見える横・斜めの受け口を作る。距離だけでなくパスコースをリプレイで確認する。'},
 {id:'choice',title:'パス・シュート・突破をどう選ぶか',question:'選択時点で、他のプレーがより大きな機会につながった可能性はあるか。',practice:'パス先の空きだけでなく、コース上の相手と受けた直後のプレーを確認する。外れたシュートを自動的に悪い判断とはしない。'},
 {id:'holding',title:'持つ時間と引きつけ方',question:'保持で味方の機会を作ったか、通せたパスの機会を失ったか。',practice:'保持直後と手放す直前を見比べる。相手を引きつけた後の成功パスと、味方がマークされてからのロストを分けて振り返る。'}
];
export function filterGuide(data,{size='7v7',from='',to='',state='level',category='official'}={}){
 const keep=r=>r.size===size&&(!from||r.date>=from)&&(!to||r.date<=to)&&(state==='all'||r.state===state)&&(category==='all'||r.category===category);
 return {records:(data.records||[]).filter(keep),shots:(data.shots||[]).filter(keep)};
}
export function compareTheme(records,theme,minimum=3){
 const chosen=records.filter(r=>r.phase===theme.phase&&Number.isFinite(r[theme.metric]));
 // Collapse to one observation per game/side/field, rather than counting frames as independent trials.
 const map=new Map();for(const r of chosen){const key=r.gameId+'|'+r.side+'|'+r.fieldArea,u=map.get(key)||{gameId:r.gameId,fieldArea:r.fieldArea,seconds:0,frames:0,value:0,xg:0,against:0,examples:[]};u.seconds+=r.seconds;u.frames+=r.frames;u.value+=r[theme.metric]*r.frames;u.xg+=r.shotXg;u.against+=r.againstXg;u.examples.push(...r.examples);map.set(key,u);}
 const rows=[...map.values()].filter(r=>r.frames>=30&&r.seconds>0).map(r=>({...r,value:r.value/r.frames,net:(r.xg-r.against)/r.seconds*600}));
 const summarize=a=>({games:new Set(a.map(r=>r.gameId)).size,n:a.length,mean:a.length?a.reduce((s,r)=>s+r.net,0)/a.length:null,examples:a.slice(0,3)});
 const groups=[summarize(rows.filter(r=>r.value>=theme.threshold)),summarize(rows.filter(r=>r.value<theme.threshold))];
 const sameField=new Set(rows.map(r=>r.fieldArea)).size<=1;
 return {groups,comparable:sameField&&groups.every(g=>g.games>=minimum),sameField};
}
export function roleTypes(records,pos){
 const groups=new Map();for(const r of records)for(const p of r.players||[]){if(p.position!==pos||p.frames<10)continue;const key=p.name+'|'+r.gameId,u=groups.get(key)||{name:p.name,gameId:r.gameId,frames:0,close:0,free:0,surrounded:0,nearDistance:0,forward:0,oriented:0,example:r.examples[0]};for(const k of ['frames','close','free','surrounded','nearDistance','forward','oriented'])u[k]+=p[k];groups.set(key,u);}
 const labels=pos==='GK'?['近接連係型','後方待機型','前方関与型']:['近接サポート型','後方維持型','前方・空間利用型'];
 return labels.map((label,i)=>{const rows=[...groups.values()].filter(p=>{const type=p.close/p.frames>=.25?0:!p.oriented?-1:p.forward/p.oriented<.4?1:2;return type===i;});return{label,rows,games:new Set(rows.map(r=>r.gameId)).size};});
}
