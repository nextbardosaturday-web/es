import {duelSummary,fieldKey} from './duel-insights.mjs?v=20261010direction';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rate=r=>r.attempts?(100*r.success/r.attempts).toFixed(1)+'%':'—';

const table=rows=>'<div class="table-wrap"><table><thead><tr><th>POS</th><th>成功率</th><th>成功 / 試行</th><th>試合</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r.name==='unknown'?'不明':r.name)+'</td><td>'+rate(r)+'</td><td>'+r.success+' / '+r.attempts+'</td><td>'+r.games+'</td></tr>').join('')+'</tbody></table></div>';
export function renderDuels(matches){const fields=[...new Set(matches.map(m=>fieldKey(m.field)).filter(Boolean))],select=$('duelField'),previous=select.value;select.innerHTML='<option value="all">全フィールド（相対位置）</option>'+fields.map((f,i)=>{const [x0,x1,z0,z1]=JSON.parse(f);return '<option value="'+esc(f)+'">フィールド '+(i+1)+'：'+(x1-x0)+' × '+(z1-z0)+' m（'+x0+', '+z0+'）</option>';}).join('');select.value=fields.includes(previous)?previous:'all';
 const d=duelSummary(matches,{position:$('duelPosition').value,field:select.value}),minimum=Math.max(1,Number($('duelMinimum').value)||5);
 $('duelTotals').innerHTML=['TACKLE','DRIBBLE'].map((t,i)=>'<article class="top-five-card"><h3>'+['タックル','ドリブル'][i]+'成功率 '+rate(d.totals[t])+'</h3><p>成功 '+d.totals[t].success+' / 試行 '+d.totals[t].attempts+'（'+d.totals[t].games+'試合）</p></article>').join('');
 $('duelPositions').innerHTML=table(d.positions);
 $('duelMap').innerHTML=d.cells.map(r=>{const enough=r.attempts>=minimum;return '<div class="duel-cell" style="background:'+(!r.attempts?'var(--panel2)':enough?'rgba(22,160,130,'+(.12+.5*r.success/r.attempts)+')':'var(--panel2)')+'"><b>'+rate(r)+'</b><span>'+r.success+' / '+r.attempts+'</span><small>'+(!r.attempts?'記録なし':!enough?'比較不足':r.games+'試合')+'</small></div>';}).join('');
 $('duelCoverage').textContent='マップ対象 '+d.positioned+'件 / 方向不明 '+d.unknownDirection+'件 / 位置不明・範囲外 '+d.missing+'件。成功率は成功数÷試行数。最低試行数はマップの比較不足表示に適用します。';
}
