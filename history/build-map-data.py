#!/usr/bin/env python3
"""Genera los paths SVG de los mapas e inyecta el resultado en
linea-temporal-espana.html entre los marcadores __MAPDATA__.

Datos de entrada (carpeta data/):
  es-provinces.topo.json  TopoJSON de provincias de España (es-atlas / IGN).
  pt-adm1.geojson         GeoJSON de distritos de Portugal (geoBoundaries,
                          opcional). Si falta, se usa un contorno aproximado
                          dibujado a mano. Para obtener el real (~595 KB,
                          ~150 KB comprimido):
                            curl -sL --compressed -o data/pt-adm1.geojson \
                              "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PRT/ADM1/geoBoundaries-PRT-ADM1_simplified.geojson"

Uso: python3 build-map-data.py
"""
import json
import math
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).parent
HTML = HERE / "linea-temporal-espana.html"
ES_TOPO = HERE / "data" / "es-provinces.topo.json"
PT_GEO = HERE / "data" / "pt-adm1.geojson"
WORLD_TOPO = HERE / "data" / "countries-110m.json"

# Proyección equirrectangular centrada en la península (viewBox 700x540).
LON_MIN, LAT_MAX = -9.75, 44.05
KY = 60.0
KX = KY * math.cos(math.radians(40.0))
OX = OY = 22.0
VIEW = [700, 540]
EPS = 0.65  # tolerancia Douglas-Peucker en px

# Provincia (código INE) -> zona histórica.
INE_ZONE = {
    "01": "VAS", "02": "TOL", "03": "VAL", "04": "GRA", "05": "CAS",
    "06": "EXT", "07": "BAL", "08": "CTN", "09": "CAS", "10": "EXT",
    "11": "ANO", "12": "VAL", "13": "TOL", "14": "ANO", "15": "GAL",
    "16": "TOL", "17": "CTN", "18": "GRA", "19": "TOL", "20": "VAS",
    "21": "ANO", "22": "ARN", "23": "ANO", "24": "LEO", "25": "CTS",
    "26": "NAV", "27": "GAL", "28": "TOL", "29": "GRA", "30": "MUR",
    "31": "NAV", "32": "GAL", "33": "AST", "34": "CAS", "36": "GAL",
    "37": "LEO", "39": "AST", "40": "CAS", "41": "ANO", "42": "CAS",
    "43": "CTS", "44": "ARS", "45": "TOL", "46": "VAL", "47": "CAS",
    "48": "VAS", "49": "LEO", "50": "ARS",
    "35": "CAN", "38": "CAN",
}  # excluidas: 51 Ceuta, 52 Melilla

# Distrito portugués -> zona histórica (para datos reales de geoBoundaries).
PT_ZONE = {
    "viana do castelo": "PTN", "braga": "PTN", "porto": "PTN",
    "vila real": "PTN", "braganca": "PTN",
    "aveiro": "PTC", "viseu": "PTC", "guarda": "PTC", "coimbra": "PTC",
    "castelo branco": "PTC", "leiria": "PTC", "santarem": "PTC",
    "lisboa": "PTC",
    "portalegre": "PTS", "evora": "PTS", "setubal": "PTS", "beja": "PTS",
    "faro": "PTS",
}

PT_ZONE_NAMES = {"PTN": "Portugal norte", "PTC": "Portugal centro", "PTS": "Alentejo y Algarve"}

# Costa atlántica aproximada de Portugal (lon, lat), de la desembocadura del
# Guadiana a la del Miño. La frontera con España NO se dibuja a mano: se extrae
# del contorno real de las provincias españolas, así ambos países encajan.
# Solo se usa mientras no exista data/pt-adm1.geojson.
PT_COAST = [
    (-7.41, 37.17), (-7.82, 36.97), (-7.94, 36.97), (-8.25, 37.07),
    (-8.60, 37.12), (-8.81, 37.05), (-8.94, 36.99), (-9.00, 37.02),
    (-8.91, 37.35), (-8.85, 37.60), (-8.88, 37.95), (-8.95, 38.25),
    (-9.22, 38.42), (-9.18, 38.62), (-9.42, 38.70), (-9.50, 38.79),
    (-9.43, 39.00), (-9.37, 39.36), (-9.15, 39.52), (-9.07, 39.60),
    (-8.87, 40.15), (-8.75, 40.64), (-8.66, 41.00), (-8.68, 41.16),
    (-8.78, 41.40), (-8.83, 41.69), (-8.87, 41.86),
]
PT_MINO = (-8.874, 41.865)   # desembocadura del Miño
PT_GUADIANA = (-7.406, 37.174)  # desembocadura del Guadiana
PT_CUT_N = 41.08  # línea del Duero
PT_CUT_S = 38.60  # línea del Tajo


