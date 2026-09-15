"""Export the existing ORBIT planet/ring identity as installable PNG icons."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

root = Path(__file__).resolve().parent.parent / 'public'
(root / 'icons').mkdir(exist_ok=True)
# Full-bleed background, with all meaningful artwork inside the maskable safe zone.
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g"><stop stop-color="#56ccf2"/><stop offset=".52" stop-color="#80ed99"/><stop offset="1" stop-color="#ffd166"/></linearGradient></defs>
<path fill="#070b1e" d="M0 0h512v512H0z"/>
<circle cx="256" cy="256" r="65" fill="url(#g)"/>
<ellipse cx="256" cy="256" rx="168" ry="74" fill="none" stroke="#f8fafc" stroke-width="18" transform="rotate(-22 256 256)"/>
<circle cx="398" cy="200" r="18" fill="#ff8fab"/>
</svg>'''
(root / 'icon.svg').write_text(svg, encoding='utf-8')
scale = 4
im = Image.new('RGB', (512*scale,512*scale), '#070b1e')
d = ImageDraw.Draw(im)
stops = [(0,(86,204,242)),(.52,(128,237,153)),(1,(255,209,102))]
for x in range(191*scale,322*scale):
    t=(x/scale-191)/130
    a,b = (stops[0],stops[1]) if t<=.52 else (stops[1],stops[2])
    f=min(1,max(0,(t-a[0])/(b[0]-a[0])))
    color=tuple(round(c+(e-c)*f) for c,e in zip(a[1],b[1]))
    dy=math.sqrt(max(0,65**2-(x/scale-256)**2))*scale
    d.line((x,256*scale-dy,x,256*scale+dy),fill=color)
angle=math.radians(-22)
ring = Image.new('RGBA', im.size)
rd = ImageDraw.Draw(ring)
for radius, color in [(9, '#f8fafc'),(-9,(0,0,0,0))]:
    pts=[]
    for i in range(721):
        t=i*math.pi/360
        x,y=(168+radius)*math.cos(t),(74+radius)*math.sin(t)
        pts.append(((256+x*math.cos(angle)-y*math.sin(angle))*scale,(256+x*math.sin(angle)+y*math.cos(angle))*scale))
    rd.polygon(pts,fill=color)
im.paste(ring,(0,0),ring)
d = ImageDraw.Draw(im)
d.ellipse(tuple(v*scale for v in (380,182,416,218)),fill='#ff8fab')
for name,size in [('icon-192.png',192),('icon-512.png',512),('maskable-512.png',512),('apple-touch-icon.png',180)]:
    im.resize((size,size),Image.Resampling.LANCZOS).save(root/'icons'/name)
