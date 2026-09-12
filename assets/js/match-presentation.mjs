export function playerPlayCounts(p={}) {
 const read=key=>{const value=key.split('.').reduce((v,k)=>v?.[k],p);return Number.isFinite(Number(value))?Number(value):null;};
 return [
 ['ゴール','shots.goals'],['アシスト','assists'],['シュート','shots.attempts'],['枠内シュート','shots.onTarget'],['枠外シュート','shots.offTarget'],['ブロックされたシュート','shots.blocked'],['ポスト・バー','shots.woodwork'],
 ['パス試行','passes.attempts'],['パス成功','passes.successful'],['パス失敗','passes.failed'],['パスアウト','passes.out'],['パス未確定','passes.unresolved'],['キーパス','keyPasses'],['前進パス','passes.progressive'],
 ['ドリブル試行','dribbles.attempts'],['ドリブル成功','dribbles.successful'],['ドリブル失敗','dribbles.failed'],['タックル試行','tackles.attempts'],['タックル成功','tackles.won'],['タックル失敗','tackles.failed'],
 ['インターセプト','interceptions.won'],['ブロック','blocks.total'],['シュートブロック','blocks.shot'],['パスブロック','blocks.pass'],['セーブ','saves.total'],['セーブ後保持','saves.possessionRetained'],['カバー','covering.total'],['決定機阻止','bigChancePreventions']
 ].map(([label,key])=>({label,value:read(key)}));
}
export function goalCourseGeometry(goal) {
 const gd=goal?.goalDef;if(!gd||goal.courseRecorded===false)return null;
 const width=Number(gd.dz),height=Number(gd.dy),z=Number(goal.goalZ),y=Number(goal.goalY),minZ=Number(gd.origin?.z),bottom=Number(gd.origin?.y);
 if(goal.goalY==null||goal.goalZ==null||![width,height,z,y,minZ,bottom].every(Number.isFinite)||width<=0||height<=0)return null;
 const fromLeft=goal.side==='east'?z-minZ:minZ+width-z,aboveGround=y-bottom;
 if(fromLeft<-.5||fromLeft>width+.5||aboveGround<-.5||aboveGround>height+.5)return null;
 return {width,height,fromLeft,aboveGround,horizontal:Math.max(0,Math.min(1,fromLeft/width)),vertical:Math.max(0,Math.min(1,aboveGround/height))};
}
export function horizontalShotDistance(shotX,shotZ,goalX,goalZ){
 const values=[shotX,shotZ,goalX,goalZ];
 if(values.some(v=>v==null||v==='')||!values.map(Number).every(Number.isFinite))return null;
 return Math.hypot(Number(goalX)-Number(shotX),Number(goalZ)-Number(shotZ));
}
