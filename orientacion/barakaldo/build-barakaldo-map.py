#!/usr/bin/env python3
"""Genera data/bara-geo.js con geometría real de OSM (Overpass) para Barakaldo.

Equivalente al build de Noja. Respuestas crudas cacheadas en data/raw/*.json;
borra el caché para refrescar. Datos © OpenStreetMap contributors, ODbL.
"""
import json
import math
import pathlib
import subprocess
import time

HERE = pathlib.Path(__file__).parent
RAW = HERE / "data" / "raw"
OUT = HERE / "data" / "bara-geo.js"
OVERPASS = "https://overpass-api.de/api/interpreter"
UA = "neo-learn-personal-project"

# Consultas (se cachean por nombre en data/raw/<name>.json).
QUERIES = {
    "bara_boundary": "[out:json][timeout:90];relation(340585);out geom;",
    "bara_streets": '[out:json][timeout:80];way["highway"~"residential|living_street|pedestrian|tertiary|secondary"]["name"](43.2925,-3.0000,43.3010,-2.9820);out geom;',
    "bara_axes": '[out:json][timeout:80];way["highway"]["name"~"Bilbao - Sestao errepidea|Ismael Gorostiza|Gernikako Arbola|Euskadi etorbidea|Askatasun etorbidea|Bulevar de Beurko"](43.26,-3.02,43.305,-2.965);out tags geom;',
}

# Barrios (centro aprox. según nodos place=* de OSM). Voronoi recortado al término.
BARRIOS = {
    "San Vicente": (43.2954, -2.9970),
    "Larrea": (43.2980, -2.9819),
    "Arrontegi": (43.2960, -2.9830),
    "Beurko": (43.2990, -2.9942),
    "Zaballa": (43.2970, -2.9901),
    "Arteagabeitia": (43.2921, -2.9937),
    "Ansio": (43.2868, -2.9945),
    "Kareaga": (43.2866, -3.0058),
    "La Paz": (43.2812, -2.9879),
    "Gurutzeta": (43.2812, -2.9830),
    "Lutxana": (43.2895, -2.9792),
    "Burtzeña": (43.2801, -2.9781),
    "El Regato": (43.2641, -3.0163),
}

# Ejes del callejero (el resto de calles del centro son ramas menores).
STREETS_MAIN = [
    "Gernikako Arbola etorbidea",
    "Arana kalea",
    "San Juan kalea",
    "Euskadi etorbidea",
    "Askatasun etorbidea",
    "Bulevar de Beurko",
]


def curl(url, post_data=None):
    cmd = ["curl", "-sf", "--max-time", "120", "--retry", "4", "--retry-delay",
           "25", "--retry-all-errors", "-A", UA, url]
    if post_data is not None:
        cmd += ["--data-urlencode", f"data={post_data}"]
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def fetch(name):
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / f"{name}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    body = curl(OVERPASS, QUERIES[name])
    cache.write_bytes(body)
    time.sleep(2)
    return json.loads(body)


# ---------- geometría auxiliar ----------
def _stitch(segs):
    segs = [s[:] for s in segs]
    rings, cur = [], segs.pop(0)
    while True:
        if cur[0] == cur[-1] and len(cur) > 2:
            rings.append(cur)
            if not segs:
                break
            cur = segs.pop(0)
            continue
        found = False
        for i, s in enumerate(segs):
            if s[0] == cur[-1]:
                cur += s[1:]; segs.pop(i); found = True; break
            if s[-1] == cur[-1]:
                cur += s[-2::-1]; segs.pop(i); found = True; break
            if s[-1] == cur[0]:
                cur = s[:-1] + cur; segs.pop(i); found = True; break
            if s[0] == cur[0]:
                cur = s[1:][::-1] + cur; segs.pop(i); found = True; break
        if not found:
            rings.append(cur)
            if not segs:
                break
            cur = segs.pop(0)
    return rings


def _area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1]
                   - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def _clip_hp(poly, m, n):
    out, N = [], len(poly)
    for i in range(N):
        a, b = poly[i], poly[(i + 1) % N]
        da = (a[0] - m[0]) * n[0] + (a[1] - m[1]) * n[1]
        db = (b[0] - m[0]) * n[0] + (b[1] - m[1]) * n[1]
        if da <= 0:
            out.append(a)
        if (da < 0) != (db < 0):
            t = da / (da - db)
            out.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
    return out


def _mainland_ring(rel_elements):
    rel = rel_elements[0]
    ways = [[(round(p["lat"], 6), round(p["lon"], 6)) for p in m["geometry"]]
            for m in rel["members"] if m.get("role") == "outer" and m["type"] == "way"]
    return max(_stitch(ways), key=lambda r: _area([(lo, la) for la, lo in r]))


