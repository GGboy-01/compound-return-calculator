import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
if Path('.calendar-deps').exists():sys.path.insert(0,str(Path('.calendar-deps').resolve()))
from market_calendar import build
from datetime import datetime
checks=[('2026-03-06T22:00:00+00:00','us','2026-03-06','2026-03-06T21:30:00+00:00'),('2026-03-09T21:00:00+00:00','us','2026-03-09','2026-03-09T20:30:00+00:00'),('2026-11-02T22:00:00+00:00','us','2026-11-02','2026-11-02T21:30:00+00:00'),('2026-11-27T19:00:00+00:00','us','2026-11-27','2026-11-27T18:30:00+00:00'),('2026-12-24T19:00:00+00:00','us','2026-12-24','2026-12-24T18:30:00+00:00'),('2026-10-25T04:00:00+00:00','cn','2026-10-23','2026-10-23T07:30:00+00:00'),('2026-10-05T08:00:00+00:00','cn','2026-09-30','2026-09-30T07:30:00+00:00')]
for now,key,date,due in checks:
 r=build(datetime.fromisoformat(now))[key];assert r['expectedSession']==date,(now,r);assert r['dueAt']==due,(now,r)
print('7 calendar tests passed: DST, holidays, early closes and weekends')
