(function(root){
'use strict';
const names=['普通','深度','恐慌'];
const defaults=id=>({entry:id==='ndx'?[10,20,30]:id==='spx'?[5,10,25]:[30,40,50],allocation:[30,40,30],profit:id==='ndx'?[8,15,25]:id==='spx'?[6,10,15]:[15,25,40],trail:id==='spx'?6:8,confirm:2});
function band(dd,cfg){for(let i=2;i>=0;i--)if(dd+1e-9>=cfg.entry[i])return i;return -1}
function validateConfig(c){for(const k of ['entry','profit'])if(!Array.isArray(c[k])||c[k].length!==3||c[k].some((v,i)=>!Number.isFinite(v)||v<=0||v>=100||(i&&v<=c[k][i-1])))throw Error('三档阈值须递增，且大于0、小于100');if(c.allocation.length!==3||c.allocation.some(v=>!Number.isFinite(v)||v<=0)||Math.abs(c.allocation.reduce((a,b)=>a+b,0)-100)>.001)throw Error('三档资金比例合计须为100%');if(!Number.isFinite(c.trail)||c.trail<=0||c.trail>=100||![1,2,3].includes(c.confirm))throw Error('请核对保护回撤与确认天数');return c}
function replay(budget,rows){if(!Number.isFinite(budget)||budget<=0)throw Error('总预算必须大于0');let cash=budget,realized=0;const holdings={},results={},ids=new Set();for(const r of [...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq)){
if(!r.id||ids.has(r.id)||!Number.isFinite(r.seq)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date+'Z'))||new Date(r.date+'Z').toISOString().slice(0,16)!==r.date)throw Error('成交编号或时间不合法');ids.add(r.id);
if(!Number.isFinite(r.price)||r.price<=0||!Number.isSafeInteger(r.qty)||r.qty<=0||!['buy','sell'].includes(r.side))throw Error('请输入有效成交价、正整数份额及方向');
const h=holdings[r.code]||{qty:0,cost:0,realized:0},amount=r.price*r.qty;let pnl=null;
if(!Number.isFinite(amount))throw Error('成交金额超出范围');
if(r.side==='buy'){if(amount>cash+.000001)throw Error(r.date+' 买入金额超过当时可用现金');cash-=amount;h.qty+=r.qty;h.cost+=amount;}else{if(r.qty>h.qty)throw Error(r.date+' 卖出份额超过当时持仓');const cost=h.cost/h.qty*r.qty;pnl=amount-cost;cash+=amount;realized+=pnl;h.realized+=pnl;h.cost-=cost;h.qty-=r.qty;if(!h.qty)h.cost=0;}
holdings[r.code]=h;results[r.id]={amount,pnl,cash};}return{cash,realized,holdings,results}}
function confirmation(history,days){if(history.length<20+days-1)return false;return Array.from({length:days},(_,k)=>{const j=history.length-1-k;return history[j].close>history.slice(j-19,j+1).reduce((s,r)=>s+r.close,0)/20}).every(Boolean)}
function buyPlan({budget,cash,price,dd,cfg,rows,index,cycle,allowed}){const i=band(dd,cfg),spent=i<0?0:rows.filter(r=>r.index===index&&r.cycle===cycle&&r.side==='buy'&&r.band===i).reduce((s,r)=>s+r.price*r.qty,0),target=i<0?0:budget*cfg.allocation[i]/100,remaining=Math.max(0,target-spent),cap=Math.max(0,Math.min(cash,remaining)),qty=allowed?Math.floor((cap+1e-8)/price/100)*100:0;return{i,spent,target,remaining,qty,amount:qty*price}}
function exitPlan({h,rows,code,cycle,cfg,price,peak}){if(!h?.qty)return{qty:0,stage:-1};const own=rows.filter(r=>r.code===code&&r.cycle===cycle),bought=own.filter(r=>r.side==='buy').reduce((s,r)=>s+r.qty,0),sold=own.filter(r=>r.side==='sell').reduce((s,r)=>s+r.qty,0),cost=h.cost/h.qty,cumulative=[.3,.7,1],goals=cumulative.map((p,i)=>i===2?bought:Math.floor(bought*p/100)*100),stage=cfg.profit.findLastIndex(v=>price+1e-10>=cost*(1+v/100)),targetQty=stage<0?0:Math.min(h.qty,Math.max(0,goals[stage]-sold)),protect=peak>=cost*(1+cfg.profit[0]/100)?peak*(1-cfg.trail/100):null,protectedExit=protect&&price<=protect;
const next=goals.findIndex(g=>g>sold);return{qty:protectedExit?h.qty:targetQty,stage,cost,protect,protectedExit,goals,sold,bought,next,targets:cfg.profit.map(p=>cost*(1+p/100)),nextQty:next<0?0:Math.min(h.qty,Math.max(0,goals[next]-sold))}}
const api={names,defaults,validateConfig,band,replay,confirmation,buyPlan,exitPlan};if(typeof module!=='undefined')module.exports=api;root.V6Core=api;
})(typeof window!=='undefined'?window:globalThis);