def build_barrios(rel_elements):
    """Voronoi de los centros de barrio recortado al término municipal (áreas
    contiguas con frontera). Celda convexa (bbox+semiplanos) e intersección
    robusta con el municipio."""
    ring = _mainland_ring(rel_elements)
    step = max(1, len(ring) // 250)
    ring = ring[::step]
    lat0 = sum(la for la, _ in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    muni = [(lo * k, la) for la, lo in ring]
    xs = [p[0] for p in muni]; ys = [p[1] for p in muni]
    box = [(min(xs) - .01, min(ys) - .01), (max(xs) + .01, min(ys) - .01),
           (max(xs) + .01, max(ys) + .01), (min(xs) - .01, max(ys) + .01)]
    out = []
    for name, (la, lo) in BARRIOS.items():
        pi = (lo * k, la)
        cell = box[:]
        for oname, (ola, olo) in BARRIOS.items():
            if oname == name:
                continue
            pj = (olo * k, ola)
            m = ((pi[0] + pj[0]) / 2, (pi[1] + pj[1]) / 2)
            cell = _clip_hp(cell, m, (pj[0] - pi[0], pj[1] - pi[1]))
        cx = sum(p[0] for p in cell) / len(cell); cy = sum(p[1] for p in cell) / len(cell)
        terr = muni[:]
        for i in range(len(cell)):
            a, b = cell[i], cell[(i + 1) % len(cell)]
            nx, ny = b[1] - a[1], -(b[0] - a[0])
            if (cx - a[0]) * nx + (cy - a[1]) * ny > 0:
                nx, ny = -nx, -ny
            terr = _clip_hp(terr, a, (nx, ny))
            if not terr:
                break
        poly = [[round(y, 5), round(x / k, 5)] for x, y in terr]
        out.append({"n": name, "poly": poly, "mid": [la, lo]})
    return out


def edges(rel_elements):
    """Ría (borde norte) y montes (borde sur): tramos contiguos del anillo
    municipal en las bandas de latitud alta/baja."""
    ring = _mainland_ring(rel_elements)
    lats = sorted(p[0] for p in ring)
    hi, lo = lats[int(len(lats) * 0.80)], lats[int(len(lats) * 0.15)]

    def longest_run(keep):
        best, cur = [], []
        for p in ring + ring:            # duplica para cerrar el anillo
            if keep(p):
                cur.append(p)
            else:
                if len(cur) > len(best):
                    best = cur
                cur = []
        if len(cur) > len(best):
            best = cur
        return best[:len(ring)]

    ria = [[round(la, 5), round(lo_, 5)] for la, lo_ in longest_run(lambda p: p[0] >= hi)]
    montes = [[round(la, 5), round(lo_, 5)] for la, lo_ in longest_run(lambda p: p[0] <= lo)]
    return {"ria": ria, "montes": montes}


def build_streets(elements):
    ways = [e for e in elements if e.get("type") == "way" and e.get("tags", {}).get("name")]
    nodes_of, lines_of = {}, {}
    for w in ways:
        name = w["tags"]["name"]
        ids = w.get("nodes") or [(round(g["lat"], 6), round(g["lon"], 6)) for g in w["geometry"]]
        nodes_of.setdefault(name, set()).update(ids)
        lines_of.setdefault(name, []).append(
            [[round(g["lat"], 5), round(g["lon"], 5)] for g in w["geometry"]])

    def connects(name):
        return sorted(o for o in nodes_of if o != name and nodes_of[name] & nodes_of[o])

    keep = set(n for n in STREETS_MAIN if n in nodes_of)
    for name in list(keep):
        keep.update(connects(name))
    out = []
    for name in sorted(keep, key=lambda n: (n not in STREETS_MAIN, n)):
        pts = [p for line in lines_of[name] for p in line]
        out.append({"n": name, "lines": lines_of[name], "mid": pts[len(pts) // 2],
                    "connects": [c for c in connects(name) if c in keep],
                    "main": name in STREETS_MAIN})
    return out


def axes(elements, every=1):
    """Ejes viarios con nombre → dict nombre: [polilíneas]."""
    out = {}
    for e in elements:
        if e.get("type") != "way":
            continue
        name = e.get("tags", {}).get("name")
        pts = [[round(g["lat"], 5), round(g["lon"], 5)] for i, g in enumerate(e["geometry"])
               if i % every == 0 or i == len(e["geometry"]) - 1]
        if name and len(pts) >= 2:
            out.setdefault(name, []).append(pts)
    return out


def main():
    boundary = fetch("bara_boundary")["elements"]
    geo = {
        "barrios": build_barrios(boundary),
        "streets": build_streets(fetch("bara_streets")["elements"]),
        "axes": axes(fetch("bara_axes")["elements"]),
        **edges(boundary),
    }
    js = "// Generado por build-barakaldo-map.py — datos © OpenStreetMap contributors (ODbL)\n"
    js += "window.BARA_GEO = " + json.dumps(geo, separators=(",", ":")) + ";\n"
    OUT.write_text(js)
    print("barrios:", len(geo["barrios"]), "| streets:", len(geo["streets"]),
          "| axes:", list(geo["axes"]), "| ria pts:", len(geo["ria"]),
          "| montes pts:", len(geo["montes"]))
    print(f"→ {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
