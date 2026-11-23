/* Хаб: главный экран, действия с задачей, перетаскивание.
   Данные: база артефакта (capabilities db, user) или, если на странице есть window.HUB_SEED, память страницы (демо, тесты). */
{
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KIND={must:'обязательный',key:'ключевой',want:'хочу'};
const LIMIT=5,HOURS=[0.5,1,2,3];
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let db=null,canWrite=true,pendingRender=false;
const S={projects:[],tasks:[],days:[],meta:[]};
const loaded={projects:false};
const MEM=typeof window.HUB_SEED==='function';
/* в режиме памяти ничего не запоминаем: перезагрузка возвращает всё к исходному */
const ls=MEM?{get:(k,d)=>d,set(){}}:{get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
/* база в памяти с тем же интерфейсом, что у db артефакта: doc().set/update, collection().onSnapshot */
function memDb(seed){
  const C={},L={};
  const col=n=>(C[n]=C[n]||new Map(),L[n]=L[n]||[],C[n]);
  for(const n in seed){col(n);for(const d of seed[n]){const {id,...v}=d;C[n].set(id,v)}}
  const snap=n=>({docs:[...col(n)].map(([id,v])=>({id,data:()=>structuredClone(v)}))});
  const emit=n=>queueMicrotask(()=>L[n].forEach(cb=>cb(snap(n))));
  return{
    doc(path){const [n,id]=path.split('/');return{
      set:async d=>{col(n).set(id,structuredClone(d));emit(n)},
      update:async d=>{const m=col(n);if(!m.has(id))throw{code:'not-found'};m.set(id,{...m.get(id),...structuredClone(d)});emit(n)}}},
    collection(n){return{onSnapshot(cb){col(n);L[n].push(cb);queueMicrotask(()=>cb(snap(n)));return()=>{L[n]=L[n].filter(x=>x!==cb)}}}}
  };
}
const closed=new Set(ls.get('hub4-closed',[]));
const F=Object.assign({size:0,doing:false,waiting:false,tags:[],showDone:false},ls.get('hub4-f',{}));
const expanded=new Set(),aboutOpen=new Set();
const saveF=()=>ls.set('hub4-f',F),saveC=()=>ls.set('hub4-closed',[...closed]);

/* время и слова */
const pad=n=>String(n).padStart(2,'0');
const dayStr=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const TODAY=()=>dayStr(new Date());
const hrs=h=>{h=+h||0;const H=Math.floor(h),M=Math.round((h-H)*60);return H&&M?`${H} ч ${M} мин`:H?`${H} ч`:M?`${M} мин`:'0 ч'};
const sumH=a=>a.reduce((s,t)=>s+(+t.hours||0),0);
const fmtDay=s=>new Date(s+'T00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','');
const fmtTime=iso=>{if(!iso)return'';const d=new Date(iso);return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace('.','')+', '+pad(d.getHours())+':'+pad(d.getMinutes())};
const daysTo=s=>Math.round((new Date(s+'T00:00')-new Date(TODAY()+'T00:00'))/864e5);
const plural=(n,a,b,c)=>{const m=n%10,h=n%100;return m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c};
const tasksW=n=>`${n} ${plural(n,'задача','задачи','задач')}`;
const tot=(open,done)=>`${open.length?`<b>открыто ${open.length}</b> на ${hrs(sumH(open))}`:'<b>открытых нет</b>'}${done.length?`, ${done.length} сделано`:''}`;

/* где задача */
const planDay=t=>t.today===true?TODAY():(typeof t.today==='string'?t.today:null);
const inPlan=t=>{const d=planDay(t);if(!d)return false;if(d===TODAY())return true;return d<TODAY()&&!t.done};
const doneToday=t=>t.done&&t.doneAt&&dayStr(new Date(t.doneAt))===TODAY();
const pById=id=>S.projects.find(p=>p.id===id);
const tById=id=>S.tasks.find(t=>t.id===id);
const planOpen=()=>S.tasks.filter(t=>inPlan(t)&&!t.done).sort((a,b)=>(a.todayOrder??1e15)-(b.todayOrder??1e15)||(a.order||0)-(b.order||0));
const sortedProjects=()=>[...S.projects].sort((a,b)=>(a.status==='frozen')-(b.status==='frozen')||(a.order||0)-(b.order||0));

/* иконки */
const I={chev:'<svg viewBox="0 0 16 16"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>',
 add:'<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9"/></svg>',
 copy:'<svg viewBox="0 0 16 16" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linejoin:round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/></svg>',
 rm:'<svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg>',
 more:'<svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/></svg>',
 info:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.75"/><path d="M8 7.25V11M8 5.1v.1"/></svg>',
 x:'<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
 check:'<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>'};
const g=t=>`<span class="g"><span>${t}</span><span aria-hidden="true">${t}</span></span>`;
const cbHTML=t=>`<button class="cb" role="checkbox" aria-checked="${!!t.done}" aria-label="${t.done?'Открыть снова':'Закрыть'}: ${esc(t.title)}" type="button"${t.canceled?' disabled':''}><i><svg viewBox="0 0 12 12"><path pathLength="1" d="M2.5 6.25l2.25 2.25 4.75-5"/></svg></i></button>`;

/* подсветка списка */
function fluid(list,sel,o={}){
  if(list._fluid){if(!list.contains(list._fluid))list.prepend(list._fluid);list._reset();return}
  const hl=document.createElement('div');hl.className='fh off';list.prepend(hl);list._fluid=hl;
  let cur=null;list._reset=()=>{cur=null;hl.classList.add('off');hl.style.opacity=0};
  const place=(el,fresh)=>{const s=hl.style;if(fresh){hl.classList.add('off');s.transition='none'}
    s.transform=`translate(${el.offsetLeft}px,${el.offsetTop}px)`;s.width=el.offsetWidth+'px';s.height=el.offsetHeight+'px';
    if(fresh){hl.offsetWidth;s.transition=''}hl.classList.remove('off');s.opacity=1};
  const set=el=>{if(el===cur)return;const fresh=!cur;if(cur)cur.classList.remove('is-active');cur=el;
    if(el){el.classList.add('is-active');place(el,fresh)}else{hl.classList.add('off');hl.style.opacity=0}o.change&&o.change(el,list)};
  list.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||document.body.classList.contains('dragging'))return;const el=e.target.closest(sel);set(el&&el.parentElement===list?el:null)});
  list.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')set(null)});
  list.addEventListener('focusin',e=>{const el=e.target.closest(sel);if(el&&e.target.matches(':focus-visible'))set(el)});
  list.addEventListener('focusout',e=>{if(!list.contains(e.relatedTarget))set(null)});
}
const hideRule=(el,list)=>{for(const r of $$('.task',list))r.classList.remove('no-top');if(el){el.classList.add('no-top');const n=el.nextElementSibling;n&&n.classList&&n.classList.add('no-top')}};

