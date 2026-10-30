import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {selectCandidates,extractRows,parseFee} from '../scripts/update-etf-rankings.mjs';
const require=createRequire(import.meta.url),P=require('../price-core.js'),snapshot=JSON.parse(fs.readFileSync(new URL('../data/price-map.json',import.meta.url)));
test('七指数独立标识、实际日期、连续有效收盘；科创综指为000680',()=>{assert.equal(Object.keys(snapshot.series).length,7);for(const [c,s]of Object.entries(snapshot.series)){assert(P.META[c]);P.validate(s.history,snapshot.cutoff);assert.equal(s.latestDate,s.history.at(-1).date);}assert.equal(P.META['000680'].scope,'含分红');assert(!snapshot.series['000681']);});
test('A股保留绝对历史参照，美股只平移回撤，不用老低点',()=>{const cn=P.model('399006',snapshot.series['399006'].history);assert.equal(cn.historicalLow.close,1205.0314);assert.equal(cn.lo.close,593.6608);const us=P.model('NDX',snapshot.series.NDX.history);assert(!us.references.some(x=>x.kind.includes('low')));for(const r of us.references.filter(x=>x.kind==='scenario'))assert.equal(r.close,us.hi.close*(1-r.depth));});
test('2020年纳指使用最高与最低收盘，禁止盘中价混入',()=>{const r=P.usResearch(snapshot.series),v=r.pairs[1];assert.equal(v.NDX.from.close,9718.73);assert.equal(v.NDX.to.date,'2020-03-20');assert.equal(v.NDX.to.close,6994.29);assert.equal(v.SPX.to.close,2237.4);assert(Math.abs(v.NDX.depth-.2803288)<1e-7);});
test('恐慌入口纳指30%，标普按同历史窗口跌幅比中位数换算',()=>{const r=P.usResearch(snapshot.series);assert.deepEqual(r.bands.NDX,[.1,.2,.3]);assert.deepEqual(r.bands.SPX,[.08,.17,.25]);assert(r.pairs.some(x=>x.ratio>1));});
test('最大回撤遵守先高后低，不把低点前的上涨倒算成下跌',()=>{const r=P.maxDrawdown([{date:'1',close:50},{date:'2',close:100},{date:'3',close:70},{date:'4',close:140}]);assert.equal(r.from.date,'2');assert.equal(r.to.date,'3');assert(Math.abs(r.depth-.3)<1e-10);});
test('ETF优选剔除过期和无效数据；接近溢价才比较年费率',()=>{const rows=[{code:'a',date:'2026-10-28',valid:true,premium:.01,fee:.01,turnover:1},{code:'b',date:'2026-10-28',valid:true,premium:.0105,fee:.005,turnover:1},{code:'c',date:'2026-10-28',valid:true,premium:.02,fee:.001,turnover:1},{code:'stale',date:'2026-10-27',valid:true,premium:-.5,fee:0},{code:'invalid',date:'2026-10-28',valid:false,premium:-.5,fee:0}];assert.deepEqual(selectCandidates(rows,'2026-10-28').map(x=>x.code),['b','a','c']);assert.equal(selectCandidates([], '2026-10-28').length,0);});
test('只解析JSON数据，不执行外部页面脚本；费率缺失不默认为0',()=>{const x={rows:[{fund:{code:'159513',kind:'etf'},quote:{price_basis:'close'}}]},chunk='41:'+JSON.stringify(x)+'\n',html='<script>self.__next_f.push('+JSON.stringify([1,chunk])+')</script>';assert.equal(extractRows(html)[0].fund.code,'159513');assert.equal(parseFee('<th>管理费率</th><td>0.80%（每年）</td>','管理费率'),.008);assert.throws(()=>parseFee('没有费率','托管费率'));});
test('分批成本按金额/份额计算；未篡改原A股排名',()=>{const r=P.plan(1000,[.3,.4,.5],[8,10,12],300000);assert(Math.abs(r.cost-575.8683729433273)<1e-9);const t=JSON.parse(fs.readFileSync(new URL('../data/etf-tracking.json',import.meta.url)));assert.deepEqual(t.rankings.find(x=>x.code==='000688').top3.map(x=>x.code),['588080','588000','588050']);assert.equal(t.end,'2026-10-28');});

import {collectCN} from '../scripts/update-price-map.mjs';
test('官方新数据晚到时仍保存已核验的中间交易日，保持真实日期',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{tradeDate:'20261028',close:100},{tradeDate:'20261029',close:99}]})});
 const result=await collectCN('000688','2026-10-30');assert.equal(result.latestDate,'2026-10-29');assert.equal(result.history.at(-1).close,99);
 }finally{globalThis.fetch=original;}
});

test('完整历史缓存落后时以官方短窗口补齐最新收盘',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>({ok:true,json:async()=>({data:++calls===1?[{tradeDate:'20261029',close:99}]:[{tradeDate:'20261029',close:99},{tradeDate:'20261030',close:98}]})});
 const result=await collectCN('000688','2026-10-30');assert.equal(result.latestDate,'2026-10-30');assert.equal(result.history.length,2);assert.equal(result.history.at(-1).close,98);assert.match(result.tailSource,/20261026/);
 }finally{globalThis.fetch=original;}
});

import {retainVerified} from '../scripts/update-etf-rankings.mjs';
test('同日已核验ETF不被瞬时网络错误擦除，跨日不能混用',()=>{
 const row={code:'159513',index:'NDX',date:'2026-10-30',valid:false,error:'timeout'},old={checkedAt:'before',groups:{NDX:{rows:[{...row,valid:true,error:null,quoteTime:'20261030150000'}]}}};
 assert.equal(retainVerified(row,old,'2026-10-30','now').valid,true);assert.equal(retainVerified(row,old,'2026-10-30','now').lastVerifiedAt,'before');assert.equal(retainVerified(row,old,'2026-11-02','now').valid,false);
});
