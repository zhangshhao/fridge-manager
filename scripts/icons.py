from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'apps/web/public/icons'
root.mkdir(parents=True, exist_ok=True)
def make(size, maskable=False):
    scale=4
    im=Image.new('RGB',(size*scale,size*scale),'#1c7658')
    d=ImageDraw.Draw(im)
    def box(coords,**kw): d.rounded_rectangle(tuple(int(x*size*scale) for x in coords),**kw)
    def line(coords,**kw): d.line(tuple(int(x*size*scale) for x in coords),**kw)
    box((.31,.19,.69,.82),radius=int(size*scale*.065),fill='#f4f8ea')
    line((.31,.45,.69,.45),fill='#1c7658',width=int(size*scale*.025))
    line((.38,.30,.38,.37),fill='#1c7658',width=int(size*scale*.025))
    line((.38,.54,.38,.69),fill='#1c7658',width=int(size*scale*.025))
    d.ellipse((int(.60*size*scale),int(.13*size*scale),int(.78*size*scale),int(.24*size*scale)),fill='#bfdc92')
    return im.resize((size,size),Image.Resampling.LANCZOS)
for size in [192,512]: make(size).save(root/f'icon-{size}.png')
make(512,True).save(root/'maskable-512.png')
make(180).save(root/'apple-touch-icon.png')
print('PWA icons generated')
