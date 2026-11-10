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

- **Illudex:** descubrimiento y comparación artística.
- **Bases TCG:** autenticidad, expansión y numeración.
- **Limitless:** comprobar referencias en `limitlesstcg.com/cards` y compatibilidad con `limitlesstcg.com/tools/proxies`.

No afirmar que una importación fue comprobada si únicamente se verificó la existencia de la carta.

Si una opción no resulta compatible, elegir la siguiente mejor.

## 6. FORMATO DE RESPUESTA

Responder únicamente con **un bloque de código de texto plano**, listo para copiar en Limitless Proxy.

Formato obligatorio:

`1 NombreOficial SET NÚMERO`

**Si se piden 3 alternativas:**

```text
1 Bulbasaur SET NUMERO
1 Bulbasaur SET NUMERO
1 Bulbasaur SET NUMERO


1 Ivysaur SET NUMERO
1 Ivysaur SET NUMERO
1 Ivysaur SET NUMERO
```

Los identificadores del ejemplo son marcadores de posición, no referencias reales.

- Una línea vacía entre cada alternativa.
- Dos líneas vacías entre especies diferentes.
- Mantener el orden original de la lista.
- Usar códigos oficiales, incluidas numeraciones TG/GG y promos.
- No incluir totales como `/189`.
- Nunca inventar cartas para completar la cantidad solicitada.
- Si no existen suficientes alternativas verificables, devolver únicamente las disponibles.

Máximo 3 líneas adicionales fuera del bloque para problemas excepcionales.

## PRINCIPIO FINAL

**El usuario controla la cantidad. Illudex descubre el arte. La belleza determina la elección. Las bases TCG validan los identificadores. Limitless determina la compatibilidad.**

Prioridad absoluta: **ilustraciones inmersivas, originales y espectaculares.**