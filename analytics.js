/* Хаб: экран аналитики. Считает только закрытые и не отменённые задачи, по дате закрытия. */
{
const H=window.HUB;if(!H)throw new Error('hub.js не загрузился');
const {S,esc,hrs,sumH,dayStr,TODAY,pById,openCard,plural,tasksW,fmtDay,sortedProjects,planDay,g}=H;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const ls=H.ls;
const st=Object.assign({mode:'week',off:0,table:false},ls.get('hub-an',{}));st.off=0;
/* в демо в понедельник и вторник открываем прошлую неделю: текущая ещё почти пустая */
if(H.MEM&&[1,2].includes(new Date().getDay()))st.off=-1;
const save=()=>ls.set('hub-an',{mode:st.mode,table:st.table});
const MN=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MG=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MS=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const WD=['пн','вт','ср','чт','пт','сб','вс'];
const day0=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const addD=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const PREV={week:'к прошлой неделе',month:'к прошлому месяцу',year:'к прошлому году'};

function range(mode,off){
  const n=day0(new Date());let a,b;
  if(mode==='week'){a=addD(n,-((n.getDay()+6)%7)+7*off);b=addD(a,7)}
  else if(mode==='month'){a=new Date(n.getFullYear(),n.getMonth()+off,1);b=new Date(n.getFullYear(),n.getMonth()+off+1,1)}
  else{a=new Date(n.getFullYear()+off,0,1);b=new Date(n.getFullYear()+off+1,0,1)}
  return {a,b};
}
function label(mode,{a,b}){
  if(mode==='year')return String(a.getFullYear());
  if(mode==='month')return MN[a.getMonth()][0].toUpperCase()+MN[a.getMonth()].slice(1)+' '+a.getFullYear();
  const e=addD(b,-1);return a.getMonth()===e.getMonth()?`${a.getDate()}–${e.getDate()} ${MG[e.getMonth()]}`:`${a.getDate()} ${MG[a.getMonth()]} – ${e.getDate()} ${MG[e.getMonth()]}`;
}
const closed=(a,b)=>S.tasks.filter(t=>t.done&&!t.canceled&&t.doneAt&&new Date(t.doneAt)>=a&&new Date(t.doneAt)<b);
const created=(a,b)=>S.tasks.filter(t=>t.createdAt&&new Date(t.createdAt)>=a&&new Date(t.createdAt)<b);
const vz=p=>`var(--v${Number.isInteger(p&&p.viz)?p.viz:7})`;
const delta=(cur,prev,fmt)=>{const d=cur-prev;if(!prev&&!cur)return '';if(Math.abs(d)<1e-9)return `столько же ${PREV[st.mode]}`;return `${d>0?'↑':'↓'} ${fmt(Math.abs(d))} ${PREV[st.mode]}`};
const niceMax=v=>{if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),f=v/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p};

/* бакеты: дни недели, дни месяца, месяцы года */
function buckets(mode,{a,b}){
  const out=[];
  if(mode==='year'){for(let m=0;m<12;m++){const s=new Date(a.getFullYear(),m,1),e=new Date(a.getFullYear(),m+1,1);out.push({a:s,b:e,lab:MS[m],full:MN[m]+' '+a.getFullYear()})}}
  else for(let d=a;d<b;d=addD(d,1))out.push({a:d,b:addD(d,1),lab:mode==='week'?WD[(d.getDay()+6)%7]+' '+d.getDate():String(d.getDate()),full:`${WD[(d.getDay()+6)%7]}, ${d.getDate()} ${MG[d.getMonth()]}`});
  for(const k of out){k.tasks=closed(k.a,k.b);k.h=sumH(k.tasks)}
  return out;
}
/* журнал плана */
function planFact(a,b){
  const res=[];
  for(const doc of S.days){const d=new Date(doc.date+'T00:00');if(d<a||d>=b)continue;
    const P=new Set(doc.planned||[]),pt=[...P].map(id=>S.tasks.find(t=>t.id===id)).filter(t=>t&&!t.canceled);
    const done=pt.filter(t=>t.done&&t.doneAt&&dayStr(new Date(t.doneAt))===doc.date);
    const moved=pt.filter(t=>!done.includes(t));
    const off=closed(d,addD(d,1)).filter(t=>!P.has(t.id));
    res.push({date:doc.date,d,ph:sumH(pt),dh:sumH(done),pn:pt.length,dn:done.length,mn:moved.length,on:off.length,oh:sumH(off)});
  }
  return res.sort((x,y)=>x.date.localeCompare(y.date));
}

