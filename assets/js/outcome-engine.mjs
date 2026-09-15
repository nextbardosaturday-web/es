// One observation per match; symmetric team differences avoid counting both sides as independent games.
const key=(kind,...parts)=>JSON.stringify([kind,...parts]);
export function lineupFeatures(players){
 const features=new Map();
 for(const p of players){features.set(key('player',p.player),1);features.set(key('position',p.player,p.position||'ANY'),1);}
 const names=players.map(p=>p.player).sort();
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)features.set(key('pair',names[i],names[j]),1);
 if(players.every(p=>['GK','DF','MF','FW'].includes(p.position)))features.set(key('formation',...['GK','DF','MF','FW'].map(pos=>players.filter(p=>p.position===pos).length)),1);
 return features;
}
export function outcomeMatches(rows){
 const groups=new Map(),matches=[];let excluded=0;
 for(const r of rows){if(!groups.has(r.gameId))groups.set(r.gameId,[]);groups.get(r.gameId).push(r);}
 for(const [gameId,rs]of groups){
  const west=rs.filter(r=>r.team==='1'),east=rs.filter(r=>r.team==='2');
  const valid=west.length&&east.length&&west.length+east.length===rs.length&&new Set(rs.map(r=>r.player)).size===rs.length&&rs.every(r=>Number.isFinite(r.gf)&&Number.isFinite(r.ga))&&west.every(r=>r.gf===west[0].gf&&r.ga===west[0].ga)&&east.every(r=>r.gf===west[0].ga&&r.ga===west[0].gf);
  if(!valid){excluded++;continue;}
  matches.push({gameId,west,east,y:Math.sign(west[0].gf-west[0].ga),margin:west[0].gf-west[0].ga});
 }
 return {matches:matches.sort((a,b)=>a.gameId.localeCompare(b.gameId)),excluded};
}
function difference(west,east){const x=lineupFeatures(west);for(const[k,v]of lineupFeatures(east))x.set(k,(x.get(k)||0)-v);return new Map([...x].filter(([,v])=>v));}
export function fitOutcomes(matches,{minGames=3,lambda=12,iterations=100}={}){
 const summaries=new Map();
 for(const m of matches)for(const[players,sign]of[[m.west,1],[m.east,-1]])for(const k of lineupFeatures(players).keys()){
  const r=summaries.get(k)||{key:k,parts:JSON.parse(k),games:0,wins:0,draws:0,losses:0,margin:0};r.games++;r.wins+=m.y*sign>0;r.draws+=m.y===0;r.losses+=m.y*sign<0;r.margin+=m.margin*sign;summaries.set(k,r);
 }
 const columns=new Map();matches.forEach((m,i)=>{for(const[k,v]of difference(m.west,m.east)){const summary=summaries.get(k);if(summary.games<Math.max(minGames,summary.parts[0]==='pair'?5:3))continue;if(!columns.has(k))columns.set(k,[]);columns.get(k).push([i,v]);}});
 const residual=matches.map(m=>m.y),weights=new Map([...columns.keys()].sort().map(k=>[k,0]));
 for(let pass=0;pass<iterations;pass++){let change=0;for(const[k,old]of weights){const col=columns.get(k);let numerator=0,denominator=lambda;for(const[i,v]of col){numerator+=v*(residual[i]+old*v);denominator+=v*v;}const value=numerator/denominator;weights.set(k,value);for(const[i,v]of col)residual[i]-=(value-old)*v;change=Math.max(change,Math.abs(value-old));}if(change<1e-7)break;}
 return {weights,summaries:[...summaries.values()].map(r=>({...r,coefficient:weights.get(r.key)??null,contrasts:columns.get(r.key)?.length||0})),games:matches.length};
}
export function predictOutcome(model,west,east){let score=0,known=0,total=0;const contributions=[];for(const[k,v]of difference(west,east)){total++;if(!model.weights.has(k))continue;known++;const value=model.weights.get(k)*v;score+=value;contributions.push({parts:JSON.parse(k),value});}return{score:Math.max(-1,Math.min(1,score)),coverage:total?known/total:0,contributions:contributions.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,5)};}
export function validateOutcomes(matches){
 const days=[...new Set(matches.map(m=>m.gameId.slice(0,8)))].sort();
 if(days.length<3)return{available:false,reason:'別日での検証に必要な開催日数がありません'};
 const cut=days[Math.max(1,Math.floor(days.length*.75))],train=matches.filter(m=>m.gameId.slice(0,8)<cut),test=matches.filter(m=>m.gameId.slice(0,8)>=cut);
 if(train.length<20||test.length<10)return{available:false,reason:'検証には過去20試合以上と、別日の後続10試合以上が必要です',train:train.length,test:test.length};
 const model=fitOutcomes(train);let mse=0,baseline=0,correct=0,decisive=0;
 for(const m of test){const p=predictOutcome(model,m.west,m.east).score;mse+=(p-m.y)**2;baseline+=m.y*m.y;if(m.y){decisive++;correct+=Math.sign(p)===m.y;}}
 return{available:true,train:train.length,test:test.length,cut,mse:mse/test.length,baseline:baseline/test.length,accuracy:decisive?correct/decisive:null,better:mse<baseline};
}
export function analyzeOutcomes(rows){const result=outcomeMatches(rows);return{...result,model:fitOutcomes(result.matches),validation:validateOutcomes(result.matches)};}
export function metricAssociation(matches,context,metric,state='all'){
 const lookup=new Map(context.map(m=>[String(m.gameId),m]));const sample=[];
 for(const m of matches){const c=lookup.get(m.gameId),w=c?.teams?.TEAM_WEST?.[state]?.[metric],e=c?.teams?.TEAM_EAST?.[state]?.[metric];if(!Number.isFinite(w)||!Number.isFinite(e))continue;sample.push({x:w-e,y:m.y});}
 const n=sample.length;if(n<3)return{n,r:null};const mx=sample.reduce((s,p)=>s+p.x,0)/n,my=sample.reduce((s,p)=>s+p.y,0)/n;let xy=0,xx=0,yy=0;for(const p of sample){xy+=(p.x-mx)*(p.y-my);xx+=(p.x-mx)**2;yy+=(p.y-my)**2;}return{n,r:xx&&yy?xy/Math.sqrt(xx*yy):null};
}
