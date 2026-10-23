/* カケイボくん v0.1 - local-only offline-first MVP. No company data is stored. */
(function(){
"use strict";
const KEY="kakeibokun:v1";
const DEFAULT_CATEGORIES=["食費","日用品","外食","交通","住居","光熱費","通信費","趣味","医療","その他"];
const today=()=>{const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());};
const pad=n=>String(n).padStart(2,"0");
const yen=n=>"¥"+Math.round(Number(n)||0).toLocaleString("ja-JP");
const safe=s=>String(s===null||s===undefined?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
const defaults=()=>({version:1,tx:[],cards:[],accounts:[],recurring:[],categories:[...DEFAULT_CATEGORIES],budget:{month:0},prefs:{fixedMe:50},checks:[]});
let data;try{data=Object.assign(defaults(),JSON.parse(localStorage.getItem(KEY)||"{}"));}catch(e){data=defaults();}
for(const k of ["tx","cards","accounts","recurring","categories","checks"]){if(!Array.isArray(data[k]))data[k]=defaults()[k];}
data.budget=data.budget||{month:0};data.prefs=data.prefs||{fixedMe:50};
let tab="home", month=today().slice(0,7), chosen=today(), page=0, cardPage=0, form={kind:"expense",amount:"",cat:"食費",scope:"personal",method:"cash",paidBy:"me",date:today()};
const el=document.getElementById("screen"),overlay=document.getElementById("overlay"),modalBody=document.getElementById("modal-body"),modalTitle=document.getElementById("modal-title");
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){toast("保存できません。容量を確認してください");}};
const md=d=>new Date(d+"T12:00:00");
const addMonths=(date,n)=>new Date(date.getFullYear(),date.getMonth()+n,1);
const lastDay=(year,month0)=>new Date(year,month0+1,0).getDate();
const dateOf=(y,m0,d)=>y+"-"+pad(m0+1)+"-"+pad(Math.min(d,lastDay(y,m0)));
const monthKey=d=>d.slice(0,7);
const offsetMonth=(mk,delta)=>{const p=mk.split("-").map(Number);const d=new Date(p[0],p[1]-1+delta,1);return d.getFullYear()+"-"+pad(d.getMonth()+1);};
const mTotal=(mk,scope)=>data.tx.filter(t=>t.kind==="expense"&&monthKey(t.date)===mk&&(!scope||t.scope===scope)).reduce((s,t)=>s+t.amount,0);
const mIncome=mk=>data.tx.filter(t=>t.kind==="income"&&monthKey(t.date)===mk).reduce((s,t)=>s+t.amount,0);
const sortTx=arr=>arr.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||"").localeCompare(a.createdAt||""));
const cName=id=>id==="cash"?"現金":(data.cards.find(c=>c.id===id)||{}).name||"不明なカード";
const labelScope=v=>v==="shared"?"夫婦共通":"個人";
const labelKind=v=>v==="income"?"収入":"支出";
const inputChip=(title,action,val,sel)=>'<button class="chip'+(val===sel?" selected":"")+'" type="button" data-action="'+action+'" data-value="'+safe(val)+'">'+safe(title)+'</button>';
const button=(txt,action,extra="")=>'<button type="button" class="secondary" data-action="'+action+'" '+extra+'>'+txt+'</button>';
function paymentDate(tx,card){
  const d=md(tx.date), closeMonth=d.getDate()<=Number(card.closingDay)?0:1;
  const close=addMonths(d,closeMonth),pay=addMonths(close,Number(card.payLag)||1);
  return dateOf(pay.getFullYear(),pay.getMonth(),Number(card.payDay)||27);
}
function upcomingCards(){
  let items=[];
  data.tx.filter(t=>t.kind==="expense"&&t.method!=="cash").forEach(t=>{
    const card=data.cards.find(c=>c.id===t.method);if(!card)return;
    const due=paymentDate(t,card);
    if(due>=today())items.push({due,amount:t.amount,cardId:card.id,cardName:card.name,accountId:card.accountId||""});
  });
  return items;
}
function dueGroups(){
  const g={};upcomingCards().forEach(x=>{const key=x.cardId+"|"+x.due;if(!g[key])g[key]={...x,amount:0};g[key].amount+=x.amount;});
  return Object.values(g).sort((a,b)=>a.due.localeCompare(b.due));
}
function futureBalance(a){
  if(!a)return null;
  const asOf=a.asOf||today();
  const outCard=data.tx.filter(t=>t.kind==="expense"&&t.method!=="cash").reduce((sum,t)=>{
    const card=data.cards.find(c=>c.id===t.method);
    return sum+(card&&card.accountId===a.id&&paymentDate(t,card)>asOf?t.amount:0);
  },0);
  const outCash=data.tx.filter(t=>t.method==="cash"&&t.accountId===a.id&&t.date>asOf).reduce((sum,t)=>sum+(t.kind==="expense"?t.amount:-t.amount),0);
  return Number(a.balance||0)-outCard-outCash;
}
function recurringNow(){
 const mk=monthKey(today());
 for(const r of data.recurring){
   if(!r.active)continue;
   const id="repeat:"+r.id+":"+mk;
   if(data.tx.some(t=>t.id===id))continue;
   const y=+mk.slice(0,4),m=+mk.slice(5,7)-1;
   const due=dateOf(y,m,Number(r.day)||1);
   data.tx.push({id,kind:"expense",date:due,amount:Number(r.amount)||0,cat:r.cat||"住居",scope:r.scope||"shared",method:r.method||"cash",accountId:r.accountId||"",paidBy:r.paidBy||"me",note:r.name||"定期支出",fixed:true,scheduled:true,createdAt:new Date().toISOString()});
 }
 save();
}
function toast(msg){
 const t=document.getElementById("toast");t.textContent=msg;t.classList.remove("hidden");
 clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add("hidden"),2700);
}
function render(){
 const stamp=new Date();document.getElementById("today-chip").textContent=(stamp.getMonth()+1)+"/"+stamp.getDate()+" "+["日","月","火","水","木","金","土"][stamp.getDay()];
 document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
 const pageContent={home:homeView,input:inputView,trip:tripView,cards:cardsView,household:householdView}[tab]();
 el.innerHTML='<div class="page '+(tab==="input"?"input-page":"")+'">'+pageContent+'</div>';
}
function rowTx(t){
 return '<button class="tx-row" data-action="edit-tx" data-value="'+safe(t.id)+'" type="button"><span class="tx-icon">'+(t.kind==="income"?"＋":t.scope==="shared"?"⌂":"¥")+'</span><span class="grow"><div class="tx-name">'+safe(t.note||t.cat)+'</div><div class="tx-meta">'+safe(t.date.slice(5).replace("-","/"))+' · '+safe(t.cat)+' · '+safe(labelScope(t.scope))+' · '+safe(cName(t.method))+(t.scheduled?" · 定期":"")+'</div></span><span class="tx-money">'+(t.kind==="income"?"+":"−")+yen(t.amount)+'</span></button>';
}
function homeView(){
 const mk=monthKey(today()),spent=mTotal(mk),income=mIncome(mk),due=dueGroups(),dueSum=due.reduce((a,b)=>a+b.amount,0);
 const recent=sortTx(data.tx).slice(0,3);
 const b=Number(data.budget.month)||0,pct=b?Math.min(100,Math.round(spent/b*100)):0;
 const checked=data.checks.includes(today())||data.tx.some(t=>t.date===today());
 return '<div class="page-head"><div><h1>家計のいま</h1><div class="subtitle">'+safe(mk.replace("-","年"))+'月の記録</div></div><button class="ghost" data-action="go-input">＋ すぐ入力</button></div>'+
 '<section class="card home-lead"><div class="eyebrow">今月の支出（出張経費は含まない）</div><div class="money">'+yen(spent)+'</div><div class="flex between" style="margin-top:6px"><span class="hint">今月の収入 '+yen(income)+'</span><span class="hint">収支 '+yen(income-spent)+'</span></div></section>'+
 '<div class="grid2"><div class="card stat-card"><div class="eyebrow">今後のカード引落予定</div><div class="money">'+yen(dueSum)+'</div><div class="hint">'+due.length+'件の請求見込み</div></div><div class="card stat-card"><div class="eyebrow">共通の生活費</div><div class="money">'+yen(mTotal(mk,"shared"))+'</div><div class="hint">個人 '+yen(mTotal(mk,"personal"))+'</div></div></div>'+
 '<section class="card section-compact"><div class="flex between"><span class="panel-title">月間予算</span><span class="eyebrow">'+(b?yen(spent)+" / "+yen(b):"未設定")+'</span></div><div class="chart-track"><div style="width:'+pct+'%"></div></div><div class="flex between" style="margin-top:7px"><span class="hint">'+(b?"利用 "+pct+"%":"設定すると使いすぎが見える")+'</span><button class="ghost" data-action="settings-budget">設定 →</button></div></section>'+
 (!checked?'<div class="note flex between"><span>今日の支出は記録しましたか？</span><button class="tiny-btn" data-action="no-spend">支出なし</button></div>':"")+
 '<section class="card recent"><div class="flex between"><span class="panel-title">最近の記録</span><button class="ghost" data-action="go-household">カレンダー →</button></div><div class="recent-list">'+(recent.length?recent.map(rowTx).join(""):'<div class="empty">まだ記録がありません。<br>「入力」から始めましょう。</div>')+'</div></section>';
}
function inputView(){
 const income=form.kind==="income",amount=Number(form.amount)||0;
 const methods=[{id:"cash",name:"現金"},...data.cards.slice(0,3).map(c=>({id:c.id,name:c.name}))];
 const cats=income?["給与","賞与","副収入","その他"]:data.categories.slice(0,8);
 if(!cats.includes(form.cat)){form.cat=cats[0]||"その他";}
 if(!methods.some(m=>m.id===form.method)){form.method="cash";}
 return '<div class="page-head"><h1>かんたん入力</h1><span class="pill">1画面で完了</span></div>'+
 '<div class="segmented"><button class="'+(!income?"selected":"")+'" data-action="kind" data-value="expense">支出</button><button class="'+(income?"selected":"")+'" data-action="kind" data-value="income">収入</button></div>'+
 '<div class="card amount-card"><div class="eyebrow">金額を入力</div><div class="amount-display" id="amount-value">'+yen(amount)+'</div></div>'+
 '<div><div class="field-label">カテゴリー</div><div class="chips">'+cats.slice(0,8).map(c=>inputChip(c,"set-category",c,form.cat)).join("")+'</div></div>'+
 '<div><div class="field-label">支払方法</div><div class="chips">'+methods.map(c=>inputChip(c.name,"set-method",c.id,form.method)).join("")+'</div></div>'+
 '<div class="input-grid"><div><div class="field-label">用途</div><div class="segmented"><button class="'+(form.scope==="personal"?"selected":"")+'" data-action="scope" data-value="personal">個人</button><button class="'+(form.scope==="shared"?"selected":"")+'" data-action="scope" data-value="shared">夫婦共通</button></div></div><div><div class="field-label">支払った人</div><div class="segmented"><button class="'+(form.paidBy==="me"?"selected":"")+'" data-action="paid-by" data-value="me">自分</button><button class="'+(form.paidBy==="partner"?"selected":"")+'" data-action="paid-by" data-value="partner">相手</button></div></div></div>'+
 '<div class="input-meta"><input aria-label="日付" type="date" id="entry-date" value="'+safe(form.date)+'" max="2099-12-31"><input aria-label="メモ" type="text" id="entry-note" placeholder="メモ（任意）" maxlength="50" style="flex:1"></div>'+
 '<div class="keypad">'+["1","2","3","4","5","6","7","8","9","C","0","⌫"].map(k=>'<button type="button" class="key'+("C⌫".includes(k)?" utility":"")+'" data-action="key" data-value="'+safe(k)+'">'+safe(k)+'</button>').join("")+'</div>'+
 '<div class="save-row"><button class="primary" data-action="save-transaction">この内容で登録する</button><button class="secondary" data-action="manage-categories">分類の編集</button></div>';
}
function tripView(){
 return '<div class="page-head"><h1>出張</h1><span class="pill warn">保存制限中</span></div>'+
 '<section class="card warn-card"><div class="warning-heading">社内情報管理規定を優先します</div><p class="hint" style="font-size:12px;color:#705e39">会社の経費データは個人アプリへの保存が禁止されているため、領収書・経費明細・出張情報の登録機能を停止しています。</p><div class="note">個人の立替金額についても保存可否が未確認のため、自動取り込み対象から除外します。</div></section>'+
 '<section class="card"><div class="panel-title">今使える機能</div><div class="stack" style="margin-top:10px"><div class="card-row"><div><h3>家計の支出入力</h3><div class="desc">私的な支出は通常どおり記録できます</div></div><button class="tiny-btn" data-action="go-input">入力 →</button></div><div class="card-row"><div><h3>カード引落しの確認</h3><div class="desc">登録済みの私的な利用分を集計します</div></div><button class="tiny-btn" data-action="go-cards">確認 →</button></div></div></section>'+
 '<div class="note">会社の許可が確認できた場合にのみ、許可範囲に限定した出張精算機能を追加します。</div>';
}
function cardsView(){
 const due=dueGroups();const shown=data.cards.slice(cardPage*3,cardPage*3+3);
 return '<div class="page-head"><h1>クレジットカード</h1><button class="tiny-btn" data-action="add-card">＋ カード追加</button></div>'+
 '<section class="card home-lead"><div class="eyebrow">今後の引落予定（未照合・概算）</div><div class="money">'+yen(due.reduce((a,b)=>a+b.amount,0))+'</div><div class="hint">カード利用月と引落月は別々に計算しています</div></section>'+
 '<section class="card recent"><div class="flex between"><span class="panel-title">登録カード</span><span class="eyebrow">'+data.cards.length+'枚</span></div><div class="recent-list">'+(shown.length?shown.map(c=>'<div class="card-row"><div class="grow"><h3>'+safe(c.name)+'</h3><div class="desc">'+c.closingDay+'日締め・翌'+(c.payLag===1?"月":c.payLag+"か月後")+c.payDay+'日払い</div></div><button class="tiny-btn" data-action="edit-card" data-value="'+safe(c.id)+'">編集</button></div>').join(""):'<div class="empty">カードを追加すると、<br>請求日を自動計算できます。</div>')+'</div><div class="pager"><button data-action="cards-prev" '+(cardPage<=0?"disabled":"")+'>‹</button><span>'+(Math.min(cardPage+1,Math.max(1,Math.ceil(data.cards.length/3))))+' / '+Math.max(1,Math.ceil(data.cards.length/3))+'</span><button data-action="cards-next" '+(cardPage>=Math.ceil(data.cards.length/3)-1?"disabled":"")+'>›</button></div></section>'+
 '<section class="card recent"><div class="panel-title">これからの引落し</div><div class="recent-list">'+(due.length?due.slice(0,3).map(x=>'<div class="card-row"><div class="grow"><h3>'+safe(x.cardName)+'</h3><div class="desc">'+safe(x.due)+' · 予測額</div></div><strong>'+yen(x.amount)+'</strong></div>').join(""):'<div class="empty">引落予定はありません</div>')+'</div></section>';
}
function householdView(){
 const [y,m]=month.split("-").map(Number),days=lastDay(y,m-1),first=new Date(y,m-1,1).getDay();
 let buttons=[];
 for(let i=0;i<42;i++){
   const day=i-first+1;
   if(day<1||day>days){buttons.push('<span class="day blank">·</span>');continue;}
   const d=dateOf(y,m-1,day),has=data.tx.some(t=>t.date===d);
   buttons.push('<button class="day '+(chosen===d?"sel ":"")+(today()===d?"today":"")+'" data-action="calendar-day" data-value="'+d+'">'+day+(has?'<span class="dot"></span>':"")+'</button>');
 }
 const tx=sortTx(data.tx.filter(t=>t.date===chosen)),shown=tx.slice(page*3,page*3+3),maxPages=Math.max(1,Math.ceil(tx.length/3));
 const total=tx.reduce((a,t)=>a+(t.kind==="expense"?t.amount:0),0);
 const shared=data.tx.filter(t=>t.kind==="expense"&&t.scope==="shared"&&monthKey(t.date)===month);
 const split=shared.reduce((r,t)=>{
   const fixed=!!t.fixed,rate=fixed?Math.max(0,Math.min(100,Number(data.prefs.fixedMe)||0))/100:.5;
   r.me+=Math.round(t.amount*rate);r.paidMe+=t.paidBy==="me"?t.amount:0;return r;
 },{me:0,paidMe:0});
 const dueToMe=split.paidMe-split.me;
 return '<div class="page-head"><h1>家計カレンダー</h1><button class="ghost" data-action="settings-budget">予算設定 →</button></div>'+
 '<section class="card calendar"><div class="flex between"><button class="icon-btn" data-action="month-prev">‹</button><strong style="font-size:13px">'+y+'年 '+m+'月</strong><button class="icon-btn" data-action="month-next">›</button></div><div class="calendar-week">'+["日","月","火","水","木","金","土"].map(d=>'<span>'+d+'</span>').join("")+'</div><div class="calendar-grid">'+buttons.join("")+'</div></section>'+
 '<div class="grid2"><div class="card stat-card"><div class="eyebrow">選択日の支出</div><div class="money">'+yen(total)+'</div></div><div class="card stat-card"><div class="eyebrow">当月の共通費</div><div class="money">'+yen(mTotal(month,"shared"))+'</div></div></div>'+
 '<section class="card recent"><div class="flex between"><span class="panel-title">'+chosen.slice(5).replace("-","/")+' の明細</span><span class="eyebrow">'+tx.length+'件</span></div><div class="recent-list">'+(shown.length?shown.map(rowTx).join(""):'<div class="empty">この日の記録はありません</div>')+'</div><div class="pager"><button data-action="history-prev" '+(page===0?"disabled":"")+'>‹</button><span>'+Math.min(page+1,maxPages)+' / '+maxPages+'</span><button data-action="history-next" '+(page>=maxPages-1?"disabled":"")+'>›</button></div></section>'+
 '<div class="note">共通費の負担差額：'+(dueToMe>0?"相手から自分へ ":dueToMe<0?"自分から相手へ ":"精算不要 ")+yen(Math.abs(dueToMe))+'（登録分のみ）</div>';
}
function openModal(title,html){modalTitle.textContent=title;modalBody.innerHTML=html;overlay.classList.remove("hidden");}
function closeModal(){overlay.classList.add("hidden");modalBody.innerHTML="";}
function field(label,id,val,type="text",opts=""){return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+safe(val)+'" '+opts+'></div>';}
function selectField(label,id,opts,sel){
 return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+opts.map(o=>'<option value="'+safe(o.value)+'" '+(o.value===sel?"selected":"")+'>'+safe(o.label)+'</option>').join("")+'</select></div>';
}
function settingsHome(){
 openModal("設定",'<div class="modal-grid">'+
 button("銀行口座","settings-accounts")+button("予算・負担割合","settings-budget")+
 button("固定費を登録","settings-recurring")+button("カテゴリー","manage-categories")+
 button("バックアップ","settings-data")+button("はじめに・安全性","settings-about")+
 '</div><div class="note">初期版は端末内保存です。ID認証・夫婦同期・Gmail連携は未接続です。会社の経費情報は登録しないでください。</div>');
}
function cardModal(id){
 const c=data.cards.find(x=>x.id===id)||{id:"",name:"",closingDay:25,payDay:27,payLag:1,accountId:""};
 openModal(c.id?"カードを編集":"カードを追加",
 field("カードの呼び名","card-name",c.name,"text",'maxlength="28" placeholder="例：メインカード"')+
 '<div class="modal-grid">'+field("締め日（1〜31）","card-close",c.closingDay,"number",'min="1" max="31"')+field("引落日（1〜31）","card-pay",c.payDay,"number",'min="1" max="31"')+'</div>'+
 '<div class="modal-grid">'+selectField("引落まで", "card-lag",[{value:"1",label:"締め月の翌月"},{value:"2",label:"締め月の翌々月"}],String(c.payLag))+
 selectField("引落口座","card-account",[{value:"",label:"未設定"},...data.accounts.map(a=>({value:a.id,label:a.name}))],c.accountId)+'</div>'+
 '<div class="modal-actions"><button class="primary" data-action="save-card" data-value="'+safe(c.id)+'">保存</button>'+(c.id?'<button class="secondary" data-action="delete-card" data-value="'+safe(c.id)+'">削除</button>':"")+'</div>'+
 '<div class="hint">月末（29〜31日）は、その月の最終日として計算します。支払日は予測であり、確定請求額ではありません。</div>');
}
function txModal(id){
 const t=data.tx.find(x=>x.id===id);if(!t)return;
 const methods=[{value:"cash",label:"現金"},...data.cards.map(c=>({value:c.id,label:c.name}))];
 openModal("取引を編集",'<div class="modal-grid">'+field("金額（円）","tx-amount",t.amount,"number",'min="1" max="999999999"')+field("利用日","tx-date",t.date,"date")+'</div>'+
 field("メモ","tx-note",t.note||"","text",'maxlength="50"')+
 '<div class="modal-grid">'+selectField("カテゴリー","tx-category",data.categories.concat(["給与","賞与","副収入"]).map(c=>({value:c,label:c})),t.cat)+selectField("支払方法","tx-method",methods,t.method)+'</div>'+
 '<div class="modal-grid">'+selectField("用途","tx-scope",[{value:"personal",label:"個人"},{value:"shared",label:"夫婦共通"}],t.scope)+selectField("支払った人","tx-paid",[{value:"me",label:"自分"},{value:"partner",label:"相手"}],t.paidBy)+'</div>'+
 '<div class="modal-actions"><button class="primary" data-action="save-tx" data-value="'+safe(t.id)+'">保存</button><button class="secondary" data-action="delete-tx" data-value="'+safe(t.id)+'">削除</button></div>');
}
function accountsModal(){
 const accounts=data.accounts.slice(0,4);
 openModal("銀行口座・残高",'<div class="stack">'+(accounts.length?accounts.map(a=>'<div class="card-row"><div class="grow"><h3>'+safe(a.name)+'</h3><div class="desc">確認日 '+safe(a.asOf||"不明")+' / 引落後概算 '+yen(futureBalance(a))+'</div></div><strong>'+yen(a.balance)+'</strong><button class="tiny-btn" data-action="edit-account" data-value="'+safe(a.id)+'">編集</button></div>').join(""):'<div class="note">残高を登録するとカード引落後の概算を計算できます。</div>')+'</div><button class="primary" data-action="add-account">＋ 口座を登録</button><button class="ghost" data-action="settings-home">設定へ戻る</button>');
}
function accountModal(id){
 const a=data.accounts.find(x=>x.id===id)||{id:"",name:"",balance:0,asOf:today()};
 openModal(a.id?"口座を編集":"口座を追加",field("口座の呼び名","a-name",a.name,"text",'maxlength="25"')+
 '<div class="modal-grid">'+field("確認済み残高（円）","a-balance",a.balance,"number",'min="-999999999" max="999999999"')+field("残高の確認日","a-date",a.asOf,"date")+'</div>'+
 '<div class="modal-actions"><button class="primary" data-action="save-account" data-value="'+safe(a.id)+'">保存</button>'+(a.id?'<button class="secondary" data-action="delete-account" data-value="'+safe(a.id)+'">削除</button>':"")+'</div>'+
 '<div class="hint">残高は入力した時点の実残高。概算は登録された将来のカード引落と現金取引のみを反映し、給与など未登録の予定は含みません。</div>');
}
function budgetModal(){
 openModal("予算・夫婦の負担",field("月間の生活費予算（円）","b-month",Number(data.budget.month)||0,"number",'min="0" max="999999999"')+
 field("固定費の自分の負担割合（%）","b-fixed",Number(data.prefs.fixedMe),"number",'min="0" max="100"')+
 '<div class="note">変動費は50：50で計算します。割合を変えても元の取引は変更しません。</div><button class="primary" data-action="save-budget">設定を保存</button>');
}
function categoriesModal(){
 openModal("カテゴリーを編集",'<div class="field"><label>追加するカテゴリー</label><div class="flex"><input type="text" id="new-cat" maxlength="12" placeholder="新しいカテゴリー" class="grow"><button class="tiny-btn" data-action="add-category">追加</button></div></div>'+
 '<div class="chips">'+data.categories.slice(0,20).map(c=>'<button type="button" class="chip" data-action="delete-category" data-value="'+safe(c)+'">'+safe(c)+' ×</button>').join("")+'</div>'+
 '<div class="hint">削除しても過去に登録した支出のカテゴリーは残ります。</div><button class="ghost" data-action="settings-home">設定へ戻る</button>');
}
function recurringModal(){
 openModal("固定費の自動登録",'<div class="stack">'+data.recurring.slice(0,3).map(r=>'<div class="card-row"><div class="grow"><h3>'+safe(r.name)+'</h3><div class="desc">毎月'+r.day+'日 / '+yen(r.amount)+'</div></div><button class="tiny-btn" data-action="edit-recurring" data-value="'+safe(r.id)+'">編集</button></div>').join("")+'</div><button class="primary" data-action="add-recurring">＋ 固定費を追加</button><button class="ghost" data-action="settings-home">設定へ戻る</button><div class="hint">アプリ起動時に月ごとの予定取引を作成します。実際の引落を自動確認するものではありません。</div>');
}
function recurringEdit(id){
 const r=data.recurring.find(x=>x.id===id)||{id:"",name:"",amount:0,day:1,cat:"住居",scope:"shared",method:"cash",active:true,paidBy:"me"};
 openModal(r.id?"固定費を編集":"固定費を追加",'<div class="modal-grid">'+field("名称","r-name",r.name,"text",'maxlength="25"')+field("毎月の金額","r-amount",r.amount,"number",'min="1" max="999999999"')+'</div><div class="modal-grid">'+field("毎月の日付","r-day",r.day,"number",'min="1" max="31"')+selectField("カテゴリー","r-cat",data.categories.map(c=>({value:c,label:c})),r.cat)+'</div><div class="modal-grid">'+selectField("用途","r-scope",[{value:"personal",label:"個人"},{value:"shared",label:"夫婦共通"}],r.scope)+selectField("支払方法","r-method",[{value:"cash",label:"現金"},...data.cards.map(c=>({value:c.id,label:c.name}))],r.method)+'</div>'+
 '<div class="modal-actions"><button class="primary" data-action="save-recurring" data-value="'+safe(r.id)+'">保存</button>'+(r.id?'<button class="secondary" data-action="delete-recurring" data-value="'+safe(r.id)+'">停止</button>':"")+'</div>');
}
function dataModal(){
 openModal("バックアップと移行",'<div class="stack"><button class="primary" data-action="backup-json">JSONバックアップを書き出す</button><button class="secondary" data-action="export-csv">支出・収入をCSV出力</button><div class="field"><label for="restore-file">JSONバックアップを復元</label><input id="restore-file" type="file" accept="application/json,.json"></div><div class="note">復元時は現在の端末データを置き換えます。重要なデータは事前にバックアップしてください。</div><div class="hint">データはこのブラウザ内のみです。別端末と自動同期されません。</div></div>');
}
function aboutModal(){
 openModal("はじめに・安全性",'<div class="note">カケイボくん v0.1 は端末内で動く試作版です。ログイン・夫婦間同期・Gmail連携・銀行API連携・プッシュ通知・領収書OCRは未実装です。</div><div class="note">業務上の領収書、経費明細、会社名・案件情報、未許可の立替記録は入力しないでください。</div><div class="hint">公開Webサーバー上のアプリでも、取引内容は端末内にのみ保存されます。ただし他人に端末やブラウザを使われると閲覧される可能性があります。</div><button class="secondary" data-action="settings-home">設定へ戻る</button>');
}
function download(name,mime,body){
 const blob=new Blob([body],{type:mime});const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function switchTab(name){tab=name;render();}
function value(id){return(document.getElementById(id)||{}).value||"";}
function num(id){return Number(value(id));}
function intRange(n,min,max){return Number.isFinite(n)&&n>=min&&n<=max;}
function ensureInput(amount){if(!intRange(amount,1,999999999)){toast("金額を正しく入力してください");return false;}return true;}
function listenClick(ev){
 const b=ev.target.closest("[data-action]");if(!b)return;
 const action=b.dataset.action,v=b.dataset.value||"";
 switch(action){
 case "go-input":closeModal();switchTab("input");break;
 case "go-cards":closeModal();switchTab("cards");break;
 case "go-household":closeModal();switchTab("household");break;
 case "kind":form.kind=v;form.cat=v==="income"?"給与":"食費";render();break;
 case "scope":form.scope=v;render();break;
 case "paid-by":form.paidBy=v;render();break;
 case "set-category":form.cat=v;render();break;
 case "set-method":form.method=v;render();break;
 case "key":{
   if(v==="C")form.amount="";
   else if(v==="⌫")form.amount=form.amount.slice(0,-1);
   else if(form.amount.length<9)form.amount=(form.amount+v).replace(/^0+(?=\d)/,"");
   const out=document.getElementById("amount-value");if(out)out.textContent=yen(form.amount);
   break;
 }
 case "save-transaction":{
   const amount=Number(form.amount)||0;if(!ensureInput(amount))return;
   if(!form.date||!/^\d{4}-\d\d-\d\d$/.test(form.date)){toast("日付を指定してください");return;}
   data.tx.push({id:uuid(),kind:form.kind,date:form.date,amount,cat:form.cat,scope:form.scope,method:form.method,paidBy:form.paidBy,note:(document.getElementById("entry-note")||{}).value||"",createdAt:new Date().toISOString()});
   form.amount="";save();render();toast("登録しました");break;
 }
 case "no-spend":if(!data.checks.includes(today()))data.checks.push(today());save();render();toast("確認しました");break;
 case "add-card":cardModal("");break;
 case "edit-card":cardModal(v);break;
 case "save-card":{
   const name=value("card-name").trim(),close=num("card-close"),pay=num("card-pay"),lag=num("card-lag");
   if(!name||!intRange(close,1,31)||!intRange(pay,1,31)||![1,2].includes(lag)){toast("カードの設定を確認してください");return;}
   const obj={id:v||uuid(),name,closingDay:close,payDay:pay,payLag:lag,accountId:value("card-account")};
   const ix=data.cards.findIndex(c=>c.id===v);if(ix>=0)data.cards[ix]=obj;else data.cards.push(obj);
   save();closeModal();render();toast("カードを保存しました");break;
 }
 case "delete-card":{
   if(data.tx.some(t=>t.method===v)){toast("利用履歴があるカードは削除できません");return;}
   if(!confirm("カードを削除しますか？"))return;
   data.cards=data.cards.filter(c=>c.id!==v);save();closeModal();render();break;
 }
 case "edit-tx":txModal(v);break;
 case "save-tx":{
   const t=data.tx.find(x=>x.id===v),n=num("tx-amount");if(!t||!ensureInput(n))return;
   const date=value("tx-date");if(!date){toast("日付を入力してください");return;}
   Object.assign(t,{amount:n,date,note:value("tx-note").trim(),cat:value("tx-category"),scope:value("tx-scope"),method:value("tx-method"),paidBy:value("tx-paid")});
   save();closeModal();render();toast("変更しました");break;
 }
 case "delete-tx":{
   if(!confirm("この取引を削除しますか？"))return;
   data.tx=data.tx.filter(x=>x.id!==v);save();closeModal();render();toast("削除しました");break;
 }
 case "cards-prev":cardPage=Math.max(0,cardPage-1);render();break;
 case "cards-next":cardPage++;render();break;
 case "month-prev":month=offsetMonth(month,-1);chosen=month+"-01";page=0;render();break;
 case "month-next":month=offsetMonth(month,1);chosen=month+"-01";page=0;render();break;
 case "calendar-day":chosen=v;page=0;render();break;
 case "history-prev":page=Math.max(0,page-1);render();break;
 case "history-next":page++;render();break;
 case "settings-home":settingsHome();break;
 case "settings-accounts":accountsModal();break;
 case "settings-budget":budgetModal();break;
 case "settings-recurring":recurringModal();break;
 case "settings-data":dataModal();break;
 case "settings-about":aboutModal();break;
 case "add-account":accountModal("");break;
 case "edit-account":accountModal(v);break;
 case "save-account":{
   const name=value("a-name").trim(),balance=num("a-balance"),asOf=value("a-date");
   if(!name||!intRange(balance,-999999999,999999999)||!asOf){toast("口座の設定を確認してください");return;}
   const obj={id:v||uuid(),name,balance,asOf},i=data.accounts.findIndex(a=>a.id===v);
   if(i>=0)data.accounts[i]=obj;else data.accounts.push(obj);
   save();accountsModal();render();toast("口座を保存しました");break;
 }
 case "delete-account":{
   if(data.cards.some(c=>c.accountId===v)){toast("カードの引落口座に設定されています");return;}
   if(!confirm("この口座を削除しますか？"))return;
   data.accounts=data.accounts.filter(a=>a.id!==v);save();accountsModal();render();break;
 }
 case "save-budget":{
   if(!intRange(num("b-month"),0,999999999)||!intRange(num("b-fixed"),0,100)){toast("数値を確認してください");return;}
   data.budget.month=num("b-month");data.prefs.fixedMe=num("b-fixed");save();closeModal();render();toast("設定しました");break;
 }
 case "manage-categories":categoriesModal();break;
 case "add-category":{
   const name=value("new-cat").trim();if(!name||data.categories.includes(name)||data.categories.length>=30){toast("カテゴリー名を確認してください");return;}
   data.categories.push(name);save();categoriesModal();break;
 }
 case "delete-category":{
   if(data.categories.length<=1){toast("カテゴリーは1つ以上必要です");return;}
   data.categories=data.categories.filter(c=>c!==v);save();categoriesModal();break;
 }
 case "add-recurring":recurringEdit("");break;
 case "edit-recurring":recurringEdit(v);break;
 case "save-recurring":{
   const name=value("r-name").trim(),amount=num("r-amount"),day=num("r-day");
   if(!name||!ensureInput(amount)||!intRange(day,1,31)){toast("設定を確認してください");return;}
   const r={id:v||uuid(),name,amount,day,cat:value("r-cat"),scope:value("r-scope"),method:value("r-method"),active:true,paidBy:"me"},i=data.recurring.findIndex(x=>x.id===v);
   if(i>=0)data.recurring[i]=r;else data.recurring.push(r);
   save();recurringNow();recurringModal();render();toast("固定費を保存しました");break;
 }
 case "delete-recurring":{
   if(!confirm("この固定費の今後の自動登録を停止しますか？"))return;
   const r=data.recurring.find(x=>x.id===v);if(r)r.active=false;save();recurringModal();render();break;
 }
 case "backup-json":download("kakeibokun-backup-"+today()+".json","application/json",JSON.stringify(data,null,2));toast("バックアップを出力しました");break;
 case "export-csv":{
   const lines=[["日付","種類","金額","カテゴリー","用途","支払方法","支払者","メモ"],...sortTx(data.tx).map(t=>[t.date,labelKind(t.kind),t.amount,t.cat,labelScope(t.scope),cName(t.method),t.paidBy==="me"?"自分":"相手",t.note||""])];
   const csv="\uFEFF"+lines.map(row=>row.map(x=>'"'+String(x===undefined?"":x).replace(/"/g,'""')+'"').join(",")).join("\r\n");
   download("kakeibokun-"+today()+".csv","text/csv;charset=utf-8",csv);break;
 }
 }
}
async function restore(file){
 if(!file||file.size>8*1024*1024){toast("8MB以下のJSONを選択してください");return;}
 let src;try{src=JSON.parse(await file.text());}catch(e){toast("JSONを読み取れません");return;}
 if(!src||src.version!==1||!Array.isArray(src.tx)||!Array.isArray(src.cards)||!Array.isArray(src.accounts)||!Array.isArray(src.categories)||!Array.isArray(src.recurring)){toast("対応していないバックアップです");return;}
 if(!confirm("現在の端末データをバックアップの内容で置き換えますか？"))return;
 data=Object.assign(defaults(),src);
 save();closeModal();render();toast("復元しました");
}
document.querySelectorAll(".nav-btn").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));
el.addEventListener("click",listenClick);
modalBody.addEventListener("click",listenClick);
document.getElementById("settings-btn").addEventListener("click",settingsHome);
document.getElementById("close-modal").addEventListener("click",closeModal);
overlay.addEventListener("click",e=>{if(e.target===overlay)closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
document.addEventListener("change",e=>{
 if(e.target.id==="entry-date")form.date=e.target.value;
 if(e.target.id==="restore-file")restore(e.target.files&&e.target.files[0]);
});
window.addEventListener("storage",e=>{if(e.key===KEY){try{data=Object.assign(defaults(),JSON.parse(e.newValue||"{}"));render();}catch(err){}}});
recurringNow();render();
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));}
})();