/* перетаскивание: мышь сразу после 4px, палец после удержания 350 мс */
function sortable(list,o){
  list.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;const h=e.target.closest(o.handle);if(!h||!list.contains(h))return;
    if(e.target.closest('button:not(.tt),input,select,textarea,.cb'))return;
    const item=h.closest(o.item);if(!item||item.parentElement!==list)return;
    if(e.pointerType==='mouse')e.preventDefault();
    const sx=e.clientX,sy=e.clientY,touch=e.pointerType!=='mouse';let st=null,timer=null,armed=!touch;
    if(touch)timer=setTimeout(()=>{armed=true;navigator.vibrate&&navigator.vibrate(8)},350);
    const move=ev=>{
      if(!st){const d=Math.hypot(ev.clientX-sx,ev.clientY-sy);
        if(!armed){if(d>8){clearTimeout(timer);cleanup()}return}
        if(d<4)return;st=begin(item,ev);}
      ev.preventDefault();drag(st,ev);
    };
    const up=ev=>{clearTimeout(timer);cleanup();if(st){drop(st);list._justDragged=Date.now()}};
    const cleanup=()=>{removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up)};
    addEventListener('pointermove',move,{passive:false});addEventListener('pointerup',up);addEventListener('pointercancel',up);
  });
  list.addEventListener('click',e=>{if(list._justDragged&&Date.now()-list._justDragged<300){e.stopPropagation();e.preventDefault()}},true);
  function begin(item,ev){
    o.start&&o.start(item);
    document.body.classList.add('dragging');
    const items=$$(':scope>'+o.item,list),rects=items.map(x=>x.getBoundingClientRect()),i0=items.indexOf(item),r0=rects[i0];
    const gap=parseFloat(getComputedStyle(list).rowGap)||0;
    item.classList.add('lifted');item.style.transition='none';
    for(const x of items)if(x!==item)x.style.transition=`transform var(--mod) var(--ease-crit)`;
    let grab=ev.clientY-r0.top;if(grab<0||grab>r0.height)grab=Math.min(28,r0.height/2);
    return {item,items,rects,i0,to:i0,r0,grab,shift:r0.height+gap,lastY:ev.clientY};
  }
  function drag(st,ev){
    st.lastY=ev.clientY;
    const top=ev.clientY-st.grab;st.item.style.transform=`translateY(${top-st.r0.top}px)`;
    const mid=top+st.r0.height/2;let to=st.i0;
    st.rects.forEach((r,i)=>{if(i<st.i0&&mid<r.top+r.height/2)to=Math.min(to,i);if(i>st.i0&&mid>r.top+r.height/2)to=Math.max(to,i)});
    st.to=to;
    st.items.forEach((x,i)=>{if(x===st.item)return;let d=0;if(st.i0<to&&i>st.i0&&i<=to)d=-st.shift;if(st.i0>to&&i>=to&&i<st.i0)d=st.shift;x.style.transform=d?`translateY(${d}px)`:''});
    const m=60;if(ev.clientY<m)scrollBy(0,-12);else if(ev.clientY>innerHeight-m)scrollBy(0,12);
  }
  function drop(st){
    document.body.classList.remove('dragging');if(pendingRender){pendingRender=false;setTimeout(renderAll,0)}
    const ids=st.items.map(x=>x.dataset.id);const [m]=ids.splice(st.i0,1);ids.splice(st.to,0,m);
    const visTop=st.item.getBoundingClientRect().top;
    for(const x of st.items){x.style.transition='none';x.style.transform='';x.classList.remove('lifted')}
    o.end&&o.end(ids,st.i0!==st.to);
    const el=list.querySelector(`:scope>${o.item}[data-id="${CSS.escape(m)}"]`)||$(`${o.item}[data-id="${CSS.escape(m)}"]`);
    if(o.noFlip){el&&el.scrollIntoView({block:'nearest',behavior:'auto'});return}
    if(el&&!reduce()){const dy=visTop-el.getBoundingClientRect().top;if(Math.abs(dy)>1){el.style.transition='none';el.style.transform=`translateY(${dy}px)`;el.offsetWidth;el.style.transition='transform var(--mod) var(--ease-crit)';el.style.transform='';setTimeout(()=>{el.style.transition=''},200)}}
  }
}
/* стрелки с Alt: тот же порядок с клавиатуры */
function keyMove(e,ids,id,apply){const i=ids.indexOf(id);const j=e.key==='ArrowUp'?i-1:i+1;if(i<0||j<0||j>=ids.length)return false;ids.splice(i,1);ids.splice(j,0,id);apply(ids);return true}

/* строка */
function row(t,ctx){
  const p=pById(t.projectId)||{name:'—'};
  const plan=inPlan(t),d=planDay(t);
  let st='';
  if(!t.done){
    if(t.doing)st=`<em class="st doing">в работе</em>`;
    else if(t.waiting)st=`<em class="st" title="${esc(t.waiting)}">ждёт: ${esc(t.waiting)}</em>`;
    if(t.due&&daysTo(t.due)<7){const n=daysTo(t.due);st+=`<em class="st${n<0?' doing':''}">${n<0?'срок прошёл':n===0?'срок сегодня':'до '+fmtDay(t.due)}</em>`}
    if(ctx==='plan'&&d&&d<TODAY())st+=`<em class="st">с ${fmtDay(d)}</em>`;
  }else if(t.canceled)st=`<em class="st">отменена</em>`;
  const mark=ctx==='proj'&&plan&&!t.done?`<span class="mark"><svg viewBox="0 0 12 12"><path d="M2.5 6.25l2.25 2.25 4.75-5"/></svg>в плане</span>`:'';
  const pbtn=t.done?'':plan
    ?`<button class="ib${ctx==='proj'?' inplan':''}" data-a="unplan" aria-label="Убрать из плана" title="Убрать из плана">${I.rm}</button>`
    :`<button class="ib" data-a="plan" aria-label="В план на сегодня" title="В план на сегодня">${I.add}</button>`;
  return `<div class="task ctx-${ctx}${ctx==='proj'&&plan&&!t.done?' inplan':''}${t.done?' done':''}${t.canceled?' canceled':''}${ctx==='plan'&&!t.done?' sortable':''}" data-id="${esc(t.id)}">
    ${cbHTML(t)}
    <div class="t"><button class="tt" type="button" data-a="card">${esc(t.title)}</button>${st}${mark}</div>
    <div class="meta">${ctx==='plan'?`<span class="pj">${esc(p.name)}</span>`:''}<span class="hrs num">${hrs(t.hours)}</span></div>
    <div class="ra">${pbtn}<button class="ib" data-a="menu" aria-label="Ещё" aria-haspopup="menu" title="Ещё">${I.more}</button></div></div>`;
}

/* план */
function renderPlan(){
  const all=S.tasks.filter(t=>inPlan(t)||(doneToday(t)&&planDay(t)));
  const carry=planOpen().filter(t=>planDay(t)<TODAY());
  const open=planOpen().filter(t=>planDay(t)>=TODAY());
  const done=all.filter(t=>t.done).sort((a,b)=>(a.doneAt||'').localeCompare(b.doneAt||''));
  const el=$('#plan');el.classList.toggle('closed',closed.has('plan'));
  el.innerHTML=`<div class="bh"><h2>План на сегодня</h2><span class="tot num">${tot(open,done)}</span>
    <span class="acts"><button class="ib chev" data-a="toggle" aria-expanded="${!closed.has('plan')}" aria-label="Свернуть план">${I.chev}</button></span></div>
    <div class="bb"><div><div class="bin">${carry.length?carryHTML(carry):''}${open.length||done.length?`<div class="rows" id="planRows">${open.map(t=>row(t,'plan')).join('')}${done.map(t=>row(t,'plan')).join('')}</div>`
      :carry.length?'':`<div class="empty"><b>План пуст</b>Собери день из задач ниже: кнопка «+» на строке.${avgLine()}</div>`}</div></div></div>`;
  const cr=$('#carryRows');cr&&fluid(cr,'.task',{change:hideRule});
  const rows=$('#planRows');
  if(rows){fluid(rows,'.task',{change:hideRule});
    sortable(rows,{item:'.task.sortable',handle:'.task.sortable',end:(ids,moved)=>{if(moved)setPlanOrder(ids)}});}
}
function carryHTML(c){
  const yest=dayStr(new Date(Date.now()-864e5)),allY=c.every(t=>planDay(t)===yest);
  return `<div class="carry"><div class="carry-h"><span><b>${allY?'С вчера':'С прошлых дней'}:</b> ${tasksW(c.length)}, ${hrs(sumH(c))}</span>
    <span class="sp"><button class="btn primary c" type="button" data-a="keepall">Оставить на сегодня</button><button class="btn tertiary c" type="button" data-a="dropall">Вернуть в бэклог</button></span></div>
    <div class="rows" id="carryRows">${c.map(t=>row(t,'plan')).join('')}</div></div>`}
