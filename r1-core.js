(function(root){'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)),weights=[.3,.3,.4],fractions=[.3,.7,1];
const days=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
function prepare(history){let peak=0;const sums={20:0,60:0,200:0};return history.map((r,i)=>{
 peak=Math.max(peak,r.close);const ma={};for(const n of [20,60,200]){sums[n]+=r.close;if(i>=n)sums[n]-=history[i-n].close;ma[n]=i>=n-1?sums[n]/n:null;}
 const returns=i>=60?history.slice(i-59,i+1).map((x,k)=>Math.log(x.close/history[i-60+k].close)):[];
 const avg=returns.reduce((a,b)=>a+b,0)/60,vol=returns.length?Math.sqrt(returns.reduce((s,v)=>s+(v-avg)**2,0)/59):null;
 return {...r,i,peak,ma,R:vol===null?null:clamp(vol*Math.sqrt(20),.06,.15)};
});}
function point(rows,i){if(i<0)return null;const r=rows[i];const conf=n=>i>=2&&[0,1,2].every(k=>rows[i-k].ma[n]!=null&&rows[i-k].close>rows[i-k].ma[n]);
 const prevConf=i>=3&&[1,2,3].every(k=>rows[i-k].ma[20]!=null&&rows[i-k].close>rows[i-k].ma[20]);
 const D=r.R===null?null:clamp(3*r.R,.18,.35),dd=1-r.close/r.peak;
 return {...r,D,dd,confirmed20:conf(20),fresh20:conf(20)&&!prevConf,confirmed60:conf(60),longTrend:i>=219&&r.close>r.ma[200]&&r.ma[200]>rows[i-20].ma[200],slope60:i>=64&&r.ma[60]>rows[i-5].ma[60],entryReady:r.R!==null&&r.ma[200]!=null&&D<=dd&&dd<.6};}
function firstAction(p){return p?.entryReady&&p.fresh20&&p.longTrend?{kind:'buy',step:0,reason:'回撤、首次20日确认与长期趋势同时满足',signalDate:p.date}:{kind:'wait',step:0,reason:'等待首次入场条件',signalDate:p?.date};}
function analyze(history,raw,budget){
 const rows=prepare(history),last=point(rows,rows.length-1),records=[...raw].sort((a,b)=>a.date.localeCompare(b.date)||a.seq-b.seq),byDate=new Map();
 for(const r of records){const date=r.date.slice(0,10);if(!history.some(x=>x.date===date))return{...last,action:{kind:'review',reason:'成交日期缺少对应指数收盘，无法重建R1'},cycle:null,deviations:['成交日数据缺失']};if(!byDate.has(date))byDate.set(date,[]);byDate.get(date).push(r);}
 let cycle=null,pending=null,lastAction=null,closed=false;const deviations=[];
 for(let i=0;i<rows.length;i++){
  const p=point(rows,i),today=byDate.get(p.date)||[];
  for(const t of today){if(t.side==='buy'){
    const expected=pending||lastAction;const step=Number.isInteger(t.band)?t.band:cycle?cycle.used.findIndex(v=>!v):0;
    if(!expected||expected.kind!=='buy'||step!==expected.step||step<0||step>2)deviations.push('买入未匹配前一日R1条件 / '+p.date);
    if(!cycle){const lock=point(rows,i-1);if(!lock?.R)return{...last,action:{kind:'review',reason:'首笔买入前历史不足60日，无法锁定R'},cycle:null,deviations:['历史不足']};cycle={R:lock.R,D:lock.D,H:lock.peak,signalDate:lock.date,first:p.date,firstPrice:p.close,budget,used:[false,false,false],spent:[0,0,0],qty:0,cost:0,bought:0,sold:0,actualQty:0,code:t.code,peak:p.close,exitStarted:false,frozenCost:null,exitStage:-1,stageSignal:null};}
    if(cycle.code!==t.code)deviations.push('同一周期含多只ETF，请分别核对');
    if(cycle.exitStarted)deviations.push('退出阶段发生新增买入');
    if(step>=0&&cycle.used[step])deviations.push('同一批次重复买入');
    const amount=t.price*t.qty;if(step>=0&&step<3){cycle.used[step]=true;cycle.spent[step]+=amount;if(cycle.spent[step]>budget*weights[step]+.01)deviations.push('实际投入超过对应批次金额');}
    cycle.qty+=amount/p.close;cycle.cost+=amount;cycle.actualQty+=t.qty;cycle.bought+=t.qty;pending=null;closed=false;
   }else if(cycle){const portion=t.qty/cycle.actualQty;if(portion>1+1e-9||portion<=0){deviations.push('份额无法重建');continue;}cycle.qty*=1-portion;cycle.cost*=1-portion;cycle.actualQty-=t.qty;cycle.sold+=t.qty;cycle.exitStarted=true;pending=null;if(cycle.actualQty<=0){closed=true;cycle.closedDate=p.date;}}
  }
  if(!cycle){lastAction=firstAction(p);continue;}
  if(closed){lastAction={kind:'closed',reason:'本周期已清仓',signalDate:p.date};continue;}
  cycle.peak=Math.max(cycle.peak,p.close);
  const avg=cycle.frozenCost??cycle.cost/cycle.qty,profit=p.close/avg-1;
  const loss=p.close/(cycle.cost/cycle.qty)-1<=-2*cycle.R,timed=days(p.date,cycle.first)>=160,protect=cycle.exitStarted&&p.close/cycle.peak-1<=-cycle.R;
  const stage=[cycle.R,2*cycle.R,3*cycle.R].findLastIndex(v=>profit>=v);
  if(loss||timed||protect){pending={kind:'sell',all:true,fraction:1,reason:loss?'2R成本退出':timed?'持有满160天，时间退出':'盈利后R回撤保护',signalDate:pending?.kind==='sell'&&pending.all?pending.signalDate:p.date};}
  else if(stage>=0){
   cycle.frozenCost??=cycle.cost/cycle.qty;cycle.exitStarted=true;
   const goal=stage===2?cycle.bought:Math.floor(cycle.bought*fractions[stage]/100)*100;
   if(goal>cycle.sold&&(!pending||pending.kind!=='sell'||(!pending.all&&stage>(pending.stage??-1))))pending={kind:'sell',stage,fraction:fractions[stage],all:stage===2,reason:'第'+(stage+1)+'档止盈',signalDate:p.date};
  }
  if(pending?.kind==='sell'){lastAction=pending;continue;}
  if(cycle.exitStarted){lastAction={kind:'wait',reason:'退出阶段：等待下一止盈或保护条件',signalDate:p.date};continue;}
  let step=-1;if(!cycle.used[1]&&p.close>=cycle.firstPrice*(1+cycle.R/2)&&p.confirmed60)step=1;
  else if(cycle.used[1]&&!cycle.used[2]&&p.close>=cycle.firstPrice*(1+cycle.R)&&p.confirmed60&&p.slope60)step=2;
  lastAction=step>=0?{kind:'buy',step,reason:'反弹继续确认，第'+(step+1)+'笔入场',signalDate:p.date}:{kind:'wait',reason:'持有，等待加仓或退出条件',signalDate:p.date};
 }
 const action=pending||lastAction||firstAction(last);
 return {...last,cycle,action,deviations:[...new Set(deviations)],overdue:action.kind==='sell'&&action.signalDate<last.date};
}
function plan({analysis,cash,price,quoteDate,asOf,otherPosition,cooldown,eligible,budget}){const a=analysis,cycle=a.cycle;let blocked=[];
 if(a.deviations.length)blocked.push('持仓记录偏离R1，请先复核');
 if(!eligible)blocked.push('ETF跟踪关系尚未核验');
 if(quoteDate!==asOf)blocked.push('ETF报价与指数日期不一致');
 if(a.action.kind==='buy'&&otherPosition)blocked.push('其他指数已有持仓，本轮不新增');
 if(a.action.kind==='buy'&&cooldown>0)blocked.push('冷静期还剩'+cooldown+'个交易日');
 const target=a.action.kind==='buy'?(cycle?.budget??Math.min(budget,cash))*weights[a.action.step]:0;
 let qty=0;if(!blocked.length&&price>0){if(a.action.kind==='buy')qty=Math.floor(Math.min(cash,target)/price/100)*100;
 if(a.action.kind==='sell'&&cycle){const goal=a.action.all?cycle.bought:Math.floor(cycle.bought*a.action.fraction/100)*100;qty=Math.max(0,Math.min(cycle.actualQty,goal-cycle.sold));}}
 return {blocked,target,qty,amount:qty*price,kind:a.action.kind,step:a.action.step};}
const api={prepare,point,analyze,plan,weights,fractions};root.R1Core=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
