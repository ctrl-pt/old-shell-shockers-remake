"""Package four recovered native map objects and draw schematic geometry previews."""
import hashlib
import json
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent
DEC = 'shellshock-20171203032547'
EARLY = 'shellshock-20180218182625'

def load(stem):
    return json.loads((ROOT / 'extracted' / (stem + '.maps.json')).read_text(encoding='utf8'))

selection = [(f'dec2017-alpha{i+1}', f'December map {i+1} / Alpha{i+1}', DEC, i) for i in range(3)]
selection.append(('early-bedrock', 'Early Bedrock', EARLY, 1))
baseline = json.loads((ROOT.parent / 'agent/maps-20190519.json').read_text(encoding='utf8'))
records = []
maps = []
for slug, label, stem, index in selection:
    map_data = load(stem)[index]
    target = ROOT / 'maps' / (slug + '.json')
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(map_data, indent=2) + '\n', encoding='utf8')
    assert json.loads(target.read_text()) == map_data
    dims = tuple(map_data[k] for k in ('width', 'height', 'depth'))
    assert all(dims != tuple(m[k] for k in ('width', 'height', 'depth')) for m in baseline)
    count = 0
    for decs in map_data['data'].values():
        for cells in decs.values():
            for cell in cells:
                assert 0 <= cell['x'] < map_data['width']
                assert 0 <= cell['z'] < map_data['depth']
                assert 0 <= cell['y'] <= map_data['height']
                count += 1
    meta = json.loads((ROOT / 'clients' / (stem + '.js.meta.json')).read_text())
    source = (ROOT / 'clients' / (stem + '.js')).read_bytes()
    assert hashlib.sha256(source).hexdigest() == meta['sha256']
    records.append({'id': slug, 'research_label': label, 'original_name': map_data['name'],
                    'source_array_index': index, 'width': dims[0], 'height': dims[1], 'depth': dims[2],
                    'cells': count, 'native_map_file': 'maps/' + slug + '.json',
                    'export_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'source': meta})
    maps.append(map_data)
(ROOT / 'recovered-maps.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf8')

S = 2
im = Image.new('RGB', (1600*S, 1080*S), '#101a27')
d = ImageDraw.Draw(im)
font_path = 'C:/Windows/Fonts/segoeui.ttf'
bold_path = 'C:/Windows/Fonts/segoeuib.ttf'
def font(n, bold=False):
    return ImageFont.truetype(bold_path if bold else font_path, n*S)
def txt(pos, text, size=18, fill='#b9c7d8', bold=False):
    d.text(tuple(int(v*S) for v in pos), text, font=font(size, bold), fill=fill)

txt((48, 25), 'Four recovered Shell Shockers maps', 34, '#f3f7fc', True)
txt((50, 77), 'Original map coordinates from Wayback clients. Schematic geometry; ramps and small details simplified.', 18)

def shade(c, factor):
    return tuple(max(0,min(255,int(v*factor))) for v in c)

for i, (rec, m) in enumerate(zip(records, maps)):
    ox, oy = 38 + (i % 2)*780, 124 + (i // 2)*448
    d.rounded_rectangle((ox*S, oy*S, (ox+746)*S, (oy+425)*S), radius=15*S, fill='#182638', outline='#2a3b50', width=S)
    txt((ox+22, oy+15), rec['research_label'], 24, '#f0f5fc', True)
    when = 'December 3, 2017 capture' if i < 3 else 'February 18, 2018 capture'
    txt((ox+22, oy+50), f"{when}  |  {m['width']} x {m['depth']} tiles  |  height field {m['height']}", 15)
    raw = []
    for cat, decs in m['data'].items():
        for dec, cells in decs.items():
            for cell in cells:
                if int(cat) in (1,2,4,5): raw.append((int(cat), int(dec), cell))
    unit = min(11.5, 535/(m['width']+m['depth']))
    cx, cy = ox+365, oy+132
    def point(x,y,z): return ((cx+(x-z)*unit)*S,(cy+(x+z)*unit*.47-y*unit*.90)*S)
    # Rear columns are drawn before front columns, from bottom to top.
    raw.sort(key=lambda q: (q[2]['x']+q[2]['z'], q[2]['y']))
    for cat, dec, cell in raw:
        x,y,z = (cell[k] for k in ('x','y','z'))
        h = {1:.10, 2:1, 4:.45, 5:.50}[cat]
        if cat == 1: color = (88,141,102) if dec in (0,1) else (113,127,137)
        elif cat == 5: color = (201,170,106)
        else: color = (155,166,174)
        a,b,c,e = [point(xx,y+h,zz) for xx,zz in ((x,z),(x+1,z),(x+1,z+1),(x,z+1))]
        aa,bb,cc,ee = [point(xx,y,zz) for xx,zz in ((x,z),(x+1,z),(x+1,z+1),(x,z+1))]
        d.polygon([b,bb,cc,c], fill=shade(color,.59))
        d.polygon([e,ee,cc,c], fill=shade(color,.76))
        d.polygon([a,b,c,e], fill=color)
        d.line([a,b,c,e,a], fill=shade(color,.82), width=1)
    txt((ox+22, oy+390), 'Unnamed in the original client' if i<3 else 'Absent from May 11, 2018 client; seen April 30', 15)

txt((48, 1044), 'Alpha1-3 and Early Bedrock are research labels. These previews are diagrams, not archived game screenshots.', 17)
im.resize((1600,1080),Image.Resampling.LANCZOS).save(ROOT/'recovered-maps-preview.png')
print(json.dumps({'maps': len(records), 'cells': [r['cells'] for r in records], 'verified_against_baseline': [m['name'] for m in baseline]}))
