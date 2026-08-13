#!/usr/bin/env python3
"""Genera data/noja-geo.js con geometría real de OSM (vía Overpass).

Las respuestas crudas se cachean en data/raw/*.json; borra el caché para
refrescar desde OSM. Datos © OpenStreetMap contributors, ODbL.
"""
import json
import pathlib
import subprocess
import time

HERE = pathlib.Path(__file__).parent
RAW = HERE / "data" / "raw"
OUT = HERE / "data" / "noja-geo.js"

OVERPASS = "https://overpass-api.de/api/interpreter"
UA = "neo-learn-personal-project"

QUERIES = {
    "ca147": '[out:json][timeout:60];way["ref"="CA-147"](43.45,-3.58,43.50,-3.44);out tags geom;',
    "avris": '[out:json][timeout:60];way["name"~"Avenida de Ris|Paseo Marítimo"](43.46,-3.56,43.50,-3.46);out tags geom;',
    "beach_east": '[out:json][timeout:60];(way["natural"="beach"]["name"~"Ris|Tregandín"](43.46,-3.56,43.50,-3.46);way["highway"]["name"~"Trengandín|Tregandín"](43.46,-3.56,43.50,-3.46););out tags geom;',
    # Calles con nombre del centro; pedimos node ids (out geom) para detectar cruces.
    "streets": '[out:json][timeout:60];way["highway"~"residential|unclassified|tertiary|living_street|pedestrian|secondary"]["name"](43.4755,-3.5265,43.4855,-3.5140);out geom;',
    # Límite administrativo de Noja (relación 344841), para recortar los barrios.
    "noja_boundary": "[out:json][timeout:60];relation(344841);out geom;",
}

# Barrios del casco (centro aproximado según los nodos place=* de OSM). Se convierten
# en áreas contiguas por Voronoi recortado al término municipal.
BARRIOS = {
    "Tregandín": (43.4795, -3.5233),
    "Pedroso": (43.4835, -3.5197),
    "El Arco": (43.4800, -3.5291),
    "Fonegra": (43.4749, -3.5223),
    "Cabanzo": (43.4754, -3.5297),
    "Palacio": (43.4839, -3.5342),
    "Ris": (43.4885, -3.5292),
    "Helgueras": (43.4713, -3.5081),
}

# Ejes principales del centro (el resto de calles con nombre son ramas menores).
# El orden fija la numeración en la interfaz.
STREETS_MAIN = [
    "Avenida de Cantabria",
    "Calle de las Viñas",
    "Calle del Socaire",
    "Calle de los Cuadrillos",
    "Calle de la Panadería",
    "Paseo de Trengandín",
]

OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/"

# Ruta circular al Brusco: la ida va a la rotonda de Helgueras, pasa por el Molino
# de las Aves (borde de la marisma) y de ahí sube a Miravalles y el Brusco; la
# vuelta, entera por la playa (paseo o arena).
RUTA_BRUSCO = [
    [43.4805, -3.5200],    # arranque del paseo de Trengandín
    [43.47245, -3.50563],  # rotonda de Helgueras
    [43.47034, -3.51471],  # Molino de las Aves (borde de la marisma Victoria)
    [43.46498, -3.49212],  # Pico Miravalles (arranca la subida)
    [43.46839, -3.47683],  # mirador de la Punta del Brusco
    [43.4805, -3.5200],    # vuelta por la playa hasta el inicio
]

# Bucle a Monte Cincho: sube por el sur (Zoña) y baja por el norte (Soano);
# corredores distintos comprobados (subida y bajada solapan ~20%).
RUTA_CINCHO = [
    [43.4805, -3.5200],    # arranque del paseo de Trengandín
    [43.46290, -3.54429],  # Zoña (aproximación sur)
    [43.47963, -3.55583],  # cima del Monte Cincho
    [43.48126, -3.54403],  # Soano (bajada norte, distinta de la ida)
    [43.4805, -3.5200],    # vuelta al inicio
]

