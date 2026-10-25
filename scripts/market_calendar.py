import sys,json,argparse,os
from pathlib import Path
from datetime import datetime,timedelta,timezone
if Path('.calendar-deps').exists():sys.path.insert(0,str(Path('.calendar-deps').resolve()))
import exchange_calendars as xc

def market_plan(now,name):
    end=(now+timedelta(days=45)).date()
    if name=='XSHG':
        from exchange_calendars.exchange_calendar_xshg import XSHGExchangeCalendar
        bound=XSHGExchangeCalendar.bound_max()
        if bound is not None:end=min(end,bound.date())
    c=xc.get_calendar(name,start=(now-timedelta(days=35)).date().isoformat(),end=end.isoformat())
    rows=[]
    for session in c.sessions:
        close=c.session_close(session).to_pydatetime()
        due=close+timedelta(minutes=30)
        rows.append({'session':session.date().isoformat(),'closeAt':close.isoformat(),'dueAt':due.isoformat()})
    past=[r for r in rows if datetime.fromisoformat(r['dueAt'])<=now]
    future=[r for r in rows if datetime.fromisoformat(r['dueAt'])>now]
    if not past or not future:raise RuntimeError('交易日历覆盖不足 '+name)
    return {'expectedSession':past[-1]['session'],'dueAt':past[-1]['dueAt'],'closeAt':past[-1]['closeAt'],'nextDueAt':future[0]['dueAt'],'nextSession':future[0]['session'],'calendar':name,'calendarSource':'exchange_calendars；XSHG / XNYS，实际session_close+30分钟'}

def build(now):return {'generatedAt':now.isoformat(),'cn':market_plan(now,'XSHG'),'us':market_plan(now,'XNYS')}
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--now');ap.add_argument('--output',default='.runtime/plan.json');a=ap.parse_args()
    now=datetime.fromisoformat(a.now.replace('Z','+00:00')) if a.now else datetime.now(timezone.utc)
    result=build(now);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