def project(lon, lat):
    return (OX + (lon - LON_MIN) * KX, OY + (LAT_MAX - lat) * KY)


def project_canaries(lon, lat):
    """Inserto de Canarias: conserva su geometría y la acerca al mapa principal."""
    return (35 + (lon + 18.7) * 19, 413 + (29.9 - lat) * 19)


def project_world(lon, lat):
    """Proyección global de contexto, encajada en el mismo viewBox del mapa."""
    return (18 + (lon + 180) * (664 / 360), 86 + (85 - lat) * (330 / 145))


def simplify(points, eps=EPS):
    """Douglas-Peucker iterativo; conserva los extremos."""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if norm == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > best:
                best, idx = d, i
        if best > eps:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(points, keep) if k]


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def rings_to_path(rings):
    """Lista de anillos (puntos proyectados) -> atributo d compacto."""
    parts = []
    for ring in rings:
        pts = list(ring)
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts.pop()
        coords, last = [], None
        for p in pts:
            r = (fmt(p[0]), fmt(p[1]))
            if r != last:
                coords.append(f"{r[0]} {r[1]}")
                last = r
        if len(coords) >= 3:
            parts.append("M" + " ".join(coords) + "Z")
    return "".join(parts)


def line_to_path(points):
    """Una polilínea proyectada -> atributo d SVG, sin cerrarla."""
    coords, last = [], None
    for p in points:
        r = (fmt(p[0]), fmt(p[1]))
        if r != last:
            coords.append(f"{r[0]} {r[1]}")
            last = r
    return "M" + " L".join(coords) if len(coords) >= 2 else ""


def load_spain():
    topo = json.loads(ES_TOPO.read_text())
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs, canary_arcs = [], []
    for arc in topo["arcs"]:
        x = y = 0
        pts, canary_pts = [], []
        for dx, dy in arc:
            x += dx
            y += dy
            lon, lat = x * sx + tx, y * sy + ty
            pts.append(project(lon, lat))
            canary_pts.append(project_canaries(lon, lat))
        # Simplificar por arco: las fronteras compartidas coinciden siempre.
        arcs.append(simplify(pts))
        canary_arcs.append(simplify(canary_pts, .35))

    def ring(indexes):
        out = []
        for i in indexes:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    # Contar primero todos los usos de cada arco, incluso los territorios que
    # no mostramos (Gibraltar, Ceuta y Melilla). Un arco que linda con uno de
    # ellos no es costa: de otro modo quedaría como un pequeño trazo aislado.
    all_uses = {}
    for geom in topo["objects"]["provinces"]["geometries"]:
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        for poly in polys:
            for r in poly:
                for i in r:
                    k = i if i >= 0 else ~i
                    all_uses[k] = all_uses.get(k, 0) + 1

    shapes = []
    # Cada arco recuerda qué provincias lo usan. Esto permite dibujar solo las
    # fronteras entre entidades históricas, en lugar de las provinciales.
    edge_owners = {}
    for geom in topo["objects"]["provinces"]["geometries"]:
        zone = INE_ZONE.get(geom["id"])
        if not zone:
            continue
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        for poly in polys:
            for r in poly:
                for i in r:
                    k = i if i >= 0 else ~i
                    # El inserto canario no comparte fronteras terrestres y sus
                    # contornos se proyectan aparte; no debe reutilizar los
                    # arcos peninsulares en la capa de límites.
                    if zone != "CAN":
                        edge_owners.setdefault(k, []).append({"z": zone, "i": geom["id"]})
        source_arcs = canary_arcs if zone == "CAN" else arcs
        def source_ring(indexes):
            out = []
            for i in indexes:
                pts = source_arcs[i] if i >= 0 else source_arcs[~i][::-1]
                out.extend(pts if not out else pts[1:])
            return out
        rings = [source_ring(r) for poly in polys for r in poly]
        shapes.append({"n": geom["properties"]["name"], "z": zone, "i": geom["id"], "d": rings_to_path(rings)})
    # Arcos usados por una sola provincia = contorno exterior (costa y fronteras).
    exterior = {i for i, c in all_uses.items() if c == 1}
    edges = [
        {"d": line_to_path(arcs[i]), "o": owners, "e": i in exterior, "_points": arcs[i]}
        for i, owners in edge_owners.items()
        if len(arcs[i]) >= 2
    ]
    return shapes, mainland_loop(arcs, exterior), edges


