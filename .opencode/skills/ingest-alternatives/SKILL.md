---
name: Ingest Alternatives
description: Ingresar la lista de cartas alternativas que da el usuario (formato "Nombre SET número") y actualizar alternatives-curated.json + proxies.json, resolviendo cada carta contra TCGdex y validando el build.
---

# Ingest Alternatives

Convierte una lista de cartas que pasa el usuario en **alternativas curadas** para Pokéamor.

El usuario entrega cartas en formato *Limitless* (el mismo que exporta el modo
depuración): una por línea, `Nombre SET número`.

```
Bulbasaur SCR 143
Pikachu CRZ GG30
Team Rocket's Rattata DRI 147
```

## Script

El trabajo pesado es `scripts/ingest-alternatives.py` (resuelve contra la API
de TCGdex, arma las filas y registra proxies). Es una herramienta **con red**,
a diferencia del build (`bash scripts/build.sh`) que es offline.

```sh
python scripts/ingest-alternatives.py <lista.txt>       # dry run, solo reporta
python scripts/ingest-alternatives.py <lista.txt> --apply  # escribe los archivos
```

## Loop completo

1. **Recibir la lista** del usuario y guardarla en un `.txt`.
2. **Dry run** y revisar el reporte. El script distingue:
   - `OK` — resuelta.
   - `DUP` — es la carta principal actual (se excluye sola; no es error).
   - `ERROR` — referencia inválida (carta no existe, set desconocido, nombre no encontrado). **No la corrijas en silencio**: preguntale al usuario o proponé el reemplazo y esperá su OK.
3. **Corregir** los `ERROR` del input con el usuario.
4. **`--apply`** y confirmar "Aplicado".
5. **Build + validación + tests:**
   ```sh
   bash scripts/build.sh
   python scripts/validate-card-resources.py
   node --test tests/*.test.cjs tests/*.test.mjs
   ```
6. **Verificar en browser** (Playwright o el navegador): abrir depuración →
   "Alternativas" y confirmar que cargan (`getStatus().alternatives === 'ready'`
   y el conteo coincide).

## Convenciones y gotchas

- **Mapeo de sets**: el código oficial (`SCR`, `MEW`, `MEG`, …) → ID de TCGdex
  está en `SET_TO_SETID` dentro del script. Para un set nuevo, agregalo ahí.
- **Cartas *gallery*** (`GG30`, `TG17`): TCGdex **no tiene imagen** (`image: null`).
  El script cae automáticamente a `images.pokemontcg.io`. No borres ese fallback.
- **Números con/sin relleno**: TCGdex usa `swsh2-2` (no `swsh2-002`) en sets
  viejos y `sv03.5-004` (relleno) en los nuevos. El script prueba ambos.
- **"Team Rocket's X"** y prefijo de conteo (`1 Bulbasaur`) se normalizan al
  nombre de especie.
- **Duplicados de la principal**: se excluyen siempre (política del repo).
- **Límite de 3 alternativas por especie**: está hardcodeado en **cuatro**
  lugares y deben quedar sincronizados:
  - `scripts/build-card-resources.py` → `len(accepted)<=3`
  - `src/card-resources.js` → `rows.length>3`
  - `tests/15-alternatives.test.cjs` → `rows.length<=3`
  - `scripts/ingest-alternatives.py` → `MAX_ALTERNATIVES`
  Si alguna vez lo cambiás, actualizá los cuatro y corré los tests.
- **Formato de fila** (en `alternatives-curated.json`): `printId`, `image`,
  `rarity`, `artist`, `enabled: true`, `reviewStatus: "user-selected"`, y
  `technicalCheck` con `imageDecoded` truthy. El build y el test `15-` lo validan.
- **`proxies.json` es acumulativo**: nunca borres entradas históricas; el script
  solo agrega.

## No automatizar

La decisión de **qué hacer con una referencia inválida** (corregirla, buscar otra
ilustración, o descartarla) es del usuario. El script reporta; no adivina.