const tips=new Map();let tipN=0;
const tip=html=>{const k='t'+(++tipN);tips.set(k,html);return k};
const tipTasks=(title,ts)=>{const by={};for(const t of ts){(by[t.projectId]=by[t.projectId]||[]).push(t)}
  return `<b>${esc(title)}</b><span>${ts.length?`${tasksW(ts.length)} · ${hrs(sumH(ts))}`:'ничего не закрыто'}</span>`+
    sortedProjects().filter(p=>by[p.id]).map(p=>`<span class="tr"><i style="background:${vz(p)}"></i>${esc(p.name)}<em>${hrs(sumH(by[p.id]))}</em></span>`).join('')};

function kpis(r,pr){
  const cur=closed(r.a,r.b),prev=closed(pr.a,pr.b);
  const act=new Set(cur.map(t=>dayStr(new Date(t.doneAt)))).size;
  const pf=planFact(r.a,r.b),ph=pf.reduce((s,x)=>s+x.ph,0),dh=pf.reduce((s,x)=>s+x.dh,0);
  const first=S.days.map(d=>d.date).sort()[0];
  return `<div class="kpis">
    <div class="kpi"><span class="l">Закрыто задач</span><b class="num">${cur.length}</b><span class="d">${delta(cur.length,prev.length,n=>n)}</span></div>
    <div class="kpi"><span class="l">Часов</span><b class="num">${hrs(sumH(cur))}</b><span class="d">${delta(sumH(cur),sumH(prev),hrs)}</span></div>
    <div class="kpi"><span class="l">В среднем за день</span><b class="num">${act?hrs(Math.round(2*sumH(cur)/act)/2):'—'}</b><span class="d">${act?`по ${act} ${plural(act,'дню','дням','дням')} с закрытиями`:''}</span></div>
    <div class="kpi"><span class="l">Закрыто из плана</span><b class="num">${ph?Math.round(100*dh/ph)+'%':'—'}</b><span class="d">${ph?`${hrs(dh)} из ${hrs(ph)}`:first?`журнал плана с ${fmtDay(first)}`:'журнал плана начнётся с первого плана'}</span></div>
  </div>`;
}

function chart(r){
  const bs=buckets(st.mode,r);
  const ps=sortedProjects().filter(p=>bs.some(k=>k.tasks.some(t=>t.projectId===p.id)));
  const legend=ps.length>1?`<div class="legend">${ps.map(p=>`<span><i style="background:${vz(p)}"></i>${esc(p.name)}</span>`).join('')}</div>`:'';
  const title=st.mode==='year'?'По месяцам':'По дням';
  const tbtn=`<button class="ib tbl${st.table?' on':''}" type="button" data-an="table" aria-pressed="${st.table}" title="Таблицей" aria-label="Показать таблицей"><svg viewBox="0 0 16 16"><path d="M2.75 4.5h10.5M2.75 8h10.5M2.75 11.5h10.5"/></svg></button>`;
  let body;
  if(st.table){
    body=`<div class="atable" role="table"><div class="ar ah" role="row"><span role="columnheader">${st.mode==='year'?'Месяц':'День'}</span><span role="columnheader">Задач</span><span role="columnheader">Часов</span></div>${bs.filter(k=>st.mode!=='month'||k.a<=new Date()).map(k=>`<div class="ar" role="row"><span role="cell">${esc(k.full)}</span><span role="cell" class="num">${k.tasks.length}</span><span role="cell" class="num">${hrs(k.h)}</span></div>`).join('')}</div>`;
  }else if(st.mode==='month'){
    const mx=Math.max(0,...bs.map(k=>k.h)),lead=(bs[0].a.getDay()+6)%7,today=TODAY();
    const bin=h=>!h?0:mx<=0?1:Math.min(4,Math.ceil(4*h/mx));
    body=`<div class="heat"><div class="hw">${WD.map(w=>`<span>${w}</span>`).join('')}</div><div class="hg">${'<span class="hc empty"></span>'.repeat(lead)}${bs.map(k=>{const ds=dayStr(k.a),fut=ds>today;
      return `<span class="hc b${fut?'f':bin(k.h)}${ds===today?' today':''}" data-k="${fut?'':tip(tipTasks(k.full,k.tasks))}"><em>${k.lab}</em>${k.h&&!fut?`<b class="num">${hrs(k.h)}</b>`:''}</span>`}).join('')}</div>
      <div class="hl"><span>меньше</span>${[0,1,2,3,4].map(i=>`<i class="hc b${i}"></i>`).join('')}<span>больше</span></div></div>`;
  }else{
    const mx=niceMax(Math.max(0,...bs.map(k=>k.h))),ticks=[0,mx/2,mx];
    body=`<div class="bars${st.mode==='year'?' y':''}"><div class="grid">${ticks.map(v=>`<span style="bottom:${100*v/mx}%"><em class="num">${v?hrs(v):'0'}</em></span>`).join('')}</div>
      <div class="cols">${bs.map(k=>{const segs=ps.map(p=>[p,sumH(k.tasks.filter(t=>t.projectId===p.id))]).filter(x=>x[1]).sort((x,y)=>y[1]-x[1]);
        return `<div class="col" data-k="${tip(tipTasks(k.full,k.tasks))}"><div class="plot"><div class="stack" style="height:${100*k.h/mx}%">${segs.map(([p,h])=>`<i style="flex:${h};background:${vz(p)}"></i>`).join('')}</div></div><span class="cl">${k.lab}</span></div>`}).join('')}</div></div>`;
  }
  return `<section class="blk"><div class="bh"><h2>${title}</h2><span class="tot num">${hrs(sumH(bs.flatMap(k=>k.tasks)))}</span><span class="acts">${tbtn}</span></div><div class="bin abody">${body}${st.table||st.mode==='month'?'':legend}</div></section>`;
}

