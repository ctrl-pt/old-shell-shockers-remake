"""Retain requested historical sources with URLs and byte hashes; never execute them."""
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import urllib.request

OUT = pathlib.Path(__file__).resolve().parent

def fetch(item):
    name, url = item
    target = OUT / name
    target.resolve().relative_to(OUT.resolve())
    if target.exists() and target.with_suffix(target.suffix + '.meta.json').exists():
        return {'file': name, 'cached': True, 'bytes': target.stat().st_size}
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'ShellShockers-Preservation/1.0'})
        with urllib.request.urlopen(request, timeout=40) as response:
            data, resolved = response.read(), response.url
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        meta = {'requested_url': url, 'resolved_url': resolved, 'bytes': len(data),
                'sha256': hashlib.sha256(data).hexdigest()}
        target.with_suffix(target.suffix + '.meta.json').write_text(json.dumps(meta, indent=2), encoding='utf8')
        return {'file': name, **meta}
    except Exception as exc:
        return {'file': name, 'url': url, 'error': str(exc)}

if __name__ == '__main__':
    jobs = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf8'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(fetch, jobs.items()):
            print(json.dumps(result), flush=True)