function avgLine(){
  const now=new Date(),from=new Date(now.getFullYear(),now.getMonth(),now.getDate()-14),to=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const by={};for(const t of S.tasks){if(!t.done||t.canceled||!t.doneAt)continue;const d=new Date(t.doneAt);if(d<from||d>=to)continue;const k=dayStr(d);by[k]=(by[k]||0)+(+t.hours||0)}
  const days=Object.keys(by);if(!days.length)return'';
  const avg=Math.round(2*Object.values(by).reduce((a,b)=>a+b,0)/days.length)/2;
  return `<span class="avg">Обычно ты закрываешь ${hrs(avg)} в день: среднее за 2 недели по ${days.length} ${plural(days.length,'дню','дням','дням')}, когда что-то закрыл.</span>`}
function setPlanOrder(ids){ids.forEach((id,i)=>{const t=tById(id);if(t&&t.todayOrder!==i)upd(t,{todayOrder:i},{quiet:true})});renderAll()}

/* фильтры */
function renderFilters(){
  const tags=[...new Set(S.tasks.flatMap(t=>t.tags||[]))].sort();
  const sizes=[[0,'Все'],[1,'до 1 ч'],[2,'2 ч'],[3,'3 ч']];
  $('#filters').innerHTML=`<div class="fl" id="fl"><div class="seg" role="group" aria-label="Размер задачи"><span class="ind"></span>${sizes.map(([v,l])=>`<button type="button" data-f="size" data-v="${v}" aria-pressed="${F.size===v}">${g(l)}</button>`).join('')}</div>
    <button class="chip" type="button" data-f="doing" aria-pressed="${F.doing}">${g('В работе')}</button>
    <button class="chip" type="button" data-f="waiting" aria-pressed="${F.waiting}">${g('Ждёт')}</button>
    ${tags.map(x=>`<button class="chip" type="button" data-f="tag" data-v="${esc(x)}" aria-pressed="${F.tags.includes(x)}">${g(esc(x))}</button>`).join('')}</div>
    <span class="fr"><button class="swr" role="switch" type="button" data-f="showDone" aria-checked="${F.showDone}"><span>Показать закрытые</span><span class="trk"><span class="th"></span></span></button>
    <button class="btn primary addbtn" type="button" data-a="add">${I.add.replace('<svg','<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round"')}Добавить задачу</button></span>`;
  moveInd(true);
  const fl=$('#fl');fl.addEventListener('scroll',fadeFl,{passive:true});
  fl.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>Math.abs(e.deltaX)&&fl.scrollWidth>fl.clientWidth){fl.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
  fadeFl();
}
/* фильтры в одну строку с кнопками: лишнее уезжает вбок, край растворяется */
function fadeFl(){const f=$('#fl');if(!f)return;f.classList.toggle('ov-l',f.scrollLeft>1);f.classList.toggle('ov-r',f.scrollLeft+f.clientWidth<f.scrollWidth-1)}
function moveInd(snap){const seg=$('.seg');if(!seg)return;const b=$('[aria-pressed=true]',seg),ind=$('.ind',seg);if(!b)return;
  if(snap)ind.style.transition='none';ind.style.width=b.offsetWidth+'px';ind.style.transform=`translateX(${b.offsetLeft-2}px)`;if(snap){ind.offsetWidth;ind.style.transition=''}}
const passF=t=>{const h=+t.hours||0;
  if(F.size===1&&h>1)return false;if(F.size===2&&!(h>1&&h<=2))return false;if(F.size===3&&!(h>2))return false;
  if(F.doing&&!t.doing)return false;if(F.waiting&&!t.waiting)return false;
  if(F.tags.length&&!F.tags.some(x=>(t.tags||[]).includes(x)))return false;return true};
const filtering=()=>F.size||F.doing||F.waiting||F.tags.length;

/* проекты */
function renderProjects(){
  const out=[];
  for(const p of sortedProjects()){
    const ts=S.tasks.filter(t=>t.projectId===p.id);
    const open=ts.filter(t=>!t.done),done=ts.filter(t=>t.done&&!t.canceled);
    const vis=ts.filter(t=>(F.showDone||!t.done)&&passF(t));
    if(filtering()&&!vis.length)continue;
    const frozen=p.status==='frozen',key='p:'+p.id;
    const isC=frozen?!closed.has('open:'+key):closed.has(key);
    const order=(p.sections||[]).map(s=>s.title);
    const secs=[...new Set([...order,...vis.map(t=>t.section||'Без раздела')])].filter(s=>vis.some(t=>(t.section||'Без раздела')===s));
    const body=secs.map(s=>{
      const list=vis.filter(t=>(t.section||'Без раздела')===s).sort((a,b)=>(a.done-b.done)||(a.order||0)-(b.order||0));
      const k=p.id+'|'+s,lim=expanded.has(k)?list.length:LIMIT;
      const so=list.filter(t=>!t.done);
      return `<div class="sec"><b>${esc(s)}</b><span class="num">${so.length} · ${hrs(sumH(so))}</span></div>
        <div class="rows">${list.slice(0,lim).map(t=>row(t,'proj')).join('')}</div>
        ${list.length>LIMIT?`<button class="more" type="button" data-a="more" data-k="${esc(k)}">${expanded.has(k)?'Свернуть':'Ещё '+(list.length-LIMIT)}</button>`:''}`}).join('');
    const w=p.where&&p.where.text;
    out.push(`<section class="blk${frozen?' frozen':''}${isC?' closed':''}" id="p-${esc(p.id)}" data-id="${esc(p.id)}" data-key="${esc(key)}" data-frozen="${frozen}">
      <div class="bh grab" title="Потяни, чтобы поменять порядок"><h2>${esc(p.name)}</h2><span class="kind">${frozen?'заморожен':KIND[p.kind]||''}${p.due?' · до '+fmtDay(p.due):''}</span>
        <span class="tot num">${tot(open,done)}</span>
        <span class="acts"><button class="ib" data-a="addp" aria-label="Добавить задачу в проект" title="Добавить задачу">${I.add}</button><button class="ib${aboutOpen.has(p.id)?' on':''}" data-a="about" aria-expanded="${aboutOpen.has(p.id)}" aria-label="О проекте" title="О проекте">${I.info}</button><button class="ib chev" data-a="toggle" aria-expanded="${!isC}" aria-label="Свернуть проект">${I.chev}</button></span></div>
      <div class="about"${aboutOpen.has(p.id)?'':' hidden'}>
        <div><div class="l">Цель</div>${p.goal?esc(p.goal):'<span class="muted">Не сформулирована</span>'}</div>
        <div><div class="l">Срок</div>${p.due?`${fmtDay(p.due)} <span class="muted">· ${daysTo(p.due)<0?'прошёл':'через '+daysTo(p.due)+' дн.'}</span>`:'<span class="muted">Нет</span>'}</div>
        <div style="grid-column:1/-1"><div class="l">Где мы сейчас${p.where&&p.where.at?' · '+fmtDay(dayStr(new Date(p.where.at))):''}</div>${w?esc(w):'<span class="muted">Проект ещё не написал</span>'}</div>
      </div>
      <div class="bb"><div><div class="bin">${body||`<div class="empty">Открытых задач нет</div>`}</div></div></div></section>`);
  }
  $('#projects').innerHTML=out.join('')||`<div class="blk"><div class="empty" style="padding:20px">Ничего не подходит. Сними фильтр.</div></div>`;
  for(const r of $$('#projects .rows'))fluid(r,'.task',{change:hideRule});
}

