# Optional card resources

`python build-worker.py` deterministically builds optional resources from committed data. No network is used by this build. `scripts/build.sh` regenerates the Worker and validates resources before packaging.

- `data/alternatives-curated.json`: explicit alternatives, at most two per species; includes verification evidence.
- `data/card-metadata/proxies.json`: cumulative print-to-export mappings. Preserve historical entries.
- `data/proxy-overrides.json`: explicit corrections take precedence.
- `generated/card-resources/`: append-only content-addressed resources. NEVER delete previously published hashed files. All retained versions are embedded server-side, not in browser JavaScript. Requested resources are also backed up to R2 under `card-resources/data/...`. No profile data is stored there.

## User-managed artwork review

Artwork selection belongs to the user. No automatic artwork reviewer or candidate selector is provided. The existing 41 alternatives remain enabled, explicitly marked `reviewStatus: pending-user`, not approved. Technical checks (JSON identity, image decoding, export mapping) do not constitute artwork approval. No main catalog print is replaced by this change.

In Settings → debug catalog, Principales shows the current 1,025 species; Alternativas explicitly loads and displays the existing alternative prints. Both views share exact-print selection and Limitless export. The user can send the selected list for subsequent explicit edits. Selecting a print does not approve, remove or change it.

After user-supplied changes, edit the explicit rows in `data/alternatives-curated.json`; `enabled` controls availability and `reviewStatus` records the user's review. Never generate approval from rarity, name, color or an AI assessment. Keep historical proxy mappings. Build with `python build-worker.py` and validate with `python scripts/validate-card-resources.py`.

Runtime has no TCGdex metadata requests. Alternatives begin idle loading at six likes; one image is prepared at a time. Failed images are excluded for five minutes; one automatic retry is scheduled after 30 seconds. Event cadence and preference weights remain unchanged. Print construction clears inherited print-specific metadata. Unverified materials use no foil.

Proxies load on debug entry, are single-flight and memory-cached. Selection is keyed by exact print, independent of species preferences. Missing mappings block the complete copy. The table is optional and never enters the recommender Worker. Clipboard failure provides selectable text.

The legacy `-alternates` localStorage value is discarded; profile/history remain. Reset increments a generation so old pending preparation cannot reappear. A session pins its injected manifest. Files hash canonical content; shared dataVersion hashes payloads before envelope creation (avoids circular hash).

## Validation limits

Existing data contains 41 alternatives for 38 species from 53 conservative candidates. Spanish images decoded successfully; artwork was not exhaustively visually reviewed. 51 main catalog species still have no proxy mapping. Existing main art choices are outside this change's scope. Two explicit Limitless examples are tested; full third-party parser compatibility and actual iPhone clipboard/slow-network UX require device QA.