def load_world():
    """Países de Natural Earth, simplificados para el encuadre mundial contextual."""
    topo = json.loads(WORLD_TOPO.read_text())
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append(project_world(x * sx + tx, y * sy + ty))
        arcs.append(simplify(points, 1.1))

    def ring(indexes):
        out = []
        for i in indexes:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts if not out else pts[1:])
        return out

    shapes = []
    for geom in topo["objects"]["countries"]["geometries"]:
        if "id" not in geom:
            continue
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        rings = [ring(r) for poly in polys for r in poly]
        path = rings_to_path(rings)
        if path:
            shapes.append({"i": str(geom["id"]), "n": geom.get("properties", {}).get("name", ""), "d": path})
    return shapes


def mainland_loop(arcs, exterior):
    """Encadena los arcos exteriores y devuelve el anillo mayor: el contorno peninsular."""
    ends = {}
    for i in exterior:
        ends.setdefault(arcs[i][0], []).append((i, False))
        ends.setdefault(arcs[i][-1], []).append((i, True))
    pending = set(exterior)
    loops = []
    while pending:
        i = pending.pop()
        pts = list(arcs[i])
        while True:
            tail = pts[-1]
            nxt = next(((j, rev) for j, rev in ends.get(tail, []) if j in pending), None)
            if nxt is None:
                break
            j, rev = nxt
            pending.discard(j)
            seg = arcs[j][::-1] if rev else arcs[j]
            pts.extend(seg[1:])
        loops.append(pts)
    return max(loops, key=len)


def clip_y(points, y_threshold, keep_north):
    """Sutherland-Hodgman contra una horizontal en coordenadas proyectadas.
    keep_north=True conserva lo que queda por encima (menor y = más al norte)."""
    def inside(p):
        return p[1] <= y_threshold if keep_north else p[1] >= y_threshold

    def cross(a, b):
        t = (y_threshold - a[1]) / (b[1] - a[1])
        return (a[0] + t * (b[0] - a[0]), y_threshold)

    out = []
    for i, cur in enumerate(points):
        prev = points[i - 1]
        if inside(cur):
            if not inside(prev):
                out.append(cross(prev, cur))
            out.append(cur)
        elif inside(prev):
            out.append(cross(prev, cur))
    return out


def normalize(name):
    # Algunas copias publicadas de geoBoundaries llevan los topónimos UTF-8
    # interpretados como Latin-1 ("BraganÃ§a"). Recuperar el texto evita huecos
    # en el contorno portugués por distritos que no llegan a clasificarse.
    try:
        name = name.encode("latin1").decode("utf8")
    except UnicodeError:
        pass
    return "".join(c for c in unicodedata.normalize("NFD", name.lower()) if unicodedata.category(c) != "Mn")