# geoKey → waypoints; cada tramo consecutivo lo une el router a pie.
RUTAS = {"rutaBrusco": RUTA_BRUSCO, "rutaCincho": RUTA_CINCHO}


def fetch_leg(name: str, a, b) -> list:
    """Polilínea [[lat,lon],…] a pie entre dos waypoints, cacheada."""
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / f"{name}.json"
    if cache.exists():
        d = json.loads(cache.read_text())
    else:
        body = curl(f"{OSRM}{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson")
        cache.write_bytes(body)
        time.sleep(1)
        d = json.loads(body)
    route = d["routes"][0]
    return {
        "dist": round(route["distance"] / 1000, 2),
        "pts": [[round(lat, 5), round(lon, 5)] for lon, lat in route["geometry"]["coordinates"]],
    }


def curl(url: str, post_data=None) -> bytes:
    # curl en vez de urllib: el Python de Xcode falla el handshake TLS con
    # algunos servidores (LibreSSL antiguo).
    cmd = ["curl", "-sf", "--max-time", "90", "--retry", "3", "--retry-delay",
           "20", "--retry-all-errors", "-A", UA, url]
    if post_data is not None:
        cmd += ["--data-urlencode", f"data={post_data}"]
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def fetch(name: str) -> dict:
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / f"{name}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    body = curl(OVERPASS, QUERIES[name])
    cache.write_bytes(body)
    time.sleep(2)
    return json.loads(body)


def segments(elements, pred, min_lat=None, every=1):
    """Lista de polilíneas [[lat,lon],…] de las ways que cumplen pred."""
    segs = []
    for e in elements:
        if e.get("type") != "way" or not pred(e.get("tags", {})):
            continue
        pts = [
            [round(g["lat"], 5), round(g["lon"], 5)]
            for i, g in enumerate(e["geometry"])
            if i % every == 0 or i == len(e["geometry"]) - 1
        ]
        if min_lat is not None:
            pts = [p for p in pts if p[0] >= min_lat]
        if len(pts) >= 2:
            segs.append(pts)
    return segs


def build_streets(elements):
    """Grafo de calles: fusiona ways por nombre y detecta cruces por nodo compartido.

    Devuelve toda calle con nombre que sea eje principal o cruce con uno, con sus
    polilíneas, un punto medio para la etiqueta, sus cruces y si es eje principal.
    """
    ways = [e for e in elements if e.get("type") == "way" and e.get("tags", {}).get("name")]

    # Normaliza variantes de grafía para no duplicar calles.
    fix = {"Calle del Trebol": "Calle del Trébol"}

    nodes_of, lines_of = {}, {}
    for w in ways:
        name = fix.get(w["tags"]["name"], w["tags"]["name"])
        ids = w.get("nodes") or [
            (round(g["lat"], 6), round(g["lon"], 6)) for g in w["geometry"]
        ]
        nodes_of.setdefault(name, set()).update(ids)
        lines_of.setdefault(name, []).append(
            [[round(g["lat"], 5), round(g["lon"], 5)] for g in w["geometry"]]
        )

    def connects(name):
        return sorted(
            other for other in nodes_of
            if other != name and nodes_of[name] & nodes_of[other]
        )

    # Mostramos los ejes principales y toda calle que cruce con alguno de ellos.
    keep = set(n for n in STREETS_MAIN if n in nodes_of)
    for name in list(keep):
        keep.update(connects(name))

    out = []
    for name in sorted(keep, key=lambda n: (n not in STREETS_MAIN, n)):
        pts = [p for line in lines_of[name] for p in line]
        out.append({
            "n": name,
            "lines": lines_of[name],
            "mid": pts[len(pts) // 2],
            # Subgrafo cerrado: solo cruces con calles también mostradas.
            "connects": [c for c in connects(name) if c in keep],
            "main": name in STREETS_MAIN,
        })
    return out


import math


def _stitch(segs):
    """Cose vías OSM (listas de (lat,lon)) en anillos por extremos compartidos."""
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


def _ring_area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1]
                   - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def _clip_halfplane(poly, m, n):
    """Sutherland-Hodgman contra un semiplano: conserva los puntos con dot(x-m,n)<=0."""
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


