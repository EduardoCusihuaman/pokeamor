# Physical card surfaces

Current coverage: **zero verified per-print optical materials**. The app displays the original image without additional foil, grain, etching, glare, or rainbow overlays. Motion controls affect geometry only. Love/pass feedback is an interaction cue and is independent of physical material.

Catalog `surface` explicitly records scope (`physical`, `digital`, `artwork`), status (`unverified`, `not-applicable`) and `effect: none`. Legacy `holo` and `special` heuristics were removed. A Pocket illustration is not treated as evidence of a physical printing.

Before enabling foil for an individual card, establish its precise card ID, language and selected printing; a reliable reference for that printing; the physical finish (non-foil, holo, reverse, embossed, etc.); and matching masks/textures for its reflective regions and relief. Validate visually against the reference. Missing evidence means no optical effect. Do not infer optical materials from rarity or from the existence of a holo variant.

TCGdex's `variants` indicates which printings exist, not which printing a catalog image depicts. These fields cannot determine the foil mask, optical response, or embossing map. Pokémon's own descriptions distinguish patterns by expansion and printing.

References:
- https://tcgdex.dev/faq#how-do-normal--reverse--holo-variants-work
- https://tcgdex.dev/es/reference/card
- https://www.pokemon.com/uk/news/pokemon-tcg-scarlet-and-violet-revamps-pokemon-tcg-card-aesthetic
- https://press.pokemon.com/en/MEDIA-ALERT-Pokemon-Trading-Card-Game-Scarlet-VioletShrouded-Fable-Exp
