# Per-print card surfaces

The catalog contains 529 matched Spanish standard printings with per-card TCGL material assets exported by Malie.io, and 32 confirmed standard nonfoil printings. Other entries keep their original artwork without an optical effect. Counts describe this catalog snapshot, not all cards ever printed.

## Matching and evidence

`scripts/import-malie.py` matches the exact TCGdex set, collector number, Spanish language and TCGL standard printing. It rejects ambiguous matches, verifies the Pokémon name and excludes SHINY-tagged printings. `materials-evidence.json` records the source export hash, printing ID, language, foil type, mask type and original URLs. `materials.json` is the fixed server-side asset whitelist. Re-run the importer to rebuild these and the catalog; its download cache is outside the repository.

A selected material uses the front image, foil plate and (when etched) engraving image from the same Spanish printing. The original TCGdex image displays immediately while the aligned front loads. A bounded shared asset pool preloads the current card plus three upcoming cards, including front, foil and etching. A ready front is used synchronously; rapid navigation reuses in-flight and completed downloads instead of restarting them. At most four requests run at once, visible assets have priority, and old blobs/object URLs are evicted beyond 16 MiB or 20 entries. Data Saver reduces lookahead to one card. Optical rendering waits for that exact front. Missing, unsupported or failed material never activates a guessed finish. Gallery thumbnails use the lightweight original images.

## Rendering

`material-renderer.js` uses one reusable WebGL canvas for the current card. It samples the real reflective-area plate and derives surface normals from the actual etching texture. The material type controls the reflection direction and spectral bands: SUN_PILLAR, SV_ULTRA, SV_HOLO and FLAT_SILVER are supported. The renderer is an original approximation of light response, not the proprietary TCGL shader or a measured physical BRDF. Actual textures provide the per-print spatial pattern; they alone do not guarantee an exact physical reproduction.

Finger movement controls the reflection. The optional motion control requests sensor permission on a user gesture, calibrates the resting pose and smoothly steers reflection and tilt. It never casts a vote. Reduced motion, hidden pages and open sheets stop rendering. Scene decoding is cancelled and GPU textures/bitmaps are released when a card changes. Shared downloads continue for reuse, while obsolete queued requests are removed. Missing WebGL, context loss or download errors preserve readable card art.

## Asset delivery

The Worker only fetches known, versioned `/materials/` paths. Requests identify the app with a descriptive `Pokeamor/1.0` User-Agent. Successful PNG responses are validated, size limited and cached at the edge and in the existing R2 bucket under `material-cache/`; simultaneous cold requests share one upstream download; session data uses a separate prefix. Errors and HTML denial pages are never cached as images. This avoids browser hotlink dependence; it does not guarantee that an upstream provider will always allow requests.

## Validation and limits

Tests cover lookahead reuse, bounded memory, concurrent download sharing, edge caching, retryable failures, exact print matching, nonfoil and unverified fallbacks, route whitelisting, caching, denied downloads, motion lifecycle and existing swipe/sync behavior. The actual shader compiles and renders against a downloaded Spanish foil/etch pair in an offscreen GLES2 test. The managed browser preview service was unavailable during this update. Physical iPhone Safari appearance, sensor behavior and GPU performance still need a device check.

Sources and attribution:
- Malie.io / nago static exports: https://malie.io/static/
- Export index: https://cdn.malie.io/file/malie-io/tcgl/export/index.json
- Cloudflare Error 1010 documentation: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/
- Pokémon TCG Live assets belong to their respective rights holders. Malie.io attribution is also shown in the app collection view.
