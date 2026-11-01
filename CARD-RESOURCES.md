# Optional card resources

`python build-worker.py` deterministically builds optional resources from committed data. No network is used by this build. `scripts/build.sh` regenerates the Worker and validates resources before packaging.

- `data/alternatives-curated.json`: approved alternatives, at most two per species; includes verification evidence.
- `data/card-metadata/proxies.json`: cumulative print-to-export mappings. Preserve historical entries.
- `data/proxy-overrides.json`: explicit corrections take precedence.
- `generated/card-resources/`: append-only content-addressed resources. NEVER delete previously published hashed files. All retained versions are embedded server-side, not in browser JavaScript. Requested resources are also backed up to R2 under `card-resources/data/...`. No profile data is stored there.

## Prepare new alternatives (maintenance only)

```
python scripts/prepare-alternatives.py --cards /absolute/path/to/tcgdex-graphql-cards.json --sets /absolute/path/to/tcgdex-set-metadata.json
python build-worker.py
python scripts/validate-card-resources.py
```

The cards input has shape `{data:{cards:[{id,name,rarity,dexId,image,category}]}}`; sets input is keyed by set ID, with verified official/TCG Online codes. Preparation queries Spanish TCGdex detail and validates actual Spanish WebP decoding (Pillow required only for maintenance). It uses a conservative ordinary Illustration Rare, single-dex, exact species-name whitelist. SIR/ex, shiny rarities, named regional forms and tag teams are excluded, even if some would have been valid. Only verified successful images enter the curated file. A rarity/name filter is not a full visual audit. Future uncertain candidates must stay unapproved; do not broaden these rules without review.

Runtime has no TCGdex metadata requests. Alternatives begin idle loading at six likes; one image is prepared at a time. Failed images are excluded for five minutes; one automatic retry is scheduled after 30 seconds. Event cadence and preference weights remain unchanged. Print construction clears inherited print-specific metadata. Unverified materials use no foil.

Proxies load on debug entry, are single-flight and memory-cached. Selection is keyed by exact print, independent of species preferences. Missing mappings block the complete copy. The table is optional and never enters the recommender Worker. Clipboard failure provides selectable text.

The legacy `-alternates` localStorage value is discarded; profile/history remain. Reset increments a generation so old pending preparation cannot reappear. A session pins its injected manifest. Files hash canonical content; shared dataVersion hashes payloads before envelope creation (avoids circular hash).

## Validation limits

Initial preparation accepted 41 alternatives for 38 species from 53 conservative candidates. Spanish images decoded successfully; artwork was not exhaustively visually reviewed. 51 main catalog species still have no proxy mapping. Existing main art choices are outside this change's scope. Two explicit Limitless examples are tested; full third-party parser compatibility and actual iPhone clipboard/slow-network UX require device QA.
