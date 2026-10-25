# 投资决策实验室 V8 · R1

在线入口：https://ggboy-01.github.io/compound-return-calculator/

每日买卖决策看板覆盖A股5个指数（科创综指000680/000681分口径）、纳指100、标普500及89只沪深普通ETF。市场情绪、收益计算工具保留为独立模块。

## 自动更新

- A股交易日北京时间15:30首次运行，15:50和16:10补跑：更新6条指数序列和89只ETF。
- 美股纽约时间16:30首次运行，16:50、17:30补跑；次日00:45复核。纽约时区自动处理夏令时。提前收盘日13:30运行，13:50补跑；交易日历按实际收盘+30分钟计算应到的数据日期。
- 常规美股更新对应北京时间次日04:30（夏令时）、05:30（冬令时）。休市日保留最近交易日数据，不伪造新行情。
- GitHub Actions可能排队或被限流，公开行情源也可能晚到，无法承诺在目标分钟完成网页发布。页面显示各组实际数据日期、核验数量和检查时间；双源未到齐时保留旧值。超过下一应更新时间仍未更新时暂停生成交易计划。
- 页面打开时读取增量数据，保持打开每15分钟检查；回到页面超过5分钟会检查。未完成录入期间暂缓刷新。
- 日历依赖exchange-calendars>=4.13.2,<5；中国年历有已公布范围。未来年历未收录会报错，不用周一到周五推测假期，需关注Actions失败通知和日历依赖更新。

## 数据与账本

科创指数由中证官方与东方财富核对；创业板和ETF由东方财富与腾讯核对。美股采用Yahoo价格指数日收盘，经东方财富或FRED复核。FRED可能晚于收盘30分钟发布，双源未就绪时依靠补跑，不接受未核验值。

历史基线：data/dashboard-seed.json.gz。增量和任务状态：data/dashboard-updates.json。市场情绪：data/market-sentiment.json。

89只ETF为2026-10-24目录快照，新上市产品需重新核对纳入。000680全收益与000681价格口径自动匹配。R1仍为研究规则，历史共享资金仅6个完整周期，未证明长期稳定有效。指数影子持仓信号与ETF实际盈亏分开。

成交保存在用户浏览器中，任务不会自动下单或改写成交。本地file页面与线上https页面的账本分开存储；迁移时在原页面导出JSON，再到在线页面导入。不要将个人账本上传公开仓库。

## 本地运行

环境：Node.js 24、Python 3.12。安装pip install -r requirements.txt后：

```sh
node --test tests/*.test.mjs
python tests/calendar_test.py
python scripts/market_calendar.py
node scripts/update-dashboard.mjs all
node scripts/build-site.mjs
```

GitHub Actions的Update and deploy investment dashboard完成行情更新与Pages发布。支持手动选择all、cn、us。旧市场情绪工作流保留手动入口，避免重复自动任务。