function spend(r){
  const cur=closed(r.a,r.b),tot=sumH(cur);
  const rows=sortedProjects().map(p=>{const ts=cur.filter(t=>t.projectId===p.id);return {p,ts,h:sumH(ts)}}).filter(x=>x.ts.length).sort((a,b)=>b.h-a.h);
  const mx=Math.max(0,...rows.map(x=>x.h));
  return `<section class="blk"><div class="bh"><h2>Куда ушло время</h2></div><div class="bin abody">${rows.length?`<div class="hbars">${rows.map(x=>`
    <div class="hb" data-k="${tip(tipTasks(x.p.name,x.ts))}"><span class="hn"><i style="background:${vz(x.p)}"></i>${esc(x.p.name)}</span>
      <span class="ht"><span style="width:${100*x.h/mx}%;background:${vz(x.p)}"></span></span>
      <span class="hv num">${hrs(x.h)} <em>· ${x.ts.length} · ${Math.round(100*x.h/tot)}%</em></span></div>`).join('')}</div>`:`<p class="aempty">За этот период ничего не закрыто.</p>`}</div></section>`;
}

function backlog(r){
  const inn=created(r.a,r.b),out=closed(r.a,r.b),mx=Math.max(1,sumH(inn),sumH(out));
  const row=(l,ts,cls)=>`<div class="hb"><span class="hn">${l}</span><span class="ht"><span class="${cls}" style="width:${100*sumH(ts)/mx}%"></span></span><span class="hv num">${hrs(sumH(ts))} <em>· ${tasksW(ts.length)}</em></span></div>`;
  const d=inn.length-out.length;
  return `<section class="blk"><div class="bh"><h2>Бэклог</h2><span class="tot num">${d>0?'+':d<0?'−':''}${Math.abs(d)} ${plural(Math.abs(d),'задача','задачи','задач')} за период</span></div><div class="bin abody"><div class="hbars">${row('Пришло',inn,'fin')}${row('Закрыто',out,'fout')}</div></div></section>`;
}