/* панель */
function sideDay(){
  const all=S.tasks.filter(t=>inPlan(t)||(doneToday(t)&&planDay(t))),done=all.filter(t=>t.done);
  const allH=sumH(all),dn=sumH(done);
  $('#daySum').textContent=all.length?`${tasksW(all.length)} · ${hrs(allH)}`:'План пуст';
  $('#daySub').textContent=all.length?`${done.length} ${plural(done.length,'сделана','сделаны','сделано')}, ${hrs(dn)} из ${hrs(allH)}`:'Собери день из бэклога';
  $('#dayMeter').style.width=allH?Math.round(100*dn/allH)+'%':'0';
}
function renderSide(){
  sideDay();
  const ps=sortedProjects();
  $('#pnav').innerHTML=ps.map(p=>{const n=S.tasks.filter(t=>t.projectId===p.id&&!t.done).length;
    return `<a draggable="false" href="#p-${esc(p.id)}" data-id="${esc(p.id)}" class="${p.status==='frozen'?'frozen':''}"><span>${esc(p.name)}</span><em class="num">${n||''}</em></a>`}).join('');
  fluid($('#pnav'),'a');
  $('#pnew').hidden=!loaded.projects;
  $('#psel').innerHTML=`<option value="">Проекты</option>`+ps.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')+`<option value="__new">+ Новый проект</option>`;
  const now=new Date(),mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
  const wk=S.tasks.filter(t=>t.done&&!t.canceled&&t.doneAt&&new Date(t.doneAt)>=mon);
  const active=new Set(S.projects.filter(p=>p.status!=='frozen').map(p=>p.id));
  const bl=S.tasks.filter(t=>!t.done&&active.has(t.projectId));
  $('#wk').innerHTML=`${tasksW(wk.length)} <span>· ${hrs(sumH(wk))}</span>`;
  $('#bl').innerHTML=`${tasksW(bl.length)} <span>· ${hrs(sumH(bl))}</span>`;
  $('#wkMini').innerHTML=`за неделю <b>${wk.length}</b><br>в бэклоге <b>${bl.length}</b>`;
}

/* порядок проектов */
function setProjectOrder(ids){
  const frozenIds=S.projects.filter(p=>p.status==='frozen').map(p=>p.id);
  const all=[...ids.filter(id=>!frozenIds.includes(id)),...ids.filter(id=>frozenIds.includes(id))];
  all.forEach((id,i)=>{const p=pById(id);if(p&&p.order!==i+1)updP(p,{order:i+1})});
  renderAll();
}

function renderAll(){renderOnb();renderSide();if(!isAnalytics()){renderPlan();renderProjects()}else if(window.renderAnalytics)window.renderAnalytics();if(card.id)renderCard();scheduleDaySync()}
const isAnalytics=()=>location.hash==='#analytics';
function route(){const a=isAnalytics();$('#mainView').hidden=a;$('#analytics').hidden=!a;
  const sl=$('.stats .alink');if(sl){sl.textContent=a?'К плану':'Вся аналитика';sl.href=a?'#plan':'#analytics';sl.classList.toggle('back',a)}
  const wm=$('#wkMini');if(wm)wm.href=a?'#plan':'#analytics';
  closeMenu(true);if(a){window.renderAnalytics&&window.renderAnalytics();scrollTo(0,0)}else{renderPlan();renderProjects();renderFilters()}}
addEventListener('hashchange',route);
/* журнал дней: что побывало в плане сегодня */
let syncT=null;
function scheduleDaySync(){clearTimeout(syncT);syncT=setTimeout(syncDay,1500)}
async function syncDay(){
  if(!db||!canWrite)return;
  const d=TODAY(),ids=S.tasks.filter(t=>planDay(t)===d&&!t.canceled).map(t=>t.id);
  const doc=S.days.find(x=>x.id===d),have=new Set(doc&&doc.planned||[]);
  if(!ids.some(id=>!have.has(id)))return;
  const planned=[...new Set([...have,...ids])];
  try{await db.doc('days/'+d).set({date:d,planned,updatedAt:stamp()})}catch(e){}
}
/* цвет проекта на графиках: закреплён за проектом */
function assignViz(){
  const used=new Set(S.projects.map(p=>p.viz).filter(v=>Number.isInteger(v)));
  for(const p of [...S.projects].sort((a,b)=>(a.order||0)-(b.order||0))){
    if(Number.isInteger(p.viz))continue;let v=0;while(used.has(v)&&v<7)v++;used.add(v);p.viz=v;
    if(db&&canWrite)db.doc('projects/'+p.id).update({viz:v}).catch(()=>{});
  }
}
let lastDay=TODAY();
setInterval(()=>{if(TODAY()!==lastDay){lastDay=TODAY();setDate();renderAll()}},60000);
const setDate=()=>{$('#date').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})};setDate();

/* запись */
function toast(m,undo){const t=$('#toast');t.innerHTML=`<span>${esc(m)}</span>${undo?'<button type="button">Вернуть</button>':''}`;t.classList.add('on');
  if(undo)$('button',t).onclick=()=>{undo();t.classList.remove('on')};
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('on'),undo?5000:2200)}
const stamp=()=>new Date().toISOString();
async function upd(t,data,o={}){
  if(!db){toast('Нет связи с базой');return}
  if(!canWrite){toast('Нет доступа на запись');return}
  const prev={};for(const k in data)prev[k]=t[k];
  Object.assign(t,data);if(!o.quiet)renderAll();
  const evs=eventsFor(t,prev,data);
  try{await db.doc('tasks/'+t.id).update({...data,updatedAt:stamp()});logEvents(evs)}
  catch(e){Object.assign(t,prev);renderAll();if(e&&e.code==='permission-denied')canWrite=false;toast('Не сохранилось. Попробуй ещё раз')}
}
/* журнал событий: проекты читают его в начале сессии и узнают, что сделано в хабе */
function eventsFor(t,prev,data){
  const ev=[],add=(action,detail)=>ev.push({at:stamp(),by:'hub',projectId:t.projectId,taskId:t.id,title:t.title,action,detail:detail??''});
  if('done' in data&&!!data.done!==!!prev.done){if(data.done)add(data.canceled?'canceled':'closed');else add(prev.canceled?'restored':'reopened')}
  if('today' in data&&data.today!==prev.today&&!('done' in data)){if(data.today)add('planned',data.today);else if(prev.today)add('unplanned')}
  if('hours' in data&&+data.hours!==+prev.hours)add('hours',`${prev.hours??''} → ${data.hours}`);
  if('waiting' in data&&(data.waiting||'')!==(prev.waiting||'')){if(data.waiting)add('waiting',data.waiting);else add('waiting_cleared',prev.waiting||'')}
  if('doing' in data&&!!data.doing!==!!prev.doing&&!data.done)add(data.doing?'doing':'stopped');
  return ev;
}
function logEvents(evs){
  for(const e of evs){const id='e-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    db.doc('events/'+id).set(e).catch(()=>{})}
}
async function updP(p,data){
  const prev={};for(const k in data)prev[k]=p[k];Object.assign(p,data);
  if(!db)return;
  try{await db.doc('projects/'+p.id).update(data)}catch(e){Object.assign(p,prev);renderAll();toast('Порядок не сохранился')}
}
const A={
  plan:t=>{const mx=Math.max(-1,...planOpen().map(x=>+x.todayOrder||0));upd(t,{today:TODAY(),todayOrder:mx+1});toast('В плане на сегодня',()=>upd(t,{today:false}))},
  unplan:t=>{const was=t.today;upd(t,{today:false});toast('Убрано из плана',()=>upd(t,{today:was}))},
  done:t=>upd(t,t.done?{done:false,doneAt:null}:{done:true,doneAt:stamp(),doing:false}),
  doing:t=>upd(t,t.doing?{doing:false}:{doing:true,waiting:''}),
  hours:(t,h)=>upd(t,{hours:h}),
  waiting:(t,v)=>upd(t,v?{waiting:v,doing:false}:{waiting:''}),
  cancel:t=>{upd(t,{done:true,canceled:true,doneAt:stamp(),doing:false});toast('Задача отменена',()=>upd(t,{done:false,canceled:false,doneAt:null}))},
  restore:t=>upd(t,{done:false,canceled:false,doneAt:null}),
};

/* меню «ещё» */
const menu=$('#menu');let menuFor=null,menuBtn=null;
function openMenu(btn,t){
  closeMenu(true);menuFor=t.id;menuBtn=btn;btn.classList.add('on');
  menu.innerHTML=`<div class="mlist" role="menu">
    <button role="menuitemcheckbox" aria-checked="${!!t.doing}" data-m="doing" type="button"><span>В работе</span>${t.doing?I.check:''}</button>
    <button role="menuitem" data-m="wait" type="button"><span>${t.waiting?'Ждём: изменить':'Ждём…'}</span></button>
    <button role="menuitem" data-m="card" type="button"><span>Открыть карточку</span></button></div>
    <div class="mh">Часы</div>
    <div class="hseg" role="group" aria-label="Часы">${HOURS.map(h=>`<button type="button" data-m="h" data-v="${h}" aria-pressed="${+t.hours===h}">${hrs(h)}</button>`).join('')}</div>
    <div class="msep"></div>
    <div class="mlist"><button role="menuitem" data-m="cancel" class="danger" type="button"><span>Отменить задачу</span></button></div>`;
  menu.hidden=false;
  const r=btn.getBoundingClientRect(),mw=menu.offsetWidth,mh=menu.offsetHeight;
  let x=Math.min(r.right-mw,innerWidth-mw-8),y=r.bottom+4;if(y+mh>innerHeight-8)y=r.top-mh-4;
  menu.style.left=Math.max(8,x)+'px';menu.style.top=Math.max(8,y)+'px';
  menu.classList.toggle('up',y<r.top);
  requestAnimationFrame(()=>menu.classList.add('open'));
  for(const l of $$('.mlist',menu))fluid(l,'button');
  const first=$('button',menu);first&&first.focus({preventScroll:true});
}
function closeMenu(instant){if(menu.hidden)return;menuBtn&&menuBtn.classList.remove('on');menu.classList.remove('open');menuFor=null;
  if(instant){menu.hidden=true;return}setTimeout(()=>{if(!menu.classList.contains('open'))menu.hidden=true},140)}
menu.addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;const t=tById(menuFor);if(!t)return;const m=b.dataset.m;
  const back=menuBtn;closeMenu();
  if(m==='doing')A.doing(t);if(m==='h')A.hours(t,+b.dataset.v);if(m==='cancel')A.cancel(t);
  if(m==='card')openCard(t.id,null,e.detail===0);if(m==='wait')openCard(t.id,'wait',e.detail===0);
  if(m!=='card'&&m!=='wait')back&&back.focus({preventScroll:true});});
