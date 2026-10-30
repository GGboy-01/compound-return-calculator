import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {fetchChecked} from './update-dashboard.mjs';
const require=createRequire(import.meta.url),P=require('../price-core.js');export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function get(url,text=false){let err;for(let i=0;i<2;i++){try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':new URL(url).origin+'/'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);return text?await r.text():await r.json();}catch(e){err=e;}}throw Error(new URL(url).host+': '+err.message);}
export async function collectCN(code,target){
 const meta=P.META[code];
 const urlFor=start=>code==='399006'?`https://hq.cnindex.com.cn/market/market/getIndexDailyDataWithDataFormat?indexCode=${code}&startDate=${start}&endDate=${target}&frequency=day`:`https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${start.replaceAll('-','')}&endDate=${target.replaceAll('-','')}`;
 const parse=j=>(code==='399006'?(j.data?.data||[]).map(r=>({date:r[0],close:Number(r[5])})):(j.data||[]).map(r=>({date:String(r.tradeDate).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'),close:Number(r.close)}))).filter(r=>r.date>=meta.base&&r.date<=target).sort((a,b)=>a.date.localeCompare(b.date));
 const source=urlFor(meta.base);let history=parse(await get(source));P.validate(history,target);
 let tailSource=null,tailError=null;
 if(history.at(-1).date<target){
  tailSource=urlFor(new Date(Date.parse(target)-4*86400000).toISOString().slice(0,10));
  try{const tail=parse(await get(tailSource));P.validate(tail,target);history=[...new Map([...history,...tail].map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));}catch(e){tailError=e.message;}
 }
 P.validate(history,target);return{history,source,tailSource,tailError,latestDate:history.at(-1).date,fetchedAt:new Date().toISOString()};
}

export async function verifiedAltCN(code,start,target){
 const secid=(code==='399006'?'0.':'1.')+code,symbol=(code==='399006'?'sz':'sh')+code;
 const emUrl=`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${start.replaceAll('-','')}&end=${target.replaceAll('-','')}&lmt=30&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`;
 const txUrl=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${start},${target},30,`;
 const [em,tx]=await Promise.all([get(emUrl),get(txUrl)]);
 if(!Array.isArray(em.data?.klines)||!Array.isArray(tx.data?.[symbol]?.day))throw Error('备用双源缺少日线');
 const e=em.data.klines.map(x=>{const a=x.split(',');return{date:a[0],close:Number(a[2])}}).filter(x=>x.date>=start&&x.date<=target);
 const t=new Map(tx.data[symbol].day.map(x=>[x[0],Number(x[2])])),rows=e.filter(x=>t.has(x.date));
 if(rows.at(-1)?.date!==target)throw Error('备用双源未同时返回应到交易日');
 if(rows.some(x=>!Number.isFinite(x.close)||x.close<=0||Math.abs(x.close-t.get(x.date))>.03))throw Error('备用双源收盘不一致');
 P.validate(rows,target);return{rows,source:emUrl,verificationSource:txUrl};
}
export async function verifiedAltSPX(target){
 const start=new Date(Date.parse(target)-8*86400000).toISOString().slice(0,10),emUrl=`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=100.SPX&klt=101&fqt=0&beg=${start.replaceAll('-','')}&end=${target.replaceAll('-','')}&lmt=20&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`,txUrl=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=usINX,day,${start},${target},20,`;
 const [em,tx]=await Promise.all([get(emUrl),get(txUrl)]),last=em.data?.klines?.at(-1)?.split(','),quote=tx.data?.usINX?.qt?.usINX;
 if(last?.[0]!==target||quote?.[2]!=='.INX'||!String(quote[30]).startsWith(target)||!String(quote[30]).includes('16:')||!(+last[2]>0)||Math.abs(+last[2]-(+quote[3]))>.08)throw Error('标普备用双源收盘日期或价格不一致');
 return{row:{date:target,close:Number(last[2])},source:emUrl,verificationSource:txUrl};
}
export async function update(market='all'){const file=path.join(ROOT,'data/price-map.json'),j=JSON.parse(await fs.readFile(file)),plan=JSON.parse(await fs.readFile(path.join(ROOT,'.runtime/plan.json'))),now=new Date().toISOString();j.markets||={};let failed=false;
for(const group of ['cn','us']){if(market!=='all'&&market!==group)continue;const target=plan[group].expectedSession,errors=[];await Promise.all(Object.keys(P.META).filter(c=>(P.META[c].market==='us')===(group==='us')).map(async code=>{const old=j.series[code];try{if(old.latestDate===target){j.series[code]={...old,error:null,lastAttemptAt:now};return;}let s;if(group==='cn'){s=await collectCN(code,target);s.history=[...new Map([...old.history,...s.history].map(x=>[x.date,x])).values()].sort((x,y)=>x.date.localeCompare(y.date));s.latestDate=s.history.at(-1).date;if(s.latestDate<target){try{const a=await verifiedAltCN(code,new Date(Date.parse(s.latestDate)-8*86400000).toISOString().slice(0,10),target);s={...s,history:[...new Map([...s.history,...a.rows.filter(x=>x.date>s.latestDate)].map(x=>[x.date,x])).values()].sort((x,y)=>x.date.localeCompare(y.date)),latestDate:target,latestSource:a.source,verificationSource:a.verificationSource,fetchedAt:now};}catch(e){s.fallbackError=e.message;}}}else{const start=new Date(Date.parse(old.history.at(-1).date)-10*86400000).toISOString().slice(0,10);try{s=await fetchChecked({code,market:'us',secid:'100.'+code},start,target);}catch(e){if(code!=='SPX')throw e;const a=await verifiedAltSPX(target);s={history:[...new Map([...old.history,a.row].map(x=>[x.date,x])).values()],latestDate:target,source:old.source,latestSource:a.source,verificationSource:a.verificationSource,historyAudit:old.historyAudit,fetchedAt:now,via:'verified-alternative'};}if(s.via!=='verified-alternative'){const fredUrl=`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${code==='NDX'?'NASDAQ100':'SP500'}&cosd=${start}&coed=${target}`,csv=await get(fredUrl,true),frows=csv.trim().split(/\r?\n/).slice(1).map(l=>{const [date,c]=l.split(',');return{date,close:Number(c)}}).filter(x=>x.close>0&&x.date>=start&&x.date<=target);P.validate(frows,target);if(frows.at(-1).date!==target||Math.abs(frows.at(-1).close-s.history.at(-1).close)>.08)throw Error('FRED最新收盘与核验源不一致');s={...s,history:frows,verificationSource:s.source,source:fredUrl,historyAudit:old.historyAudit};const merged=[...new Map([...old.history,...s.history].map(x=>[x.date,x])).values()].sort((a,b)=>a.date.localeCompare(b.date));s={...s,history:merged,latestDate:target,fetchedAt:now};}}P.validate(s.history,target);if(s.history.length<old.history.length||s.latestDate<old.latestDate)throw Error('拒绝较短或倒退的历史');j.series[code]={...s,error:null,lastAttemptAt:now};if(s.latestDate<target){const message='官方收盘未到齐：实际'+s.latestDate+'，应到'+target;j.series[code].error=message;errors.push({code,message});}}catch(e){j.series[code]={...old,error:e.message,lastAttemptAt:now};errors.push({code,message:e.message});}}));j.markets[group]={...plan[group],checkedAt:now,status:errors.length?'partial':'ok',errors};failed||=errors.length>0;}
j.checkedAt=now;j.cutoff=Object.values(plan).filter(x=>x?.expectedSession).map(x=>x.expectedSession).sort().at(-1);j.status=Object.values(j.markets).some(x=>x.status!=='ok')?'partial':'ok';j.errors=Object.values(j.markets).flatMap(x=>x.errors||[]);await fs.writeFile(file,JSON.stringify(j));console.log(JSON.stringify({markets:j.markets,closes:Object.entries(j.series).map(([c,s])=>[c,s.latestDate,s.history.at(-1).close])}));return failed?1:0;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await update(process.argv[2]||'all');
