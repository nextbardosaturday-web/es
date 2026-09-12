const $=id=>document.getElementById(id);
let data=[],tab="official";
const fmtDate=v=>v||"-";
const fmtHalf=s=>`${Math.round((Number(s)||300)/60)}:00 × 2`;
function render(){
  const q=$("search").value.trim().toLowerCase();
  const rows=data.filter(m=>(tab==="official"?m.includeOverall:m.category==="exhibition")&&[m.gameId,m.date,m.fieldName].some(v=>String(v||"").toLowerCase().includes(q)));
  $("matchCount").textContent=`${rows.length}試合`;
  $("matchRows").innerHTML=rows.length?rows.map(m=>`<tr><td>${m.gameId}</td><td>${fmtDate(m.date)}</td><td><b>${m.westScore} - ${m.eastScore}</b></td><td>${fmtHalf(m.halfDurationSec)}</td><td>${m.playerCount}</td><td>${m.fieldName||"-"}</td><td>${m.mom?`<span class="mom-list">★ ${m.mom.player} <b>${Number(m.mom.rating).toFixed(2)}</b></span>`:"-"}</td><td><a class="detail-link" href="match.html?id=${encodeURIComponent(m.gameId)}">試合を見る</a></td></tr>`).join(""):'<tr><td colspan="8" class="empty">該当する試合がありません</td></tr>';
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{tab=b.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));render();}));
$("search").addEventListener("input",render);
fetch("data/manifest.json").then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(j=>{data=j.matches||[];render();}).catch(e=>$("matchRows").innerHTML=`<tr><td colspan="8" class="empty">読込失敗: ${e.message}</td></tr>`);