menu.addEventListener('keydown',e=>{const bs=$$('button',menu),i=bs.indexOf(document.activeElement);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length].focus()}});

/* карточка задачи */
const card={id:null,focus:null};const drawer=$('#drawer');
function openCard(id,focus,kbd){card.id=id;card.focus=focus||null;card.kbd=!!kbd;renderCard();drawer.hidden=false;requestAnimationFrame(()=>drawer.classList.add('open'));
  setTimeout(()=>{const f=card.focus==='wait'?$('#cw'):kbd?$('.dx',drawer):$('.dpanel',drawer);f&&f.focus({preventScroll:true})},30)}
function closeCard(){if(!card.id)return;const id=card.id;card.id=null;drawer.classList.remove('open');setTimeout(()=>{if(!card.id)drawer.hidden=true},170);
  if(card.kbd){const back=$(`.task[data-id="${CSS.escape(id)}"] .tt`);back&&back.focus({preventScroll:true})}else document.activeElement&&document.activeElement.blur()}
function renderCard(){
  const t=tById(card.id);if(!t){closeCard();return}
  const p=pById(t.projectId)||{name:'—'},plan=inPlan(t);
  const keepW=document.activeElement&&document.activeElement.id==='cw'?$('#cw').value:null;
  $('.dpanel',drawer).innerHTML=`
    <div class="dh"><span class="muted">${esc(p.name)}${t.section?' · '+esc(t.section):''}</span><button class="ib dx" type="button" data-d="close" aria-label="Закрыть карточку">${I.x}</button></div>
    <div class="dt">${cbHTML(t)}<h3 id="dTitle">${esc(t.title)}</h3></div>
    <div class="dstate">${t.canceled?'<span>Отменена</span>':t.done?`<span>Закрыта ${fmtTime(t.doneAt)}</span>`:`${plan?'<span>В плане на сегодня</span>':''}${t.doing?'<span class="acc">В работе</span>':''}${t.waiting?`<span>Ждёт: ${esc(t.waiting)}</span>`:''}${t.due?`<span>Срок ${fmtDay(t.due)}</span>`:''}${!plan&&!t.doing&&!t.waiting&&!t.due?'<span>В бэклоге</span>':''}`}</div>
    ${diagHTML(t)}
    ${t.canceled?`<div class="dacts"><button class="btn secondary" type="button" data-d="restore">Вернуть в работу</button></div>`:t.done?'':`
    <div class="dacts">
      <button class="btn ${plan?'tertiary':'primary'}" type="button" data-d="${plan?'unplan':'plan'}">${plan?'Убрать из плана':'В план на сегодня'}</button>
      <button class="btn tertiary" type="button" data-d="doing" aria-pressed="${!!t.doing}">${t.doing?'Не в работе':'В работе'}</button>
    </div>
    <div class="dfield"><span class="l">Часы</span><div class="hseg">${HOURS.map(h=>`<button type="button" data-d="h" data-v="${h}" aria-pressed="${+t.hours===h}">${hrs(h)}</button>`).join('')}</div></div>
    <div class="dfield"><label class="l" for="cw">Ждём</label><div class="wrow"><input id="cw" type="text" autocomplete="off" placeholder="Кого или чего, например «Андрей: ответ»" value="${esc(keepW??t.waiting??'')}">${t.waiting?`<button class="ib" type="button" data-d="wclear" aria-label="Больше не ждём" title="Больше не ждём">${I.x}</button>`:''}</div></div>`}
    <div class="dfield"><span class="l">Заметка</span><div class="dnote">${t.note?esc(t.note):'<span class="muted">Заметки нет</span>'}</div></div>
    <div class="dmeta"><span>Создана ${fmtTime(t.createdAt)||'—'}</span><span>Изменена ${fmtTime(t.updatedAt)||'—'}</span></div>
    ${t.done?'':`<div class="dfoot"><button class="btn ghost danger" type="button" data-d="cancel">Отменить задачу</button></div>`}`;
}
/* застрявшая задача: что случилось и что сделать */
function diagHTML(t){
  if(t.done)return '';
  const d=planDay(t),today=new Date(TODAY()+'T00:00');
  const carry=d&&d<TODAY()?Math.round((today-new Date(d+'T00:00'))/864e5):0;
  const idle=t.updatedAt?Math.floor((Date.now()-new Date(t.updatedAt))/864e5):0;
  const btn=(a,l,cls='tertiary')=>`<button class="btn ${cls} c" type="button" data-d="${a}">${l}</button>`;
  if(carry>=2){
    const big=(+t.hours||0)>=2;
    return `<div class="diag"><span class="l">Застряла</span>
      <p class="why">Стоит в плане с ${fmtDay(d)} и переносится уже ${carry} ${plural(carry,'день','дня','дней')}.</p>
      <p class="fix">${big?`Скорее всего, она слишком большая: ${hrs(t.hours)} за раз не начинается. Попроси проект в чате разбить её на шаги по часу, а пока верни в бэклог.`:'Что-то мешает начать. Реши сейчас: сделать первой сегодня, вернуть в бэклог или отменить, если уже не нужна.'}</p>
      <div class="dacts">${big?btn('drop','Вернуть в бэклог','primary'):btn('first','Сделать первой сегодня','primary')+btn('drop','Вернуть в бэклог')}${btn('cancel','Отменить','ghost danger')}</div></div>`}
  if(t.waiting&&idle>=3){
    return `<div class="diag"><span class="l">Застряла</span>
      <p class="why">Ждёт «${esc(t.waiting)}» уже ${idle} ${plural(idle,'день','дня','дней')}, ничего не меняется.</p>
      <p class="fix">Напомни сегодня. Если ответ не нужен, чтобы двигаться, сделай без него. Если задача потеряла смысл, отмени.</p>
      <div class="dacts">${btn('nudge','Напомнить сегодня','primary')}${btn('wclear','Больше не ждём')}${btn('cancel','Отменить','ghost danger')}</div></div>`}
  return '';
}
drawer.addEventListener('click',e=>{
  if(e.target===drawer){closeCard();return}
  const b=e.target.closest('[data-d]');const t=tById(card.id);if(!b||!t)return;const d=b.dataset.d;
  if(d==='close')closeCard();if(d==='plan')A.plan(t);if(d==='unplan')A.unplan(t);if(d==='doing')A.doing(t);
  if(d==='h')A.hours(t,+b.dataset.v);if(d==='cancel'){A.cancel(t);closeCard()}if(d==='restore')A.restore(t);
  if(d==='wclear')A.waiting(t,'');
  if(d==='drop'){A.unplan(t)}
  if(d==='first'){const mn=Math.min(0,...planOpen().filter(x=>planDay(x)>=TODAY()).map(x=>+x.todayOrder||0));upd(t,{today:TODAY(),todayOrder:mn-1});toast('Первая в плане на сегодня')}
  if(d==='nudge'){if(!inPlan(t)||planDay(t)<TODAY())A.plan(t);else toast('Уже в плане на сегодня')}
});
drawer.addEventListener('keydown',e=>{if(e.target.id==='cw'&&e.key==='Enter'){e.preventDefault();e.target.blur()}});
drawer.addEventListener('focusout',e=>{if(e.target.id==='cw'){const t=tById(card.id);const v=e.target.value.trim();if(t&&v!==(t.waiting||''))A.waiting(t,v)}});