def load_portugal(mainland):
    if PT_GEO.exists():
        geo = json.loads(PT_GEO.read_text())
        shapes = []
        segments = []
        for feat in geo["features"]:
            name = feat["properties"].get("shapeName", "")
            key = normalize(name)
            if "azores" in key or "acores" in key or "madeira" in key:
                continue
            zone = PT_ZONE.get(key)
            if not zone:
                print(f"  aviso: distrito sin zona: {name!r}")
                continue
            g = feat["geometry"]
            polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            raw_rings = [[project(lon, lat) for lon, lat in r] for poly in polys for r in poly]
            # Los segmentos sirven solo para reconocer qué arcos españoles
            # lindan con Portugal; no se incorporan al HTML final.
            for ring in raw_rings:
                segments.extend((a, b, zone) for a, b in zip(ring, ring[1:]))
            rings = [simplify(r) for r in raw_rings]
            shapes.append({"n": name, "z": zone, "i": key, "d": rings_to_path(rings)})
        return shapes, True, segments

    # Frontera real: el tramo del contorno peninsular español entre las
    # desembocaduras del Miño y del Guadiana (el de menor alcance hacia el este).
    mino, guad = project(*PT_MINO), project(*PT_GUADIANA)

    def nearest(target):
        return min(range(len(mainland)), key=lambda k: (mainland[k][0] - target[0]) ** 2 + (mainland[k][1] - target[1]) ** 2)

    a, b = sorted((nearest(mino), nearest(guad)))
    path1 = mainland[a:b + 1]
    path2 = mainland[b:] + mainland[:a + 1]
    frontier = min((path1, path2), key=lambda p: max(x for x, _ in p))
    if ((frontier[0][0] - mino[0]) ** 2 + (frontier[0][1] - mino[1]) ** 2
            > (frontier[-1][0] - mino[0]) ** 2 + (frontier[-1][1] - mino[1]) ** 2):
        frontier = frontier[::-1]  # ordenar de Miño a Guadiana

    coast = [project(lon, lat) for lon, lat in PT_COAST]  # Guadiana -> Miño
    outline = frontier + coast

    y_douro = project(0, PT_CUT_N)[1]
    y_tajo = project(0, PT_CUT_S)[1]
    pieces = [
        ("PTN", clip_y(outline, y_douro, True)),
        ("PTC", clip_y(clip_y(outline, y_douro, False), y_tajo, True)),
        ("PTS", clip_y(outline, y_tajo, False)),
    ]
    shapes = [
        {"n": PT_ZONE_NAMES[zone] + " (costa aprox.)", "z": zone, "i": zone, "d": rings_to_path([pts])}
        for zone, pts in pieces
    ]
    return shapes, False, []


def point_segment_distance_sq(point, a, b):
    px, py = point
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    size = dx * dx + dy * dy
    if size == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / size))
    qx, qy = ax + t * dx, ay + t * dy
    return (px - qx) ** 2 + (py - qy) ** 2


def tag_portugal_edges(edges, portugal_segments):
    """Marca los arcos exteriores españoles que realmente tocan Portugal.

    El TopoJSON español no etiqueta sus fronteras internacionales. Cruzarlo con
    el límite portugués real evita que la raya moderna aparezca antes de que
    exista Portugal, sin confundirla con la costa atlántica.
    """
    if not portugal_segments:
        return
    for edge in edges:
        if len(edge["o"]) != 1 or not edge["e"]:
            continue
        points = edge["_points"]
        point = points[len(points) // 2]
        distance, zone = min(
            (point_segment_distance_sq(point, a, b), z)
            for a, b, z in portugal_segments
        )
        if distance < 1.5 ** 2:  # 1.5 px ≈ 25 km; tolera fuentes distintas.
            edge["p"] = zone


def main():
    spain, mainland, edges = load_spain()
    world = load_world()
    portugal, pt_real, portugal_segments = load_portugal(mainland)
    tag_portugal_edges(edges, portugal_segments)
    mapdata = {
        "view": VIEW,
        "proj": {"lonMin": LON_MIN, "latMax": LAT_MAX, "kx": round(KX, 4), "ky": KY, "ox": OX, "oy": OY},
        "ptReal": pt_real,
        "world": world,
        "shapes": portugal + spain,  # Portugal debajo, España encima
        "edges": [{k: v for k, v in edge.items() if k != "_points"} for edge in edges],
    }
    payload = json.dumps(mapdata, ensure_ascii=False, separators=(",", ":"))
    html = HTML.read_text()
    new_html, count = re.subn(
        r"/\*__MAPDATA_START__\*/.*?/\*__MAPDATA_END__\*/",
        lambda _: f"/*__MAPDATA_START__*/{payload}/*__MAPDATA_END__*/",
        html,
        flags=re.S,
    )
    if count != 1:
        raise SystemExit(f"error: esperaba 1 marcador __MAPDATA__ en {HTML.name}, encontrados {count}")
    HTML.write_text(new_html)
    print(f"{len(spain)} provincias + {len(portugal)} piezas de Portugal ({'reales' if pt_real else 'aproximadas'})")
    print(f"payload: {len(payload) / 1024:.0f} KB -> {HTML.name}")


if __name__ == "__main__":
    main()