function planBlock(r){
  const pf=planFact(r.a,r.b);
  if(!pf.length)return `<section class="blk"><div class="bh"><h2>План и факт</h2></div><div class="bin abody"><p class="aempty">${S.days.length?'За этот период план не собирался.':'Журнал начнётся с первого плана на день.'}</p></div></section>`;
  const S2=k=>pf.reduce((s,x)=>s+x[k],0);
  const sum=`<div class="pfsum"><span><b class="num">${hrs(S2('dh'))}</b> из ${hrs(S2('ph'))} запланированного закрыто</span><span><b class="num">${S2('mn')}</b> ${plural(S2('mn'),'задача перенесена','задачи перенесены','задач перенесено')}</span><span><b class="num">${S2('on')}</b> закрыто вне плана, ${hrs(S2('oh'))}</span></div>`;
  const rows=st.mode==='week'?`<div class="pfrows">${pf.map(x=>`<div class="pf"><span class="pd">${WD[(x.d.getDay()+6)%7]} ${x.d.getDate()}</span>
     <span class="pm"><span style="width:${x.ph?100*x.dh/x.ph:0}%"></span></span>
     <span class="pv num">${hrs(x.dh)} из ${hrs(x.ph)}</span><span class="pe">${[x.mn?`перенесено ${x.mn}`:'',x.on?`вне плана ${x.on}`:''].filter(Boolean).join(' · ')}</span></div>`).join('')}</div>`:'';
  return `<section class="blk"><div class="bh"><h2>План и факт</h2><span class="tot num">${S2('ph')?Math.round(100*S2('dh')/S2('ph'))+'%':''}</span></div><div class="bin abody">${sum}${rows}</div></section>`;
}

function dues(){
  const now=new Date(),from=addD(day0(now),-28);
  const ps=sortedProjects().filter(p=>p.status!=='frozen'&&p.due);
  if(!ps.length)return '';
  return `<section class="blk"><div class="bh"><h2>Сроки</h2></div><div class="bin abody"><div class="dues">${ps.map(p=>{
    const open=S.tasks.filter(t=>t.projectId===p.id&&!t.done),oh=sumH(open);
    const pace=sumH(closed(from,addD(day0(now),1)).filter(t=>t.projectId===p.id))/4;
    const left=Math.round((new Date(p.due+'T00:00')-day0(now))/864e5);
    return `<div class="due"><span class="hn"><i style="background:${vz(p)}"></i>${esc(p.name)}</span>
      <span class="dc"><b class="num">${hrs(oh)}</b><em>открыто</em></span>
      <span class="dc">${left<0?`<button class="late" type="button" data-late="${esc(p.id)}">прошёл</button>`:`<b class="num">${left} дн.</b>`}<em>${left<0?'срок был':'до срока,'} ${fmtDay(p.due)}</em></span>
      <span class="dc"><b class="num">${hrs(Math.round(pace*2)/2)}</b><em>в неделю, среднее за 4 недели</em></span>
      <span class="dc"><b class="num">${pace>0?Math.ceil(oh/pace)+' нед.':'—'}</b><em>при этом темпе</em></span></div>`}).join('')}</div></div></section>`;
}

function stuck(){
  const today=new Date(TODAY()+'T00:00');
  const carry=S.tasks.filter(t=>!t.done&&planDay(t)&&(today-new Date(planDay(t)+'T00:00'))/864e5>=2);
  const wait=S.tasks.filter(t=>!t.done&&t.waiting).map(t=>({t,d:t.updatedAt?Math.floor((Date.now()-new Date(t.updatedAt))/864e5):null})).sort((a,b)=>(b.d??-1)-(a.d??-1));
  const row=(t,right)=>{const p=pById(t.projectId)||{};return `<button class="sk" type="button" data-card="${esc(t.id)}"><span class="hn"><i style="background:${vz(p)}"></i><span>${esc(t.title)}</span></span><em>${right}</em></button>`};
  return `<section class="blk"><div class="bh"><h2>Застряло</h2><span class="tot num">${carry.length+wait.length?tasksW(carry.length+wait.length):'ничего'}</span></div><div class="bin abody">
    ${carry.length?`<div class="sh">Переносятся 2 дня и дольше</div>${carry.map(t=>row(t,'с '+fmtDay(planDay(t)))).join('')}`:''}
    ${wait.length?`<div class="sh">Ждут</div>${wait.slice(0,10).map(x=>row(x.t,`${esc(x.t.waiting)}${x.d!=null?` · без изменений ${x.d} ${plural(x.d,'день','дня','дней')}`:''}`)).join('')}${wait.length>10?`<p class="aempty">и ещё ${wait.length-10}</p>`:''}`:''}
    ${!carry.length&&!wait.length?'<p class="aempty">Ничего не висит.</p>':''}</div></section>`;
}