/* новая задача */
const addDlg=$('#addDlg');
/* префикс id задачи: поле prefix у проекта, иначе id проекта */
const prefixOf=pid=>pById(pid)?.prefix||pid;
const NA={proj:null,hours:1,today:false,kbd:false};
function fillSec(){const p=pById($('#aProj').value);const secs=(p&&p.sections||[]).map(s=>s.title);
  $('#aSec').innerHTML=(secs.length?secs:['']).map(s=>`<option value="${esc(s)}">${s?esc(s):'Без раздела'}</option>`).join('');$('#aSec').disabled=!secs.length}
function paintAdd(){$('#aHours').innerHTML=HOURS.map(h=>`<button type="button" data-h="${h}" aria-pressed="${NA.hours===h}">${hrs(h)}</button>`).join('');$('#aToday').setAttribute('aria-checked',NA.today)}
function openAdd(pid,kbd){
  const ps=sortedProjects().filter(p=>p.status!=='frozen');
  $('#aProj').innerHTML=ps.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#aProj').value=pid||NA.proj||(ps[0]&&ps[0].id)||'';fillSec();
  $('#aTitle').value='';$('#aErr').hidden=true;paintAdd();NA.kbd=kbd;
  addDlg.hidden=false;requestAnimationFrame(()=>addDlg.classList.add('open'));setTimeout(()=>$('#aTitle').focus(),30)}
function closeAdd(){addDlg.classList.remove('open');setTimeout(()=>{if(!addDlg.classList.contains('open'))addDlg.hidden=true},170)}
$('#aTitle').addEventListener('input',()=>{$('#aErr').hidden=true});
$('#aProj').addEventListener('change',()=>{NA.proj=$('#aProj').value;fillSec()});
addDlg.addEventListener('click',e=>{if(e.target===addDlg||e.target.closest('[data-x=cancel]')){closeAdd();return}
  const h=e.target.closest('[data-h]');if(h){NA.hours=+h.dataset.h;paintAdd();return}
  if(e.target.closest('#aToday')){NA.today=!NA.today;paintAdd()}});
$('form',addDlg).addEventListener('submit',async e=>{e.preventDefault();
  const title=$('#aTitle').value.trim();if(!title){$('#aErr').hidden=false;$('#aTitle').focus();return}
  if(!db){toast('Нет связи с базой');return}if(!canWrite){toast('Нет доступа на запись');return}
  const pid=$('#aProj').value,sec=$('#aSec').value,now=stamp();
  const id=prefixOf(pid)+'-n'+Date.now().toString(36);
  const same=S.tasks.filter(t=>t.projectId===pid&&(t.section||'')===sec);
  const data={title,projectId:pid,section:sec,hours:NA.hours,done:false,doneAt:null,doing:false,waiting:'',today:NA.today?TODAY():false,
    due:null,tags:[],order:Math.max(0,...same.map(t=>+t.order||0))+1,note:'',createdAt:now,updatedAt:now};
  if(NA.today)data.todayOrder=Math.max(-1,...planOpen().map(x=>+x.todayOrder||0))+1;
  S.tasks.push({id,...data});closeAdd();renderAll();toast(NA.today?'Добавлено в план на сегодня':'Задача добавлена');
  try{await db.doc('tasks/'+id).set(data);logEvents([{at:now,by:'hub',projectId:pid,taskId:id,title,action:'created',detail:`${sec||'без раздела'} · ${hrs(NA.hours)}${NA.today?' · в плане на сегодня':''}`}])}catch(err){S.tasks=S.tasks.filter(t=>t.id!==id);renderAll();toast('Не сохранилось. Попробуй ещё раз')}
});