def build_barrios(rel_elements):
    """Áreas de barrio: teselación de Voronoi (desde los centros) recortada al
    término municipal, de modo que cada barrio confina con sus vecinos sin huecos.

    Método robusto: la celda de Voronoi se calcula convexa (bbox + semiplanos) y
    luego se recorta el polígono del municipio contra esa celda convexa (así el
    recorte de Sutherland-Hodgman conserva el área aunque la costa sea cóncava).
    """
    rel = rel_elements[0]
    ways = [[(round(p["lat"], 6), round(p["lon"], 6)) for p in m["geometry"]]
            for m in rel["members"] if m.get("role") == "outer" and m["type"] == "way"]
    # Anillo continental (mayor) y submuestreo para aligerar.
    ring = max(_stitch(ways), key=lambda r: _ring_area([(lo, la) for la, lo in r]))
    step = max(1, len(ring) // 250)
    ring = ring[::step]

    lat0 = sum(la for la, _ in ring) / len(ring)
    k = math.cos(math.radians(lat0))
    muni = [(lo * k, la) for la, lo in ring]          # a plano (x=lon·k, y=lat)
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
            cell = _clip_halfplane(cell, m, (pj[0] - pi[0], pj[1] - pi[1]))
        # Recorta el municipio contra la celda convexa (normal exterior por arista).
        cx = sum(p[0] for p in cell) / len(cell); cy = sum(p[1] for p in cell) / len(cell)
        terr = muni[:]
        for i in range(len(cell)):
            a, b = cell[i], cell[(i + 1) % len(cell)]
            nx, ny = b[1] - a[1], -(b[0] - a[0])
            if (cx - a[0]) * nx + (cy - a[1]) * ny > 0:
                nx, ny = -nx, -ny
            terr = _clip_halfplane(terr, a, (nx, ny))
            if not terr:
                break
        poly = [[round(y, 5), round(x / k, 5)] for x, y in terr]
        out.append({"n": name, "poly": poly, "mid": [la, lo]})
    return out


def main():
    ca147 = fetch("ca147")["elements"]
    avris = fetch("avris")["elements"]
    beach = fetch("beach_east")["elements"]

    geo = {
        # Tramo urbano de la espina; se recorta el tramo lejano hacia Beranga.
        "ca147": segments(ca147, lambda t: t.get("ref") == "CA-147", min_lat=43.461),
        "avris": segments(avris, lambda t: "Avenida de Ris" in (t.get("name") or "")),
        "paseoMaritimo": segments(avris, lambda t: (t.get("name") or "") == "Paseo Marítimo"),
        "paseoTrengandin": segments(beach, lambda t: "highway" in t),
        "playaRis": segments(beach, lambda t: (t.get("name") or "") == "Playa de Ris", every=6),
        "playaTregandin": segments(beach, lambda t: (t.get("name") or "") == "Playa de Tregandín", every=6),
        "streets": build_streets(fetch("streets")["elements"]),
        "barrios": build_barrios(fetch("noja_boundary")["elements"]),
    }
    # Rutas preparadas: un tramo por par de waypoints consecutivos.
    for key, wps in RUTAS.items():
        slug = key.replace("ruta", "ruta_").lower()
        geo[key] = [fetch_leg(f"{slug}_{i}", wps[i], wps[i + 1]) for i in range(len(wps) - 1)]

    js = "// Generado por build-noja-map.py — datos © OpenStreetMap contributors (ODbL)\n"
    js += "window.NOJA_GEO = " + json.dumps(geo, separators=(",", ":")) + ";\n"
    OUT.write_text(js)
    def npts(s):
        if isinstance(s, dict):
            return sum(len(x) for x in s["lines"]) if "lines" in s else len(s["pts"])
        return len(s)
    for k, v in geo.items():
        print(f"{k}: {len(v)} elementos, {sum(npts(s) for s in v)} puntos")
    print(f"→ {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
