#!/usr/bin/env python3
"""Ingest user-supplied alternative card references into committed data.

Converts a plain-text list of "quantity Name SET number" references (the
Limitless Proxy export format from limitlesstcg.com/tools/proxies, also
emitted by the search-alternatives skill and the debug export) into rows in
`data/alternatives-curated.json` and new print entries in
`data/proxies.json`.

This is a NETWORK tool: it resolves each reference against the TCGdex API
to obtain the exact print id, illustration URL, rarity and illustrator.
The regular build (`bash scripts/build.sh`) remains offline and never
queries APIs.

Usage:
  python scripts/ingest-alternatives.py <input.txt> [--apply] [--ids]

Without `--apply` it is a dry run: it resolves every line and prints a
report. With `--apply` it merges the resolved alternatives into the data
files, preserving existing rows and proxy entries.

`--ids` reads TCGdex print ids (one per line) instead of `Name SET number`.
Each id is fetched and verified but not re-resolved from set+number. A
species name may prefix the id for cross-checking (`Vulpix sv03.5-037`).

Input format (one card per line; grouping is irrelevant):

  Bulbasaur SCR 143
  Bulbasaur MEG 133
  Pikachu CRZ GG30
  Team Rocket's Rattata DRI 147

- "Name" is the Pokémon species (or a card name such as "Team Rocket's X").
- "SET" is an official PTCG set code (SCR, MEW, MEG, PGO, SVP, PFL, ...).
- "number" is the card number: numeric, or GGxx/TGxx for gallery prints.

A leading integer (the "1 " the debug export prefixes each line with) is
ignored. Blank lines and `#` comments are skipped.

After ingestion, build and validate:
  bash scripts/build.sh
  python scripts/validate-card-resources.py
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / 'data' / 'catalog.json'
ALTERNATIVES_PATH = ROOT / 'data' / 'alternatives-curated.json'
PROXIES_PATH = ROOT / 'data' / 'proxies.json'

# Official PTCG set code -> TCGdex set id. Extend as new sets are ingested.
SET_TO_SETID = {
    'SCR': 'sv07',      # Stellar Crown
    'MEW': 'sv03.5',    # 151
    'MEG': 'me01',      # Mega Evolution
    'PGO': 'swsh10.5',  # Pokémon GO
    'SVP': 'svp',       # Scarlet & Violet Black Star Promos
    'PR-SV': 'svp',     # Limitless code for the same S&V promos
    'PFL': 'me02',      # Phantasmal Flames
    'BRS': 'swsh9',     # Brilliant Stars
    'JTG': 'sv09',      # Journey Together
    'RCL': 'swsh2',     # Rebel Clash
    'DAA': 'swsh3',     # Darkness Ablaze
    'FST': 'swsh8',     # Fusion Strike
    'CRI': 'sm4',       # Crimson Invasion
    'VIV': 'swsh4',     # Vivid Voltage
    'CRE': 'swsh6',     # Chilling Reign
    'ASR': 'swsh10',    # Astral Radiance
    'OBF': 'sv03',      # Obsidian Flames
    'LOR': 'swsh11',    # Lost Origin
    'POR': 'me03',      # Perfect Order
    'DRI': 'sv10',      # Destined Rivals
    'TEF': 'sv05',      # Temporal Forces
    'BST': 'swsh5',     # Battle Styles
    'CRZ': 'swsh12.5',  # Crown Zenith
    'PAL': 'sv02',      # Paldea Evolved
    'ASC': 'me02.5',    # Ascended Heroes
    'CEC': 'sm12',      # Cosmic Eclipse
    'BKT': 'xy8',       # BREAKthrough
    'TEU': 'sm9',       # Team Up
    'MEP': 'mep',       # MEP Black Star Promos
    'BKP': 'xy9',       # BREAKpoint
    'TWM': 'sv06',      # Twilight Masquerade
    'SSP': 'sv08',      # Surging Sparks
}

# Gallery prints whose TCGdex `image` is missing (TCGdex has no asset for
# them). number prefix -> (TCGdex set id, pokemontcg.io set code).
GALLERY = {
    'GG': ('swsh12.5gg', 'swsh12pt5gg'),  # Crown Zenith Galarian Gallery
}

# Trainer Gallery prints. Base set code -> (TCGdex tg set id, pokemontcg code).
TRAINER_GALLERY = {
    'LOR': ('swsh11tg', 'swsh11tg'),  # Lost Origin
    'BRS': ('swsh9tg', 'swsh9tg'),    # Brilliant Stars
    'ASR': ('swsh10tg', 'swsh10tg'),  # Astral Radiance
    'SIT': ('swsh12tg', 'swsh12tg'),  # Silver Tempest
}

# Reverse map: TCGdex set id -> Limitless set code (for --ids mode, where the
# input is a print id and the proxy's `set` field must be reconstructed).
SETID_TO_CODE = {}
for _code, _setid in SET_TO_SETID.items():
    SETID_TO_CODE.setdefault(_setid, _code)
SETID_TO_CODE['swsh12.5gg'] = 'CRZ'  # Crown Zenith Galarian Gallery
for _code, (_setid, _pcode) in TRAINER_GALLERY.items():
    SETID_TO_CODE[_setid] = _code

USER_AGENT = 'pokeamor-ingest/1.0'
MAX_ALTERNATIVES = 3  # Keep in sync with build-card-resources.py and card-resources.js.

# Card-name suffix to strip when matching an input name back to a species
# (Limitless lists print "Venusaur ex", "Charizard VSTAR", etc.).
CARD_SUFFIX = re.compile(r'[\s-]+(?:ex|gx|v|vmax|vstar|break|prime|lv\.x|v-union)\s*$',
                         re.IGNORECASE)


def load_json(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.load(resp)
    except Exception as exc:  # noqa: BLE001 - report network/API failures verbatim
        return {'_error': f'{type(exc).__name__}: {exc}'}


def fetch_card(print_id):
    return fetch(f'https://api.tcgdex.net/v2/en/cards/{print_id}')


def number_variants(number):
    """Ordered candidate number suffixes to try for a TCGdex print id.

    Older sets number without padding (`swsh2-2`); newer sets pad to three
    digits (`sv03.5-027`, `me01-068`). Try as-given, stripped, then padded.
    """
    if not number.isdigit():
        return [number]  # gallery prints (GG30, TG17) are already exact
    variants = []
    for candidate in (number, number.lstrip('0') or '0', number.zfill(3)):
        if candidate not in variants:
            variants.append(candidate)
    return variants


def resolve_print(set_code, number):
    """Resolve (set code, number) to a print id and its TCGdex card.

    Returns (print_id, set_id, card) or (None, None, None).
    """
    upper = number.upper()
    if upper.startswith('GG'):
        entry = GALLERY.get('GG')
    elif upper.startswith('TG'):
        entry = TRAINER_GALLERY.get(set_code)
    else:
        set_id = SET_TO_SETID.get(set_code)
        entry = (set_id, None) if set_id else None

    if not entry:
        return None, None, None
    set_id = entry[0]
    for candidate in number_variants(number):
        print_id = f'{set_id}-{candidate}'
        card = fetch_card(print_id)
        if '_error' not in card and card.get('name'):
            return print_id, set_id, card
    return None, set_id, None


def image_url(set_id, number, card):
    img = card.get('image')
    if img:
        return f'{img}/high.webp'
    # TCGdex has no asset for gallery prints; fall back to pokemontcg.io.
    for entry in (*GALLERY.values(), *TRAINER_GALLERY.values()):
        if entry[0] == set_id:
            return f'https://images.pokemontcg.io/{entry[1]}/{number}_hires.png'
    return None


def build_species_index(catalog):
    index = {}
    for pokemon in catalog:
        key = pokemon['name'].strip().lower()
        index.setdefault(key, pokemon['id'])
    return index


def species_id(name, index):
    """Map a (possibly noisy) name to a catalog Pokémon id, or None.

    Tolerates a leading count/order prefix ("1 Bulbasaur"), the
    "Team Rocket's " card-name prefix, and card-name suffixes
    ("Venusaur ex", "Charizard VSTAR").
    """
    candidate = re.sub(r'^\d+\s+', '', name.strip().lower())
    if not candidate:
        return None
    base = candidate
    for prefix in ('team rocket\u2019s ', "team rocket's "):
        if base.startswith(prefix):
            base = base[len(prefix):]
            break
    for key in (base, CARD_SUFFIX.sub('', base).strip()):
        found = index.get(key)
        if found:
            return found
    return None


def parse_line(line, known_sets):
    """Parse one input line into (name, set_code, number), or None."""
    tokens = line.split()
    if len(tokens) < 2:
        return None
    number = tokens[-1]
    if not number.isdigit():
        number = number.upper()
    set_code = tokens[-2].upper()
    if set_code not in known_sets:
        return None
    name = ' '.join(tokens[:-2])
    return name, set_code, number


def build_row(print_id, number, set_code, card, image):
    return {
        'printId': print_id,
        'image': image,
        'rarity': card.get('rarity') or '',
        'artist': card.get('illustrator') or '',
        'enabled': True,
        'reviewStatus': 'user-selected',
        'technicalCheck': {
            'source': 'Exact user-selected print; resolved via TCGdex API',
            'imageDecoded': bool(image),
            'language': 'en',
        },
    }


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    input_path = Path(argv[1])
    apply_flag = '--apply' in argv[2:]
    ids_mode = '--ids' in argv[2:]

    catalog = load_json(CATALOG_PATH)
    species = build_species_index(catalog)
    names = {p['id']: p['name'] for p in catalog}
    principal = {p['id']: p['card'] for p in catalog}
    existing_proxies = load_json(PROXIES_PATH)

    known_sets = set(SET_TO_SETID) | set(TRAINER_GALLERY) | set(GALLERY)

    resolved = {}          # pokemon id -> list of rows (dicts)
    new_proxies = {}       # print id -> {name, set, number}
    problems = []          # (line, reason)
    principal_dups = []    # (pokemon id, print id)

    lines = [ln.rstrip('\n') for ln in input_path.read_text(encoding='utf-8').splitlines()]
    for lineno, raw in enumerate(lines, 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if ids_mode:
            parts = line.split()
            print_id = parts[-1]
            name = ' '.join(parts[:-1]) if len(parts) > 1 else None
            if '-' not in print_id:
                problems.append((lineno, f'printId inválido: {line!r}'))
                continue
            set_id, number = print_id.rsplit('-', 1)
            set_code = SETID_TO_CODE.get(set_id, '')
            card = fetch_card(print_id)
            if '_error' in card or not card.get('name'):
                problems.append((lineno, f'carta no encontrada: {print_id}'))
                continue
        else:
            parsed = parse_line(line, known_sets)
            if not parsed:
                problems.append((lineno, f'no se pudo parsear: {line!r}'))
                continue
            name, set_code, number = parsed
            print_id, set_id, card = resolve_print(set_code, number)
            if card is None:
                problems.append((lineno, f'carta no resuelta: {name} {set_code} {number}'))
                continue
        dex_ids = card.get('dexId') or []
        if not dex_ids:
            problems.append((lineno, f'"{card.get("name")}" no es una carta de Pokémon'))
            continue
        pid = dex_ids[0]
        if pid not in names:
            problems.append((lineno, f'dexId {pid} fuera de rango para "{card.get("name")}"'))
            continue
        intended = species_id(name, species) if name else None
        if intended is not None and intended != pid:
            problems.append((lineno,
                             f'{print_id} es "{card.get("name")}" '
                             f'(dijiste {name}, pero es {names[pid]})'))
            continue
        if print_id == principal[pid]:
            principal_dups.append((pid, print_id))
            continue
        image = image_url(set_id, number, card)
        if not image:
            problems.append((lineno, f'sin URL de imagen para {print_id}'))
            continue
        row = build_row(print_id, number, set_code, card, image)
        resolved.setdefault(pid, []).append(row)
        new_proxies[print_id] = {
            'name': card.get('name', ''),
            'set': set_code,
            'number': number.lstrip('0') if number.isdigit() else number,
        }
        time.sleep(0.05)  # be gentle with the TCGdex API

    # Report
    total = sum(len(rows) for rows in resolved.values())
    print('=== Resolución ===')
    for pid in sorted(resolved):
        for row in resolved[pid]:
            print(f'  OK  {species_index_name(catalog, pid)}  {row["printId"]}  ({row["rarity"]})')
    for lineno, reason in problems:
        print(f'  ERROR línea {lineno}: {reason}')
    for pid, print_id in principal_dups:
        print(f'  DUP  {species_index_name(catalog, pid)}  {print_id} (es la principal)')

    print('\n=== Resumen ===')
    print(f'Pokémon con alternativas: {len(resolved)}')
    print(f'Alternativas resueltas:    {total}')
    print(f'Duplicados de principal:    {len(principal_dups)}')
    print(f'Proxies nuevos:             {sum(1 for p in new_proxies if p not in existing_proxies)}')
    print(f'Errores:                    {len(problems)}')

    over_cap = [pid for pid, rows in resolved.items() if len(rows) > MAX_ALTERNATIVES]
    if over_cap:
        print(f'\nADVERTENCIA: más de {MAX_ALTERNATIVES} alternativas en: '
              f'{", ".join(str(p) for p in over_cap)}')

    if not apply_flag:
        print('\n(dry run: pasá --apply para escribir los archivos)')
        return 1 if problems else 0

    if problems:
        print('\nNo se aplica: hay errores. Corregí el input y volvé a correr.')
        return 1

    # Merge into alternatives-curated.json (union by printId, preserving order).
    curated = load_json(ALTERNATIVES_PATH)
    pokemon = curated.get('pokemon', {})
    for pid, rows in resolved.items():
        key = str(pid)
        existing = pokemon.get(key, [])
        seen = {r['printId'] for r in existing}
        for row in rows:
            if row['printId'] not in seen:
                existing.append(row)
                seen.add(row['printId'])
        if existing:
            pokemon[key] = existing
    curated['pokemon'] = pokemon
    with open(ALTERNATIVES_PATH, 'w', encoding='utf-8') as fh:
        json.dump(curated, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    # Merge into proxies.json (never overwrite existing entries).
    proxies = existing_proxies
    for print_id, info in new_proxies.items():
        if print_id not in proxies:
            proxies[print_id] = info
    with open(PROXIES_PATH, 'w', encoding='utf-8') as fh:
        json.dump(proxies, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

    print(f'\nAplicado: {total} alternativas, {len(new_proxies)} proxies.')
    print('Ahora corré:  bash scripts/build.sh')
    return 0


def species_index_name(catalog, pid):
    for p in catalog:
        if p['id'] == pid:
            return p['name']
    return str(pid)


if __name__ == '__main__':
    sys.exit(main(sys.argv))