/* новый проект: создать здесь или подключить проект Claude */
const projDlg=$('#projDlg'),NP={tab:'here',kind:'key'};
const KINDS=[['must','обязательный'],['key','ключевой'],['want','хочу']];
const TR={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
/* id проекта из названия: первое слово латиницей, не длиннее 12 знаков, без повторов */
function newPid(name){
  const w=(name.toLowerCase().match(/[a-zа-яё0-9]+/g)||[]).map(x=>[...x].map(c=>TR[c]??c).join(''));
  let b=(w[0]||'p').slice(0,12);if(b.length<3&&w[1])b=(b+'-'+w[1]).slice(0,12);if(!/^[a-z]/.test(b))b='p'+b;
  const taken=new Set(S.projects.flatMap(p=>[p.id,p.prefix]));let id=b,i=2;while(taken.has(id))id=b+i++;return id}
let urlDraft='';
const hubUrl=()=>(S.meta.find(d=>d.id==='hub')||{}).url||urlDraft;
/* блок для инструкции проекта Claude: один на все проекты, без подстановок */
function connectText(url){const u=url||'<адрес хаба>';return `Хаб

План этого проекта живёт в базе хаба: ${u} — это артефакт Claude с базой (коллекции projects, tasks, events). Своих артефактов-планов не заводи.

Какой проект твой. Если в конце этой инструкции есть строка «projectId: <id>» — это он, документ projects/<id>. Если строки нет — проект ещё не подключён.

Подключение (один раз, по сообщению «Подключись к хабу»):
1. Прочитай коллекцию projects. Если проект уже заведён в хабе вручную — спроси меня, какой из них этот, и возьми его id. Если нет — придумай короткий id латиницей, которого там ещё нет (например podcast), и спроси меня: чем проект заканчивается (цель), срок и тип (обязательный must / ключевой key / хочу want). Цели и сроки ставлю я, не придумывай. Создай projects/<id>: name, kind, goal, due ("YYYY-MM-DD" или null), status "active", order = наибольший order + 1, prefix = id, sections [{key, title}], where {text, at}, note "".
2. Попроси меня дописать в конец этой инструкции строку «projectId: <id>».
3. Разложи план на задачи от 30 минут до 3 часов, покажи списком по разделам, после моего ок запиши. id задач: <id>-<буква раздела><номер>, например <id>-a01. Задачи с id вида <id>-n… я создал прямо в хабе — это обычные задачи проекта.

Схема задачи (новая — op "set"): title, projectId, section (title раздела), hours (0.5 | 1 | 2 | 3), done:false, doneAt:null, canceled:false, doing:false, waiting:"", today:false, due:null, tags:[], order (порядок внутри раздела), note:"", createdAt, updatedAt (ISO UTC с Z).

Правила:
- Перед любой записью читай документ и пиши с ifVersion. Конфликт версии — перечитай и повтори. Массовые изменения — батчами до 50, пауза 2 секунды.
- По ходу разговора любую новую, изменённую или закрытую задачу сразу пиши в хаб, не копи до конца сессии. После записи одной строкой скажи, что записал. Неясно, задача это или мысль вслух — спроси.
- Закрыть: done:true, doneAt (когда сделано по факту), doing:false, waiting:"", итог в note. Отменить: done:true, canceled:true, doneAt, причина в note. Документы не удаляй.
- Начал работу: doing:true, остановился: false. Ждём кого-то: waiting строкой, дождались: "".
- today, todayOrder, due, tags, viz не трогай: их ставлю я и хаб.
- Начало сессии: прочитай свои задачи и events с этим projectId и at позже projects/<id>.syncedAt (если поля нет — все события). Одной-двумя строками скажи, что я поменял в хабе без тебя, и учти это. Затем запиши в projects/<id> syncedAt = at последнего прочитанного события. В events сам не пиши.
- Конец сессии: обнови where в projects/<id> — {text: 2–4 фразы «где мы сейчас», at: сейчас}.`}
const hasUrl=()=>!!(S.meta.find(d=>d.id==='hub')||{}).url;
const CONN={
  steps:()=>`<ol class="steps"><li>Открой проект в Claude или создай новый.</li><li>Скопируй блок и вставь его в инструкцию проекта.</li><li>Напиши в проекте: «Подключись к хабу».</li></ol>`,
  url:()=>hasUrl()?'':`<label class="fld"><span class="l">Адрес этого хаба — скопируй из адресной строки</span><input type="url" data-url placeholder="https://claude.ai/artifact/…" value="${esc(hubUrl())}" autocomplete="off"></label>`,
  code:()=>`<div class="code"><pre>${esc(connectText(hubUrl()))}</pre></div>`,
  copy:()=>`<button class="btn secondary" type="button" data-a="copyconn">${I.copy}<span>Скопировать блок</span></button>`};
const connectHTML=()=>CONN.steps()+CONN.url()+CONN.code()+CONN.copy();
async function copyConn(b){
  const u=hubUrl(),txt=connectText(u);let ok=false;
  try{await navigator.clipboard.writeText(txt);ok=true}catch(e){
    const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();
    try{ok=document.execCommand('copy')}catch(_){}ta.remove()}
  toast(ok?(u?'Блок скопирован':'Скопировано. Впиши адрес хаба вместо <адрес хаба>'):'Не получилось скопировать. Выдели текст вручную');
  if(ok){const sp=$('span',b);sp.textContent='Скопировано';clearTimeout(b._t);b._t=setTimeout(()=>sp.textContent='Скопировать блок',2000)}
  if(urlDraft&&db&&canWrite&&!(S.meta.find(d=>d.id==='hub')||{}).url)db.doc('meta/hub').set({url:urlDraft,updatedAt:stamp()}).catch(()=>{})}
document.addEventListener('input',e=>{const f=e.target.closest&&e.target.closest('[data-url]');if(!f)return;
  urlDraft=f.value.trim();$$('.code pre').forEach(pre=>pre.textContent=connectText(urlDraft));$$('[data-url]').forEach(x=>{if(x!==f)x.value=f.value})});
function paintProj(){
  $('.tabs',projDlg).hidden=MEM; /* в демо подключать некуда: базы нет */
  $$('[data-tab]',projDlg).forEach(b=>b.setAttribute('aria-pressed',b.dataset.tab===NP.tab));
  $('#pHere').hidden=NP.tab!=='here';$('#pConn').hidden=NP.tab!=='conn';
  $('#pKind').innerHTML=KINDS.map(([v,l])=>`<button type="button" data-k="${v}" aria-pressed="${NP.kind===v}">${l}</button>`).join('');
  $('#pSubmit').hidden=NP.tab!=='here';$('#pCancel').textContent=NP.tab==='here'?'Отмена':'Готово'}
function openProj(tab){NP.tab=tab||'here';$('#pName').value='';$('#pSecs').value='';$('#pErr').hidden=true;$('#pConn').innerHTML=connectHTML();paintProj();
  projDlg.hidden=false;requestAnimationFrame(()=>projDlg.classList.add('open'));if(NP.tab==='here')setTimeout(()=>$('#pName').focus(),30)}
function closeProj(){projDlg.classList.remove('open');setTimeout(()=>{if(!projDlg.classList.contains('open'))projDlg.hidden=true},170)}
$('#pName').addEventListener('input',()=>{$('#pErr').hidden=true});
projDlg.addEventListener('click',e=>{if(e.target===projDlg||e.target.closest('[data-x=cancel]')){closeProj();return}
  const t=e.target.closest('[data-tab]');if(t){NP.tab=t.dataset.tab;paintProj();if(NP.tab==='here')$('#pName').focus();return}
  const k=e.target.closest('[data-k]');if(k){NP.kind=k.dataset.k;paintProj()}});
$('form',projDlg).addEventListener('submit',async e=>{e.preventDefault();if(NP.tab!=='here')return;
  const name=$('#pName').value.trim();if(!name){$('#pErr').hidden=false;$('#pName').focus();return}
  if(!db){toast('Нет связи с базой');return}if(!canWrite){toast('Нет доступа на запись');return}
  const id=newPid(name),now=stamp();
  const secs=[...new Set($('#pSecs').value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean))];
  const data={name,kind:NP.kind,goal:'',due:null,status:'active',order:Math.max(0,...S.projects.filter(p=>p.status!=='frozen').map(p=>+p.order||0))+1,
    prefix:id,sections:secs.map((t,i)=>({key:'s'+(i+1),title:t})),note:'',createdAt:now,updatedAt:now};
  const p={id,...data};S.projects.push(p);assignViz();closeProj();renderAll();toast('Проект создан');
  requestAnimationFrame(()=>{const el=$('#p-'+CSS.escape(id));el&&el.scrollIntoView({behavior:reduce()?'auto':'smooth',block:'center'})});
  try{await db.doc('projects/'+id).set({...data,viz:p.viz})}catch(err){S.projects=S.projects.filter(x=>x.id!==id);renderAll();toast('Не сохранилось. Попробуй ещё раз')}
});

/* пустой хаб: первый запуск */
function renderOnb(){
  const empty=loaded.projects&&!S.projects.length,o=$('#onb');
  $('#mainView').classList.toggle('is-empty',empty);o.hidden=!empty;
  if(!empty){o.innerHTML='';return}
  if(o.childElementCount&&o.dataset.hasurl===String(hasUrl()))return;
  o.dataset.hasurl=String(hasUrl());
  o.innerHTML=`<header class="onb-h"><h1>Начнём с проекта</h1><p>Здесь будут план на день, задачи всех проектов и аналитика. Заведи первый проект — прямо здесь или через Claude.</p></header>
    <section class="onb-c onb-here"><div><h2>Создать здесь</h2><p>Название, тип и разделы. Задачи добавишь сразу после.</p></div>
      <button class="btn primary" type="button" data-a="newproj">${I.add.replace('<svg','<svg style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round"')}Новый проект</button></section>
    <section class="onb-c onb-conn"><div class="onb-l"><div><h2>Подключить проект Claude</h2><p>Проект сам заведёт себя в хабе, разложит план на задачи и будет отмечать сделанное.</p></div>
      ${CONN.steps()}${CONN.url()}${CONN.copy()}</div>${CONN.code()}</section>`}

