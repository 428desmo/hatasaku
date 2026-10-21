import json,statistics,random,gzip,pathlib
root=pathlib.Path(__file__).parent
raw=root/'results.json'
x=json.loads(raw.read_text()) if raw.exists() else json.loads(gzip.decompress((root/'results.json.gz').read_bytes()))
rs=x['results']
def average(xs):return sum(xs)/len(xs)
def summarize(profile='balanced',players=None):
 rr=[r for r in rs if r['profile']==profile and (players is None or r['players']==players)]
 base={r['caseId']:r for r in rr if r['variant']=='base'}
 result=[]
 for cfg in x['rules']:
  sample=[r for r in rr if r['variant']==cfg['id']]
  if not sample:continue
  deltas=[average(r['scores'])-average(base[r['caseId']]['scores']) for r in sample]
  clusters={}
  for r,d in zip(sample,deltas):clusters.setdefault(r['index'],[]).append(d)
  means=[average(v) for v in clusters.values()];rng=random.Random(99);boots=sorted(average(rng.choices(means,k=len(means))) for _ in range(2000))
  immediate=0
  for r in sample:
   tr=[a.split(':') for a in r['actionTrace']]
   for a,b in zip(tr,tr[1:]):
    if a[2]=='refresh' and a[:2]==b[:2] and b[2] in ['plant','replace']:immediate+=1
  totalrefresh=sum(r['refreshes'] for r in sample)
  result.append(dict(id=cfg['id'],label=cfg['label'],games=len(sample),meanScore=average([average(r['scores']) for r in sample]),delta=average(deltas),interval=[boots[49],boots[1949]],positive=sum(d>0 for d in deltas),negative=sum(d<0 for d in deltas),clears=average([r['clears']/r['players'] for r in sample]),refreshes=average([r['refreshes']/r['players'] for r in sample]),fees=average([r['fees']/r['players'] for r in sample]),passRate=sum(r['passes'] for r in sample)/sum(r['players']*18 for r in sample),meanSpread=average([max(r['scores'])-min(r['scores']) for r in sample]),abortedLosses=sum(r['plantLosses'] for r in sample),immediatePlantFraction=immediate/totalrefresh if totalrefresh else None,ownerPicks=sum(r['ownerPicks'] for r in sample)/totalrefresh if totalrefresh else None,otherPicks=sum(r['otherPicks'] for r in sample)/totalrefresh if totalrefresh else None,roundClear=[sum(r['byRound'][i]['clear'] for r in sample) for i in range(18)],roundRefresh=[sum(r['byRound'][i]['refresh'] for r in sample) for i in range(18)]))
 return result
# Same exogenous weather in every paired main experiment; all players get at most one refresh per turn.
base={r['caseId']:r for r in rs if r['profile']=='balanced' and r['variant']=='base'}
for r in rs:
 if r['profile']=='balanced':assert r['eventTrace']==base[r['caseId']]['eventTrace']
 assert all(a['refresh']<=r['players'] for a in r['byRound'])
 assert all(n>=0 for n in r['scores'])
summary=dict(date=x['date'],games=len(rs),mainGames=14*192,scenarios=192,cropSets=32,main=summarize(),byPlayers={str(n):summarize(players=n) for n in [3,4,5]},sensitivity={p:summarize(p) for p in ['fast','safe','patient']},method=x['method'])
(root/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
compressed=gzip.compress(json.dumps(x,separators=(',',':')).encode(),compresslevel=9,mtime=0)
assert json.loads(gzip.decompress(compressed))==x
(root/'results.json.gz').write_bytes(compressed)
if raw.exists():raw.unlink()
for r in summary['main']:print(r['id'],'delta',round(r['delta'],2),'CI',*[round(v,2) for v in r['interval']],'clear',round(r['clears'],2),'refresh',round(r['refreshes'],2),'pass',round(r['passRate']*100,1),'spread',round(r['meanSpread'],1),'immediate',round(r['immediatePlantFraction'] or 0,2))
print('sensitivity', {p:{r['id']:round(r['delta'],2) for r in rows} for p,rows in summary['sensitivity'].items()})
