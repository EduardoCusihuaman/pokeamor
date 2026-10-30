import json,urllib.request,urllib.parse,concurrent.futures,re
from pathlib import Path
p=Path(__file__).parent
c=json.load(open(p/'catalog.json'));by={}
def norm(s):return re.sub('[^a-z0-9]','',re.sub(r' (ex|EX|GX|V|VMAX|VSTAR|BREAK|LV.X)$','',s).lower().replace('♀','f').replace('♂','m'))
def get(r):
 try:
  a=json.load(urllib.request.urlopen('https://api.tcgdex.net/v2/en/cards?rarity='+urllib.parse.quote(r),timeout=20));print(r,len(a));return r,a
 except:return r,[]
rs=['Special illustration rare','Illustration rare','Rare Holo VMAX','Secret Rare']
for r,a in concurrent.futures.ThreadPoolExecutor(4).map(get,rs[:2]):
 for x in a:
  if x.get('image') and norm(x['name']) not in by:by[norm(x['name'])]=(x,r)
changes=[]
for x in c:
 if x['rarity'] in rs[:2]:continue
 alt=by.get(norm(x['name'])) or by.get(norm(x['slug'].replace('-',' ')))
 if alt:
  a,r=alt;x.update(image=a['image']+'/high.webp',card=a['id'],rarity=r,holo=True,special=True,artist='');changes.append(x['id'])
json.dump(c,open(p/'catalog.json','w'),ensure_ascii=False);print('Improved',len(changes))
