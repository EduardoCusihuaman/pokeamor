# SKILL — POKÉMON BEST ART SELECTOR

## OBJETIVO
Encontrar las ilustraciones más espectaculares de cada Pokémon, priorizando belleza, arte inmersivo y referencias auténticas compatibles con Limitless Proxy.

## 1. MODOS DE BÚSQUEDA

El usuario decide cuántas cartas quiere y qué debe buscarse.

**Comandos admitidos:**
- `Bulbasaur` → Elegir su mejor ilustración.
- `Bulbasaur x3` → Buscar 3 ilustraciones diferentes.
- `Bulbasaur x5` → Buscar 5 alternativas.
- `Bulbasaur sv07-143 x3` → Buscar 3 alternativas distintas a esa carta.
- `Otra de Bulbasaur sv07-143` → Buscar 1 alternativa.
- `Mejora esta lista x3` → Buscar 3 alternativas por cada especie.
- `Busca otra más artística` → Reemplazar la selección anterior por una mejor opción diferente.

**Reglas:**
- Si no se especifica cantidad, devolver 1 carta.
- Si se proporciona una carta de referencia y se piden alternativas, excluirla de los resultados.
- No repetir cartas dentro de una misma selección.
- Respetar especies, cantidades y orden de entrada.
- Corregir errores evidentes en nombres de Pokémon.
- No sustituir especies por sus evoluciones.

## 2. BÚSQUEDA EFICIENTE

Usar Illudex MCP como fuente principal.

1. Buscar solamente el nombre oficial inglés con `search_cards`, límite inicial de 12.
2. Una búsqueda por especie única; ampliar a 24 únicamente si faltan alternativas.
3. Filtrar variantes prohibidas antes de comparar.
4. Usar `card_details` únicamente para finalistas con información incompleta.
5. Comparar ilustraciones y verificar set y numeración.
6. Consultar Limitless o bases TCG solo cuando sea necesario.

Evitar búsquedas repetidas y consultas innecesarias.

## 3. CRITERIO ARTÍSTICO

**La belleza del arte prevalece sobre rareza, precio y antigüedad.**

Prioridad orientativa:

1. Special Illustration Rare (SIR).
2. Illustration Rare (IR).
3. Promos y artes alternativos.
4. Trainer Gallery / Galarian Gallery.
5. Full Art y clásicas excepcionales.

Valorar fondos detallados, composición, color, expresividad, originalidad e integración natural del Pokémon.

Evitar fondos genéricos, contornos gruesos, efectos 3D artificiales e ilustraciones visualmente pobres.

Considerar especialmente cartas modernas de 2025–2026 y posteriores, sin descartar ilustraciones antiguas superiores.

**No elegir automáticamente la carta más rara ni la más reciente.**

## 4. RESTRICCIONES

**Prohibido:**
- Shiny, Shiny Vault y Gold Star shiny.
- Gold, Rainbow Rare, Mega y Teracristal/Tera.
- Formas regionales Alolan, Galarian, Hisuian y Paldean.
- Especies diferentes de la solicitada.
- Cartas inventadas o identificadores incorrectos.

**Permitido:**
- IR, SIR, promos y artes alternativos.
- Pokémon de entrenadores (Misty's, Rocket's, Erika's, etc.).
- EX, GX, V, VMAX y VSTAR si su arte realmente destaca y no incumplen restricciones.

## 5. VERIFICACIÓN

Verificar **en este orden**:

1. **Limitless:** comprobar la referencia en `limitlesstcg.com/cards` y que sea
   compatible con `limitlesstcg.com/tools/proxies`.
2. **TCGdex:** resolver el `printId` con la API de TCGdex
   (`https://api.tcgdex.net/v2/en/cards/{id}`) y confirmar que es la **misma
   carta** del bloque 1 (mismo set + número), no solo la especie. El nombre de
   la carta puede diferir de la especie: "Team Rocket's Rattata" es un Rattata,
   "Pikachu VMAX" es un Pikachu, "Vileplume-GX" es un Vileplume.
3. **Bases TCG:** autenticidad, expansión y numeración.

No afirmar que una importación fue comprobada si únicamente se verificó la existencia de la carta.

Si una opción no resulta compatible, elegir la siguiente mejor.

## 6. FORMATO DE RESPUESTA

Responder con **dos bloques de código**:

**Bloque 1 — Limitless** (para copiar en `limitlesstcg.com/tools/proxies`):

```text
1 Bulbasaur SCR 143
1 Bulbasaur MEG 133

1 Team Rocket's Rattata DRI 147
1 Rattata MEW 019

1 Pikachu VMAX LOR TG17
1 Pikachu CRZ GG30
```

**Bloque 2 — IDs** (printIds de TCGdex, en el MISMO orden, para la ingesta):

```text
sv07-143
me01-133

sv10-147
sv03.5-019

swsh11tg-TG17
swsh12.5gg-GG30
```

Nótese que el nombre de carta puede no ser el de la especie: `Team Rocket's
Rattata` (especie Rattata), `Pikachu VMAX` (especie Pikachu). Los IDs del
bloque 2 apuntan a esas mismas cartas.

**Reglas del bloque 1 (Limitless):**
- Una línea vacía entre cada alternativa.
- Dos líneas vacías entre especies diferentes.
- Mantener el orden original de la lista.
- Usar códigos oficiales, incluidas numeraciones TG/GG y promos.
- No incluir totales como `/189`.
- Nunca inventar cartas para completar la cantidad solicitada.
- Si no existen suficientes alternativas verificables, devolver únicamente las disponibles.

**Reglas del bloque 2 (IDs):**
- Un `printId` de TCGdex por línea, en el MISMO orden que el bloque 1.
- Resolver cada `printId` con la API de TCGdex (`https://api.tcgdex.net/v2/en/cards/{id}`);
  nunca inventarlo.
- Confirmar que cada `printId` es la **misma carta** que su línea del bloque 1
  (mismo set + número); el `dexId` confirma la especie, pero el nombre de carta
  puede diferir (ej. `sv10-147` → "Team Rocket's Rattata", especie Rattata).
- Si una carta no tiene imagen en TCGdex, omitirla del bloque 2 y avisarlo.

Máximo 3 líneas adicionales fuera de los bloques para problemas excepcionales.

## PRINCIPIO FINAL

**El usuario controla la cantidad. Illudex descubre el arte. La belleza determina la elección. Las bases TCG validan los identificadores. Limitless determina la compatibilidad.**

Prioridad absoluta: **ilustraciones inmersivas, originales y espectaculares.**