/* клики */
document.addEventListener('click',e=>{
  if(!menu.hidden&&!e.target.closest('#menu')&&!e.target.closest('[data-a=menu]'))closeMenu();
  const f=e.target.closest('[data-f]');
  if(f){const k=f.dataset.f;
    if(k==='size')F.size=+f.dataset.v;else if(k==='tag'){const v=f.dataset.v;F.tags=F.tags.includes(v)?F.tags.filter(x=>x!==v):[...F.tags,v]}else F[k]=!F[k];
    saveF();renderFilters();renderProjects();return}
  if(e.target.closest('#drawer,#menu,#addDlg,#projDlg'))return;
  if(e.target.closest('[data-a=newproj]')){openProj('here');return}
  if(e.target.closest('[data-a=copyconn]')){copyConn(e.target.closest('[data-a=copyconn]'));return}
  const cb=e.target.closest('.cb');
  if(cb&&!cb.disabled){const t=tById(cb.closest('.task').dataset.id);t&&A.done(t);return}
  const a=e.target.closest('[data-a]');if(!a)return;
  const act=a.dataset.a,blk=a.closest('.blk');
  if(act==='toggle'){const k=blk.dataset.key,frozen=blk.dataset.frozen==='true';const isC=blk.classList.toggle('closed');
    if(frozen){isC?closed.delete('open:'+k):closed.add('open:'+k)}else{isC?closed.add(k):closed.delete(k)}
    a.setAttribute('aria-expanded',!isC);saveC();return}
  if(act==='about'){const id=blk.dataset.id;aboutOpen.has(id)?aboutOpen.delete(id):aboutOpen.add(id);const ab=$('.about',blk);ab.hidden=!aboutOpen.has(id);a.classList.toggle('on',aboutOpen.has(id));a.setAttribute('aria-expanded',aboutOpen.has(id));return}
  if(act==='more'){const k=a.dataset.k;expanded.has(k)?expanded.delete(k):expanded.add(k);renderProjects();return}
  if(act==='add'){openAdd(null,e.detail===0);return}
  if(act==='addp'){openAdd(blk.dataset.id,e.detail===0);return}
  if(act==='keepall'||act==='dropall'){const c=planOpen().filter(t=>planDay(t)<TODAY());const prev=c.map(t=>[t,t.today]);
    let o=Math.max(-1,...planOpen().filter(t=>planDay(t)>=TODAY()).map(x=>+x.todayOrder||0));
    c.forEach(t=>upd(t,act==='keepall'?{today:TODAY(),todayOrder:++o}:{today:false},{quiet:true}));renderAll();
    toast(act==='keepall'?`Оставлено на сегодня: ${c.length}`:`Вернул в бэклог: ${c.length}`,()=>{prev.forEach(([t,d])=>upd(t,{today:d},{quiet:true}));renderAll()});return}
  const t=tById(a.closest('.task')?.dataset.id);if(!t)return;
  if(act==='plan')A.plan(t);if(act==='unplan')A.unplan(t);if(act==='card')openCard(t.id,null,e.detail===0);
  if(act==='menu'){menuFor===t.id?closeMenu():openMenu(a,t)}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!projDlg.hidden){closeProj();return}
  if(e.key==='Escape'&&!addDlg.hidden){closeAdd();return}
  if(e.key==='Escape'){if(!menu.hidden){const b=menuBtn;closeMenu();b&&b.focus()}else if(card.id)closeCard();return}
  if(!e.altKey||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;
  const tr=e.target.closest&&e.target.closest('#planRows .task.sortable');
  if(tr){const ids=planOpen().map(t=>t.id);if(keyMove(e,ids,tr.dataset.id,setPlanOrder)){e.preventDefault();requestAnimationFrame(()=>{const el=$(`#planRows .task[data-id="${CSS.escape(tr.dataset.id)}"] .tt`);el&&el.focus()})}return}
  const pb=e.target.closest&&(e.target.closest('#projects .bh')||e.target.closest('#pnav a'));
  if(pb){const id=(pb.closest('.blk')||pb).dataset.id,ids=sortedProjects().map(p=>p.id);if(keyMove(e,ids,id,setProjectOrder)){e.preventDefault();const inNav=!!e.target.closest('#pnav');
    requestAnimationFrame(()=>{const el=inNav?$(`#pnav a[data-id="${CSS.escape(id)}"]`):$(`#p-${CSS.escape(id)} [data-a=toggle]`);el&&el.focus()})}}
});

/* переходы к проекту */
const jump=id=>{const el=$('#p-'+CSS.escape(id));if(!el)return;if(el.classList.contains('closed'))$('[data-a=toggle]',el).click();el.scrollIntoView({behavior:reduce()?'auto':'smooth'})};
$('#pnav').addEventListener('click',e=>{const l=e.target.closest('a');if(!l)return;e.preventDefault();if(isAnalytics()){history.pushState(null,'',location.pathname+location.search);route();requestAnimationFrame(()=>jump(l.dataset.id))}else jump(l.dataset.id)});
$('#psel').addEventListener('change',e=>{const v=e.target.value;e.target.value='';if(!v)return;if(v==='__new'){openProj('here');return}if(isAnalytics()){location.hash='plan';requestAnimationFrame(()=>jump(v))}else jump(v)});
new ResizeObserver(()=>{moveInd(true);fadeFl()}).observe(document.body);
addEventListener('scroll',()=>closeMenu(),{passive:true});
document.addEventListener('dragstart',e=>e.preventDefault());

/* перетаскивание проектов: в панели и за шапку блока */
sortable($('#pnav'),{item:'a',handle:'a',end:(ids,moved)=>{if(moved)setProjectOrder(ids)}});
sortable($('#projects'),{item:'.blk',handle:'.bh',
  noFlip:true,start:()=>{$('#projects').classList.add('sorting')},
  end:(ids,moved)=>{$('#projects').classList.remove('sorting');if(moved)setProjectOrder(ids)}});

/* для аналитики */
window.HUB={S,ls,MEM,esc,hrs,sumH,dayStr,TODAY,pById,tById,openCard,plural,tasksW,fmtDay,sortedProjects,planDay,g,I};

/* данные */
(async()=>{
  renderFilters();
  const timer=setTimeout(()=>{if(!S.tasks.length)$('#plan').innerHTML='<div class="empty" style="padding:20px"><b>Не дождался данных</b>Открой страницу под своим аккаунтом claude.ai.</div>'},10000);
  if(MEM)db=memDb(window.HUB_SEED());
  else db=window.claude?await claude.use('db'):null;
  if(!db){clearTimeout(timer);$('#plan').innerHTML='<div class="empty" style="padding:20px"><b>Нет связи с базой</b>Открой страницу под своим аккаунтом claude.ai.</div>';return}
  if(!MEM)try{const user=await claude.use('user');if(user&&user.can){const w=await user.can('data.write');if(w===false)canWrite=false}}catch(e){}
  let tagsKey='';pendingRender=false;
  const sub=(col,key)=>db.collection(col).onSnapshot(s=>{clearTimeout(timer);
    S[key]=s.docs.map(d=>({id:d.id,...d.data()}));if(key==='projects'){loaded.projects=true;assignViz()}
    if(document.body.classList.contains('dragging')){pendingRender=true;return}
    renderAll();const tk=[...new Set(S.tasks.flatMap(t=>t.tags||[]))].sort().join('|');if(tk!==tagsKey){tagsKey=tk;renderFilters()}},
    e=>toast('Ошибка чтения: '+(e&&e.code||'')));
  sub('projects','projects');sub('tasks','tasks');sub('days','days');sub('meta','meta');route();
  document.fonts&&document.fonts.ready.then(()=>moveInd(true));
})();
}