function render(){
  const root=$('#analytics');if(!root||root.hidden)return;
  tips.clear();tipN=0;
  const r=range(st.mode,st.off),pr=range(st.mode,st.off-1);
  const modes=[['week','Неделя'],['month','Месяц'],['year','Год']];
  root.innerHTML=`<header class="an-h"><h1>Аналитика</h1>
      <div class="seg an-seg" role="group" aria-label="Период"><span class="ind"></span>${modes.map(([v,l])=>`<button type="button" data-an="mode" data-v="${v}" aria-pressed="${st.mode===v}">${g(l)}</button>`).join('')}</div>
      <div class="an-nav"><button class="ib" type="button" data-an="prev" aria-label="Назад"><svg viewBox="0 0 16 16"><path d="M9.5 4.5 6 8l3.5 3.5"/></svg></button><span class="num">${label(st.mode,r)}</span><button class="ib" type="button" data-an="next" aria-label="Вперёд"${st.off>=0?' disabled':''}><svg viewBox="0 0 16 16"><path d="M6.5 4.5 10 8l-3.5 3.5"/></svg></button></div>
    </header>
    ${kpis(r,pr)}
    ${chart(r)}
    <div class="an2">${spend(r)}${backlog(r)}</div>
    ${planBlock(r)}
    ${dues()}
    ${stuck()}`;
  const seg=$('.an-seg',root),b=$('[aria-pressed=true]',seg),ind=$('.ind',seg);
  ind.style.transition='none';ind.style.width=b.offsetWidth+'px';ind.style.transform=`translateX(${b.offsetLeft-2}px)`;
}
window.renderAnalytics=render;

/* тултип */
const tt=document.createElement('div');tt.className='antip';tt.hidden=true;document.body.appendChild(tt);
const pop=document.createElement('div');pop.className='anpop';pop.hidden=true;document.body.appendChild(pop);
addEventListener('keydown',e=>{if(e.key==='Escape')pop.hidden=true});
const show=(el,x,y)=>{const k=el.dataset.k;if(!k||!tips.has(k)){tt.hidden=true;return}tt.innerHTML=tips.get(k);tt.hidden=false;
  const w=tt.offsetWidth,h=tt.offsetHeight;let px=x+14,py=y+14;if(px+w>innerWidth-8)px=x-w-14;if(py+h>innerHeight-8)py=y-h-14;tt.style.left=Math.max(8,px)+'px';tt.style.top=Math.max(8,py)+'px'};
document.addEventListener('pointermove',e=>{const el=e.target.closest&&e.target.closest('#analytics [data-k]');if(!el||!el.dataset.k){tt.hidden=true;return}show(el,e.clientX,e.clientY)});
document.addEventListener('click',e=>{
  const el=e.target.closest('#analytics [data-k]');if(el&&el.dataset.k&&e.pointerType!=='mouse'){const r=el.getBoundingClientRect();show(el,r.left+r.width/2,r.top)}
  const pb=e.target.closest('.anpop [data-card]');if(pb){pop.hidden=true;openCard(pb.dataset.card,null,e.detail===0);return}
  if(!e.target.closest('.anpop'))pop.hidden=true;
  const late=e.target.closest('#analytics [data-late]');if(late){const p=pById(late.dataset.late);const open=S.tasks.filter(t=>t.projectId===p.id&&!t.done).sort((a,b)=>(a.order||0)-(b.order||0));
    if(open.length===1){openCard(open[0].id,null,e.detail===0);return}
    pop.innerHTML=`<div class="ph">Просрочено в «${esc(p.name)}»: ${tasksW(open.length)}</div>`+open.map(t=>`<button type="button" data-card="${esc(t.id)}"><span>${esc(t.title)}</span><em class="num">${hrs(t.hours)}</em></button>`).join('');
    pop.hidden=false;const r=late.closest('.dc').getBoundingClientRect();pop.style.left=Math.min(r.left,innerWidth-328)+'px';const h=pop.offsetHeight;pop.style.top=(r.bottom+h+8>innerHeight?r.top-h-6:r.bottom+6)+'px';return}
  const c=e.target.closest('#analytics [data-card]');if(c){openCard(c.dataset.card,null,e.detail===0);return}
  const a=e.target.closest('#analytics [data-an]');if(!a)return;const k=a.dataset.an;
  if(k==='mode'){st.mode=a.dataset.v;st.off=0}if(k==='prev')st.off--;if(k==='next'&&st.off<0)st.off++;if(k==='table')st.table=!st.table;
  save();render();
});
addEventListener('scroll',()=>{tt.hidden=true;pop.hidden=true},{passive:true});
if(location.hash==='#analytics')render();
}
