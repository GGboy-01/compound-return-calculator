import fs from 'node:fs/promises';
import vm from 'node:vm';
import zlib from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const merge=(old,add)=>[...new Map([...old,...add].map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));
export function valid(rows,target){if(!Array.isArray(rows)||!rows.length)throw Error('无收盘数据');let prev='';for(const r of rows){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<=prev||!Number.isFinite(r.close)||r.close<=0||r.date>target)throw Error('日期或收盘价非法');prev=r.date}if(rows.at(-1).date!==target)throw Error('收盘数据未到齐：实际'+rows.at(-1).date+'，应为'+target);return rows;}
export function verify(a,b,tolerance){if(a.at(-1).date!==b.at(-1).date||Math.abs(a.at(-1).close-b.at(-1).close)>tolerance)throw Error('两个行情源的最新收盘不一致：'+JSON.stringify([a.at(-1),b.at(-1)]));return a;}
async function get(url,json=true){let err;for(let i=0;i<3;i++){try{const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 InvestmentDashboard/8.1','Referer':new URL(url).origin+'/'},signal:AbortSignal.timeout(18000)});if(!res.ok)throw Error('HTTP '+res.status);return json?await res.json():await res.text()}catch(e){err=e;if(i<2)await new Promise(r=>setTimeout(r,1000*(i+1)))}}throw err;}
const compact=d=>d.replaceAll('-','');
async function em(secid,start,end){const url=`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=0&beg=${compact(start)}&end=${compact(end)}&lmt=10000&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`;const j=await get(url);return{rows:(j.data?.klines||[]).map(s=>{const a=s.split(',');return{date:a[0],close:Number(a[2])}}).filter(r=>r.date<=end),source:url};}
async function tx(symbol,start,end){const url=`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,${start},${end},300,`;const j=await get(url);return{rows:(j.data?.[symbol]?.day||[]).map(x=>({date:x[0],close:Number(x[2])})).filter(r=>r.date>=start&&r.date<=end),source:url};}
async function csi(code,start,end){const url=`https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${compact(start)}&endDate=${compact(end)}`;const j=await get(url);return{rows:(j.data||[]).map(x=>({date:x.tradeDate.slice(0,4)+'-'+x.tradeDate.slice(4,6)+'-'+x.tradeDate.slice(6,8),close:Number(x.close)})).filter(x=>x.date>=start&&x.date<=end).sort((a,b)=>a.date.localeCompare(b.date)),source:url};}
async function yahoo(symbol,start,end){const p1=Math.floor(Date.parse(start)/1000),p2=Math.floor(Date.parse(end)/1000)+86400,url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`;const j=await get(url),r=j.chart?.result?.[0];if(!r)throw Error('Yahoo未返回指数');return{rows:(r.timestamp||[]).map((t,i)=>({date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t*1000)),close:Number(r.indicators.quote[0].close[i])})).filter(r=>r.close>0&&r.date>=start&&r.date<=end),source:url};}
async function fred(code,start,end){const id=code==='NDX'?'NASDAQ100':'SP500',url=`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}&coed=${end}`;const s=await get(url,false);return{rows:s.trim().split(/\r?\n/).slice(1).map(l=>{const [date,close]=l.split(',');return{date,close:Number(close)}}).filter(x=>x.close>0&&x.date>=start&&x.date<=end),source:url};}
export async function fetchChecked(item,start,target){
 if(item.market==='us'){
  const primary=await yahoo(item.code==='NDX'?'^NDX':'^GSPC',start,target);primary.rows=primary.rows.map(r=>({...r,close:Math.round(r.close*100)/100}));valid(primary.rows,target);
  const second=await fred(item.code,start,target);valid(second.rows,target);verify(primary.rows,second.rows,.08);
  return{history:primary.rows,source:primary.source,verificationSource:second.source,date:target,price:primary.rows.at(-1).close,verifiedAt:new Date().toISOString()};
 }

 const primary=await em(item.secid,start,target);valid(primary.rows,target);
 let second;
 if(item.type==='fund'||item.code==='399006')second=await tx(item.type==='fund'?(item.code.startsWith('5')?'sh':'sz')+item.code:'sz399006',start,target);
 else if(item.market==='cn')second=await csi(item.code,start,target);
 else{try{second=await yahoo(item.code==='NDX'?'^NDX':'^GSPC',start,target);valid(second.rows,target)}catch{second=await fred(item.code,start,target)}}
 valid(second.rows,target);try{verify(primary.rows,second.rows,item.type==='fund'?.00051:.08)}catch(e){if(item.market!=='us')throw e;second=await fred(item.code,start,target);valid(second.rows,target);verify(primary.rows,second.rows,.08);}
 return{history:primary.rows,source:primary.source,verificationSource:second.source,date:target,price:primary.rows.at(-1).close,verifiedAt:new Date().toISOString()};
}
async function pool(list,fn){let i=0;await Promise.all(Array.from({length:6},async()=>{while(i<list.length)await fn(list[i++])}));}
export async function run(market='all'){
 const seed=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root,'data/dashboard-seed.json.gz')))),plan=JSON.parse(await fs.readFile(path.join(root,'.runtime/plan.json'),'utf8'));
 let output;try{output=JSON.parse(await fs.readFile(path.join(root,'data/dashboard-updates.json'),'utf8'))}catch{output={schemaVersion:1,indices:{},funds:{},markets:{}}}
 let failed=false;output.generatedAt=new Date().toISOString();
 for(const key of ['cn','us']){if(market!=='all'&&market!==key)continue;const p=plan[key],target=p.expectedSession,errors=[],items=[];
 for(const d of [...seed.MARKET.indices,seed.MARKET.priceVariant]){if(!d)continue;const us=['ndx','spx'].includes(d.id);if((key==='us')!==us)continue;items.push({type:'index',code:d.code,market:key,secid:(us?'100.':d.code==='399006'?'0.':'1.')+d.code,baseline:d.history});}
 if(key==='cn')for(const d of seed.MARKET.indices)for(const f of d.funds)items.push({type:'fund',code:f.code,market:key,secid:(f.code.startsWith('5')?'1.':'0.')+f.code,baseline:f.history});
 await pool(items,async item=>{const bank=item.type==='fund'?output.funds:output.indices,prev=bank[item.code],baseline=item.baseline.at(-1).date,tail=prev?.history?.at(-1)?.date||baseline,start=new Date(Date.parse(tail)-7*86400000).toISOString().slice(0,10);try{if(prev?.date===target)return;const update=await fetchChecked(item,start,target);bank[item.code]={...update,history:merge(prev?.history||[],update.history),code:item.code};console.log('OK',item.code,target)}catch(e){errors.push({code:item.code,error:e.message});console.warn('STALE',item.code,e.message)}});
 const fresh=items.filter(x=>(x.type==='fund'?output.funds:output.indices)[x.code]?.date===target).length;
 output.markets[key]={...p,checkedAt:output.generatedAt,status:errors.length?'partial':'ok',fresh,total:items.length,errors};if(errors.length)failed=true;
 }
 await fs.writeFile(path.join(root,'data/dashboard-updates.json'),JSON.stringify(output)+'\n');console.log(JSON.stringify(output.markets,null,2));return failed?1:0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.exitCode=await run(process.argv[2]||'all')}catch(e){console.error(e);process.exitCode=1;}}
