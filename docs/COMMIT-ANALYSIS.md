# Pokeamor — Commit Analysis & Conventional Commit Refactor Plan

This document maps every commit in the repository (201 commits) to:

1. **What** changed (from the actual diff), and
2. **Why** it changed (inferred from the diff, file names, test names, and design docs), and
3. A **suggested conventional commit** message.

All 201 commits share the same author (`Codex <codex@openai.com>`) and the same generic message
`Update Site source`, so this document is the source of truth for a later history rewrite
(e.g. with `git filter-repo` / `git rebase`) into conventional commits.

> **Note on scope:** this is a Pokémon-themed card/collection microsite ("pokeamor") built on the
> "Sites Worker ESM starter". Key files: `app.js` (frontend logic), `page.html` (markup/UI),
> `worker/index.js` (server/worker), feature modules (`holo.js`, `material-renderer.js`,
> `journey.js`, `recommender.js`, `card-identity.js`, `card-resources.js`, `resource-coordinator.js`,
> `discovery-buffer.js`), `*.test.*` (tests), `*.md` (design docs), and data/generated assets.

---

## Overview

| Date | Commits | Themes |
|------|---------|--------|
| 2026-10-30 | 18 | Bootstrap; swipe UI; haptics/sound; palette scenes; holo foil (added then reverted); verified material rendering |
| 2026-10-31 | 14 | Art selections; journey/progress; collection redesign; sync |
| 2026-11-01 | 77 | Journey/album polish; recommendations; refinement duels; card-resources pipeline; debug proxy tooling |
| 2026-11-07 | 15 | Album navigation rework; batch export |
| 2026-11-08 | 53 | Album preview motion; swipe flight; refinement/battle gestures; material perf; card data waves |
| 2026-11-09 | 22 | Resource coordinator; card identity; battle entrance/polish |

---

## Quick Reference (hash → conventional commit)

| # | Hash | Date | Conventional commit |
|---|------|------|---------------------|
| 1 | f91c179 | 2026-10-30 | feat(app): initial Pokéamor microsite scaffold |
| 2 | 2413c0a | 2026-10-30 | fix(build): simplify r2 binding in hosting.json |
| 3 | c406253 | 2026-10-30 | feat(app): card-first swipe layout with under-card |
| 4 | 306515f | 2026-10-30 | feat(app): add haptics and sound settings |
| 5 | 14c733c | 2026-10-30 | feat(app): ambient palette scene and decision glow |
| 6 | 03e6127 | 2026-10-30 | feat(app): light theme with heart-to-collection animation |
| 7 | f19e191 | 2026-10-30 | feat(app): fit card to artwork ratio with paper edge |
| 8 | 4a61ee7 | 2026-10-30 | feat(app): SVG heart/cross decision badges |
| 9 | 5f642e5 | 2026-10-31 | fix(app): swap stamp left/right positioning |
| 10 | e2ad452 | 2026-10-31 | style(app): center choice badge on card |
| 11 | 5f3d96f | 2026-10-30 | fix(app): disable catalog caching and restore under-card |
| 12 | 4250735 | 2026-10-30 | feat(app): reconcile multi-device sync with timestamps |
| 13 | 5053ebd | 2026-10-30 | feat(data): use Spanish TCGdex images with language tag |
| 14 | f658106 | 2026-10-30 | feat(app): undo returns card with direction animation |
| 15 | 73373c3 | 2026-10-30 | feat(holo): WebGL foil overlay with motion sensor |
| 16 | 377aff7 | 2026-10-30 | feat(holo): metallic diffraction finishes per rarity |
| 17 | ae8dc0c | 2026-10-30 | revert(holo): remove unverified foil in favor of original art |
| 18 | 6a0190c | 2026-10-30 | feat(material): render verified TCGL foil materials |
| 19 | 7968471 | 2026-10-30 | feat(material): shared lookahead asset cache with edge cache |
| 20 | 5bd582a | 2026-10-30 | revert(worker): drop Cache API edge caching for R2 route |
| 21 | 111b2d7 | 2026-10-31 | feat(art): add art-selections policy and 6 card swaps |
| 22 | 3e6a3e1 | 2026-10-31 | feat(art): replace rainbow VMAX card artwork |
| 23 | 49e9b09 | 2026-10-31 | feat(art): replace metallic TURBO/BREAK artwork |
| 24 | 0f5203c | 2026-10-31 | feat(journey): add progress, milestones and playmat |
| 25 | c2b0c7c | 2026-10-31 | feat(journey): refine round ring and reward preview |
| 26 | 2f64821 | 2026-10-31 | feat(journey): add team slots and batch memories |
| 27 | 7c143d6 | 2026-10-31 | style(app): use SVG hearts in counter and stamp |
| 28 | 8aec1e8 | 2026-10-31 | feat(app): redesign collection with card detail |
| 29 | 83fb667 | 2026-10-31 | feat(app): add detail swipe navigation |
| 30 | 06fd2c6 | 2026-10-31 | feat(app): add rounds/liked collection switch |
| 31 | e25e9c6 | 2026-10-31 | refactor(journey): group favorites into like-only batches |
| 32 | 97fef53 | 2026-10-31 | feat(journey): base round progress on likes |
| 33 | 9acfff4 | 2026-10-31 | feat(journey): persist batches and add placeholders |
| 34 | 2f31b75 | 2026-10-31 | refactor(app): surface settings panel in collection |
| 35 | 4cf78bc | 2026-11-01 | feat(journey): batch-based tanda progress with undo-safe rewards |
| 36 | 03708a8 | 2026-11-01 | feat(app): viewer open/close origin animation |
| 37 | cd16858 | 2026-11-01 | feat(app): full-screen viewer with swipe gestures |
| 38 | 761006d | 2026-11-01 | feat(app): holo material in card viewer |
| 39 | 57d7280 | 2026-11-01 | feat(app): viewer neighbor cards for browsing |
| 40 | 4d0c6a3 | 2026-11-01 | feat(app): settle animation for viewer swipe |
| 41 | ccce0ca | 2026-11-01 | refactor(app): scroll-snap viewer carousel |
| 42 | 71edb4f | 2026-11-01 | fix(app): origin animation after carousel refactor |
| 43 | 3c57962 | 2026-11-01 | perf(app): smoother drag physics and art prewarm |
| 44 | 63440ca | 2026-11-01 | feat(journey): album search and expandable batches |
| 45 | 8723757 | 2026-11-01 | refactor(journey): album density toggle replaces search |
| 46 | 425cd96 | 2026-11-01 | feat(app): album index scrubber with preview |
| 47 | 363dbd1 | 2026-11-01 | refactor(app): scrubber grip follows section scroll |
| 48 | ad78b60 | 2026-11-01 | refactor(app): scrubber landing and scroll throttling |
| 49 | d870588 | 2026-11-01 | perf(journey): low-res thumbnails and preview cache |
| 50 | 6faa1a3 | 2026-11-01 | feat(app): album settings toggle and compact grid |
| 51 | 6f78deb | 2026-11-01 | style(app): hide scrollbars for native scrolling |
| 52 | fc178f1 | 2026-11-01 | feat(journey): live-scroll scrub and completion feedback |
| 53 | 8c7622f | 2026-11-01 | feat(app): staged delete-all confirmation |
| 54 | d3dd65f | 2026-11-01 | feat(app): melodic oscillator sound cues |
| 55 | e84a052 | 2026-11-01 | style(app): tune tones and settings controls |
| 56 | d8479d4 | 2026-11-01 | feat(journey): completion chime on batch round |
| 57 | 905b6e4 | 2026-11-01 | perf(journey): lazy tile cache and art fallback chain |
| 58 | ace7bd2 | 2026-11-01 | chore(journey): internal memories() tweak |
| 59 | 75a69f8 | 2026-11-01 | feat(app): album seen-counter in header |
| 60 | 47ad35a | 2026-11-01 | feat(app): progress-driven tanda glow |
| 61 | 7c9957a | 2026-11-01 | feat(resources): adaptive queue and alternate-art encounters |
| 62 | 5f0eefc | 2026-11-01 | feat(app): add front refine button to open duelsheet |
| 63 | 3448ae8 | 2026-11-01 | style(app): adjust front-refine padding and offset |
| 64 | c013e5d | 2026-11-01 | feat(app): add five-comparison duel sheet with undo |
| 65 | 7b7931b | 2026-11-01 | feat(app): add long-press inspect and equal panels |
| 66 | 91b5e08 | 2026-11-01 | style(app): resize duel layout to viewport |
| 67 | 0776b6e | 2026-11-01 | fix(app): correct duel card overlap positioning |
| 68 | 1d77a61 | 2026-11-01 | style(app): restyle duel header and tie control |
| 69 | 801cd25 | 2026-11-01 | style(app): reposition tie button on card seam |
| 70 | fdfb570 | 2026-11-01 | feat(app): render refinement inline in card stage |
| 71 | aec12d7 | 2026-11-01 | feat(app): move round counter into top bar |
| 72 | 46d1bf8 | 2026-11-01 | style(app): flatten round-progress and center tie |
| 73 | 59b6260 | 2026-11-01 | style(app): strip native chrome from round-progress |
| 74 | 81c9beb | 2026-11-01 | feat(app): add event coordinator and milestones |
| 75 | 712aaff | 2026-11-01 | perf(journey): cache reward thumbnails |
| 76 | 71a5919 | 2026-11-01 | feat(app): defer events to swipe boundary |
| 77 | b8647bd | 2026-11-01 | refactor(app): drop leader reward on milestone |
| 78 | 8d2e456 | 2026-11-01 | feat(app): add manual refinement session |
| 79 | c800301 | 2026-11-01 | style(app): widen tie pill and hide undo |
| 80 | 0923bac | 2026-11-01 | feat(recommender): add worker model and IndexedDB profile |
| 81 | 859f544 | 2026-11-01 | perf(app): reuse deck nodes and cache batches |
| 82 | a152e96 | 2026-11-01 | fix(app): reset cards to under when refining |
| 83 | 2af83aa | 2026-11-01 | feat(preference): add Bradley-Terry ranking and shelf |
| 84 | c78ac89 | 2026-11-01 | style(app): retitle and compact album |
| 85 | 935356c | 2026-11-01 | feat(app): navigate to refine on completion |
| 86 | 58cff44 | 2026-11-01 | fix(app): show likes count in album header |
| 87 | 76f296f | 2026-11-01 | fix(build): terminate CATALOG const |
| 88 | 0db5a2e | 2026-11-01 | build(worker): clean CATALOG terminator |
| 89 | e31688e | 2026-11-01 | feat(app): reset collection end-to-end incl. cloud |
| 90 | ace4ed1 | 2026-11-01 | chore(data): regenerate catalog.json |
| 91 | 33b5582 | 2026-11-01 | chore(data): regenerate catalog.json |
| 92 | 8f9b6d2 | 2026-11-01 | build(audit): flag Terapagos-cameo card audits |
| 93 | 53d0132 | 2026-11-01 | build(scan): score special surfaces by gold/hue |
| 94 | 8400e06 | 2026-11-01 | feat(app): add debug full-catalog viewer |
| 95 | 956ca80 | 2026-11-01 | feat(app): select cards and copy proxy list |
| 96 | 3370238 | 2026-11-01 | build(proxy): resolve print→Limitless mappings |
| 97 | e2707c8 | 2026-11-01 | feat(resources): add lazy card-resource loading |
| 98 | cd066e0 | 2026-11-01 | refactor(resources): make artwork review user-managed |
| 99 | de193b1 | 2026-11-01 | feat(app): long-press selection in debug sheet |
| 100 | daca90d | 2026-11-01 | refactor(app): drop suppressUntil from debug press |
| 101 | 4d0c814 | 2026-11-01 | fix(app): suppress clicks after scroll/capture loss |
| 102 | 5947a84 | 2026-11-01 | fix(app): tap selected print to deselect |
| 103 | cc98be3 | 2026-11-01 | feat(app): selection mode + hold preview |
| 104 | 35941c6 | 2026-11-01 | feat(app): scrub-across-cards peek preview |
| 105 | 835550c | 2026-11-01 | fix(style): preserve card ratio in peek preview |
| 106 | 9080a05 | 2026-11-01 | refactor(app): taps no longer open detail in debug |
| 107 | 75d4d56 | 2026-11-01 | chore(resources): apply user-selected alternatives |
| 108 | 056fee9 | 2026-11-01 | refactor(data): drop inline proxy from catalog |
| 109 | f7f1179 | 2026-11-01 | feat(app): refresh catalog on debug open |
| 110 | f1b7233 | 2026-11-01 | build(validate): verify published catalog matches source |
| 111 | 61fa6f5 | 2026-11-01 | fix(resources): decode-validate alternative images |
| 112 | ec0f737 | 2026-11-07 | feat(export): add batch card export for proxies |
| 113 | fe8f2fb | 2026-11-07 | style(export): polish batch export UI and feedback |
| 114 | 9af144c | 2026-11-07 | style(export): refine quiet copy confirmation |
| 115 | 3510d3d | 2026-11-07 | style(export): rework batch header and a11y labels |
| 116 | ebaaf65 | 2026-11-07 | style(export): simplify copy feedback and counts |
| 117 | 59d563c | 2026-11-07 | style(album): remove active-batch progress underline |
| 118 | 732783e | 2026-11-07 | feat(album): align export buttons with album scrubbing |
| 119 | 0a2bffe | 2026-11-07 | style(album): expand preview to 5-column grid |
| 120 | a1dbfd4 | 2026-11-07 | feat(album): rework album navigation with tests |
| 121 | a8c0936 | 2026-11-07 | refactor(album): smooth drag sensitivity curve |
| 122 | 089ce15 | 2026-11-07 | feat(album): overlay batch viewer while scrubbing |
| 123 | 3e92a22 | 2026-11-07 | fix(album): keep rail visible in viewer mode |
| 124 | b93dc1f | 2026-11-07 | feat(album): edge autoscroll and recovery pills |
| 125 | e1cfe31 | 2026-11-07 | refactor(album): anchored track drag with map preview |
| 126 | 4584007 | 2026-11-07 | feat(album): progressive preview expansion |
| 127 | b245e26 | 2026-11-08 | feat(app): lazy centered album preview + motion |
| 128 | 126ed23 | 2026-11-08 | feat(app): preview follows finger and hands off |
| 129 | ab0d449 | 2026-11-08 | refactor(app): anchor preview cards right |
| 130 | 86cf7af | 2026-11-08 | feat(app): morph preview cards into grid |
| 131 | d900445 | 2026-11-08 | style(app): tighten album landing timings |
| 132 | 4bd24dc | 2026-11-08 | feat(app): number badge + clamped preview |
| 133 | f168a80 | 2026-11-08 | fix(app): capture only scrubber touches |
| 134 | 196c8fa | 2026-11-08 | style(app): simplify scrubber thumb |
| 135 | 2602d31 | 2026-11-08 | style(app): enlarge preview cards |
| 136 | 6c36181 | 2026-11-08 | style(app): circular badge, drop backdrop |
| 137 | 89d271e | 2026-11-08 | style(app): restore backdrop, hide thumb |
| 138 | 156d33f | 2026-11-08 | style(app): rail bar fades while scrubbing |
| 139 | f4515bb | 2026-11-08 | feat(app): animate detail close to tile |
| 140 | 275bc85 | 2026-11-08 | fix(app): suppress focus ring for touch |
| 141 | fd62034 | 2026-11-08 | fix(app): continuous scroll grip tracking |
| 142 | d7c173e | 2026-11-08 | style(app): drop album dock clearance |
| 143 | 8e42723 | 2026-11-08 | feat(app): hold-to-peek refinement gestures |
| 144 | fdd800b | 2026-11-08 | feat(app): chosen card travel reveal |
| 145 | 058cf8e | 2026-11-08 | style(app): disable text selection |
| 146 | adcc3cf | 2026-11-08 | feat(app): separate footer equal button |
| 147 | 28abc8e | 2026-11-08 | style(app): update refinement icon |
| 148 | 1e178dd | 2026-11-08 | style(app): refine manual icon glyph |
| 149 | b4a9da0 | 2026-11-08 | refactor(app): slide cards apart on hold |
| 150 | 29b668d | 2026-11-08 | feat(app): equal-exit refinement path |
| 151 | b33b4c0 | 2026-11-08 | fix(app): instant equality exit reveal |
| 152 | df67518 | 2026-11-08 | feat(app): split equal-exit into next pair |
| 153 | d6ed8ad | 2026-11-08 | refactor(app): unify refinement exit handoff |
| 154 | 1bc41b8 | 2026-11-08 | refactor(app): align chosen card on exit |
| 155 | c7a6466 | 2026-11-08 | feat(battle): plan pre-warmed refinement sessions |
| 156 | 9018a9a | 2026-11-08 | feat(app): cue collection on new batch |
| 157 | ac8e4e6 | 2026-11-08 | feat(app): animate card flight via WAAPI |
| 158 | 758d5fa | 2026-11-08 | refactor(app): pulse collection on like flight |
| 159 | c4ffb99 | 2026-11-08 | feat(app): preserve pose during flight |
| 160 | 11587d9 | 2026-11-08 | fix(app): stabilize decision badge transitions |
| 161 | 36b7ce5 | 2026-11-08 | feat(material): gate foil behind flights |
| 162 | b04750e | 2026-11-08 | perf(material): cache textures, bound resolution |
| 163 | 5769398 | 2026-11-08 | refactor(app): flight follows swipe arc |
| 164 | 4a68449 | 2026-11-08 | perf(app): coalesce work behind swipes |
| 165 | e0c938c | 2026-11-08 | style(app): strengthen decision glow tints |
| 166 | 02b5fd3 | 2026-11-08 | feat(app): card-bound swipe decision seal |
| 167 | 963e898 | 2026-11-08 | style(app): enlarge and recenter swipe seal |
| 168 | ac8f116 | 2026-11-08 | style(app): polish swipe seal depth |
| 169 | 0d6e9ee | 2026-11-08 | feat(battle): mark chosen battle half |
| 170 | 1c569f8 | 2026-11-08 | build(data): expand catalog and metadata |
| 171 | 9cf2f69 | 2026-11-08 | fix(data): correct broken HIF image sources |
| 172 | bc22b2a | 2026-11-08 | style(app): edge-to-edge debug contact sheet |
| 173 | 34b0a0c | 2026-11-08 | build(data): apply main card replacements |
| 174 | 54a6b31 | 2026-11-08 | build(data): apply wave-2 card replacements |
| 175 | 4dc8940 | 2026-11-08 | build(data): apply wave-3 card replacements |
| 176 | e867ab3 | 2026-11-08 | fix(app): improve debug peek hit-testing |
| 177 | 5bc70e6 | 2026-11-08 | fix(app): keep debug zoom on selected print |
| 178 | 22cd78a | 2026-11-08 | feat(app): auto-expand settled album batch |
| 179 | 54c0db8 | 2026-11-08 | fix(app): anchor batch expansion to heading |
| 180 | 3d537ec | 2026-11-09 | feat(resources): add shared PokeResources queue |
| 181 | df38f34 | 2026-11-09 | feat(worker): edge-cache materials and art readiness |
| 182 | c8948ff | 2026-11-09 | chore(data): apply wave-4 print replacements |
| 183 | 20a69ac | 2026-11-09 | style(app): allow card overflow beyond frame |
| 184 | 390ef4b | 2026-11-09 | feat(battle): wide horizontal duel layout |
| 185 | 4f4016d | 2026-11-09 | fix(battle): gate battle on decoded artwork |
| 186 | 21319c1 | 2026-11-09 | feat(battle): preload candidate and timing |
| 187 | 6598703 | 2026-11-09 | feat(battle): session progress indicator |
| 188 | 13571ec | 2026-11-09 | fix(battle): native preloaded image readiness |
| 189 | 8b1a0f0 | 2026-11-09 | fix(data): correct Eternatus TG21 print |
| 190 | fac6c77 | 2026-11-09 | feat(resources): immutable card identity |
| 191 | 909b43f | 2026-11-09 | feat(resources): atomic bundle and image leases |
| 192 | eea95af | 2026-11-09 | fix(resources): native fallback on fetch failure |
| 193 | 339f5e6 | 2026-11-09 | feat(discovery): presentation buffer for continuity |
| 194 | 5240316 | 2026-11-09 | feat(material): gesture gate and burst buffer |
| 195 | 4cd28c5 | 2026-11-09 | perf(journey): reuse decoded art for reward |
| 196 | 7584db6 | 2026-11-09 | feat(battle): entrance clash animation and sound |
| 197 | 7770ff7 | 2026-11-09 | style(battle): layered lightning clash |
| 198 | ec3d3bc | 2026-11-09 | perf(battle): synthesize clash crackle |
| 199 | 9144584 | 2026-11-09 | style(battle): animated clash shimmer |
| 200 | cd553a7 | 2026-11-09 | feat(battle): preload automatic duel pair |
| 201 | 3078312 | 2026-11-09 | fix(battle): multi-touch and drag guards |

---

## Detailed Analysis (chronological)

### f91c179 — 2026-10-30
- **Files:** `.gitignore`, `.openai/hosting.json`, `README.md`, `app.js`, `build-worker.py`, `catalog.json`, `dev.mjs`, `improve.py`, `package.json`, `page.html`, `scripts/build.sh`, `scripts/validate-artifact.mjs`, `verify.mjs`, `worker/index.js`
- **What:** Initial scaffold of the whole Pokéamor microsite: a Worker serving inlined HTML/JS/`catalog.json`, an R2-backed `/api/session/` API with ETag/Origin validation, and a swipe UI (me gusta/paso) with localStorage state, Elo duel ranking, export/import/share, plus build/validate scripts and a 1025-entry catalog.
- **Why:** Bootstraps the "Sites Worker ESM starter" project from scratch into a working collection/duel microsite.
- **Conventional:** `feat(app): initial Pokéamor microsite scaffold`

### 2413c0a — 2026-10-30
- **Files:** `.openai/hosting.json`
- **What:** Changes the `r2` value from an object (`{"binding": "BUCKET"}`) to the plain string `"BUCKET"`.
- **Why:** Corrects the hosting manifest to the R2 binding format the hosting workflow expects.
- **Conventional:** `fix(build): simplify r2 binding in hosting.json`

### c406253 — 2026-10-30
- **Files:** `app.js`, `page.html`
- **What:** Rewrites the layout to a card-first design (quiet toolbar, full-width absolutely-positioned card, three thumb targets), introduces `fitCard` with a ResizeObserver, an "under" card preview behind the active one, and richer pointer-drag physics with reduced-motion support.
- **Why:** Replaces the initial simple card with a fuller swipe experience and a peek at the next card.
- **Conventional:** `feat(app): card-first swipe layout with under-card`

### 306515f — 2026-10-30
- **Files:** `app.js`, `page.html`
- **What:** Adds `tactile` (navigator.vibrate) and `sound` (WebAudio synthesized blips) functions, persisted `feel` settings (`sound`/`touch`), and matching Sonido/Respuesta táctil toggles in a new sensory panel.
- **Why:** Gives the swipe interaction optional haptic and audio feedback, configurable and saved per device.
- **Conventional:** `feat(app): add haptics and sound settings`

### 14c733c — 2026-10-30
- **Files:** `app.js`, `catalog.json`, `page.html`
- **What:** Adds a per-card `palette` field to the catalog and a `setScene` function that cross-fades an ambient background from the card's hue; introduces a `decision-glow` overlay with heart/cross sigils and `--love`/`--pass` intent variables; switches to a dark theme.
- **Why:** Derives an ambient scene color from each card and adds a themed decision confirmation visual.
- **Conventional:** `feat(app): ambient palette scene and decision glow`

### 03e6127 — 2026-10-30
- **Files:** `app.js`, `page.html`
- **What:** Switches the theme to soft daylight, brightens the ambient gradient, and reworks `signalDecision` to animate a heart sigil from the card to the collection counter (with `--origin-x/y` and `--travel-x/y`), plus a bubble-away pass animation.
- **Why:** Moves from the dark theme to a light pastel look with a readable, travel-based confirmation cue.
- **Conventional:** `feat(app): light theme with heart-to-collection animation`

### f19e191 — 2026-10-30
- **Files:** `app.js`, `page.html`
- **What:** `fitCard` now uses the loaded artwork's actual aspect ratio (`artRatio`) instead of a fixed 0.716, sets a `--card-paper` tone from the palette, and the under-card adopts that paper background with a lighter lift.
- **Why:** Cards with non-standard artwork dimensions now fit correctly, and the under-card reads as a paper edge.
- **Conventional:** `feat(app): fit card to artwork ratio with paper edge`

### 4a61ee7 — 2026-10-30
- **Files:** `app.js`, `page.html`
- **What:** Replaces the text stamp with inline SVG heart/cross badges, adds `love`/`armed` class toggling, an `armed` fill state, and a `feedback-lock` animation.
- **Why:** Gives the decision badge a clearer visual state that fills in when a swipe is committed.
- **Conventional:** `feat(app): SVG heart/cross decision badges`

### 5f642e5 — 2026-10-31
- **Files:** `app.js`
- **What:** Swaps the stamp's `left`/`right` positioning so the badge sits on the opposite side from the swipe direction in both move and vote paths.
- **Why:** Corrects badge placement to trail the swipe instead of leading it.
- **Conventional:** `fix(app): swap stamp left/right positioning`

### e2ad452 — 2026-10-31
- **Files:** `app.js`, `page.html`
- **What:** Centers the choice badge (`top:50%;left:50%`) and removes the per-side `left`/`right` positioning; also centers the decision-glow origin.
- **Why:** Keeps the choice indicator anchored to the middle as the card follows the finger.
- **Conventional:** `style(app): center choice badge on card`

### 5f3d96f — 2026-10-30
- **Files:** `app.js`, `build-worker.py`, `catalog.json`, `page.html`
- **What:** Disables catalog caching (`Cache-Control: no-cache` and `fetch(...,{cache:'no-cache'})`) and restores the under-card image opacity to 1.
- **Why:** Ensures catalog edits are visible immediately and the preview card's artwork is shown again.
- **Conventional:** `fix(app): disable catalog caching and restore under-card`

### 4250735 — 2026-10-30
- **Files:** `app.js`, `sync.test.mjs`
- **What:** Adds per-vote/rating `voteTimes`/`ratingTimes`, `trackChanges`, `mergeRemote` (last-write-wins by timestamp), `readRemote`, a persisted `dirty`/`-pending` flag, and retry with exponential backoff; serializes PUTs and reconciles 412 conflicts without a popup.
- **Why:** Makes multi-device sync converge correctly and remain durable offline, covered by new VM-based sync tests.
- **Conventional:** `feat(app): reconcile multi-device sync with timestamps`

### 5053ebd — 2026-10-30
- **Files:** `catalog.json`
- **What:** Switches every catalog image URL from the English (`/en/`) TCGdex path to Spanish (`/es/`) and adds a `"language": "es"` field to each entry.
- **Why:** Serve Spanish-language card artwork to match the app's Spanish UI.
- **Conventional:** `feat(data): use Spanish TCGdex images with language tag`

### f658106 — 2026-10-30
- **Files:** `app.js`, `page.html`, `verify-interactions.cjs`
- **What:** Adds `direction` to history entries, an undo animation that returns the card from the side it was swiped (`--return-x/r`), `pulseCollection`/`cancelDecisionFeedback`, and an `armed` badge that means release will commit; introduces `verify-interactions.cjs`.
- **Why:** Improves undo feedback and swipe arming semantics, with a new DOM-interaction test harness.
- **Conventional:** `feat(app): undo returns card with direction animation`

### 73373c3 — 2026-10-30
- **Files:** `app.js`, `build-worker.py`, `holo.js`, `holo.test.mjs`, `page.html`, `verify-shader.py`
- **What:** Adds `holo.js`, a reusable WebGL procedural foil overlay driven by touch and an opt-in device-orientation sensor (with permission flow, calibration, and reduced-motion handling), wired into cards via `window.PokeHolo`, plus a GLSL shader compile test (`verify-shader.py`) and a `/holo.js` route.
- **Why:** Introduces an original foil reflection effect with motion control, guarded behind permission and fallbacks.
- **Conventional:** `feat(holo): WebGL foil overlay with motion sensor`

### 377aff7 — 2026-10-30
- **Files:** `holo.js`, `holo.test.mjs`, `page.html`, `verify-shader.py`
- **What:** Rewrites the fragment shader to a metallic diffraction model with `u_resolution`/`u_finish` uniforms, per-finish spectral bands and etched relief, a `finish` tier (0/1/2) keyed off rarity/special, and updated CSS (hard-light blend, CSS foil fallback, `foil-window` clip).
- **Why:** Distinguishes ordinary, holo, ultra and etched printings with richer, more physical-looking reflections.
- **Conventional:** `feat(holo): metallic diffraction finishes per rarity`

### ae8dc0c — 2026-10-30
- **Files:** `SURFACE_RENDERING.md`, `app.js`, `catalog.json`, `holo.js`, `holo.test.mjs`, `page.html`, `verify-shader.py`
- **What:** Removes the procedural foil entirely (holo.js becomes sensor-driven geometry only), deletes `verify-shader.py`, strips `holo`/`special` heuristics from the catalog in favor of a `surface` object (`scope`/`status`/`effect: none`), and documents the "zero verified materials" policy in `SURFACE_RENDERING.md`.
- **Why:** Corrects a factual error: no per-print optical material was verified, so the app should not guess a foil finish from rarity.
- **Conventional:** `revert(holo): remove unverified foil in favor of original art`

### 6a0190c — 2026-10-30
- **Files:** `SURFACE_RENDERING.md`, `app.js`, `build-worker.py`, `catalog.json`, `holo.js`, `material-renderer.js`, `material-routes.test.mjs`, `material.test.mjs`, `materials-evidence.json`, `materials.json`, `page.html`, `scripts/import-malie.py`, `verify-material.py`, `verify.mjs`
- **What:** Adds a verified-material pipeline: `scripts/import-malie.py` matches 529 Spanish standard printings to Malie.io TCGL assets (foil/etch plates), recorded in `materials-evidence.json`/`materials.json`; a new `material-renderer.js` WebGL shader samples the real foil plate and derives normals from the actual etch texture; the Worker proxies whitelisted `/materials/` paths with validation, R2 caching, and a `Pokeamor/1.0` UA.
- **Why:** Replace the guessed foil with genuine per-print materials so only cards with verified assets get an optical effect.
- **Conventional:** `feat(material): render verified TCGL foil materials`

### 7968471 — 2026-10-30
- **Files:** `SURFACE_RENDERING.md`, `app.js`, `build-worker.py`, `material-assets.js`, `material-assets.test.mjs`, `material-renderer.js`, `material-routes.test.mjs`, `page.html`, `verify.mjs`
- **What:** Adds `material-assets.js`, a bounded shared lookahead cache (current card + 3 upcoming, 4 concurrent requests, 16 MiB/20-entry eviction, Data Saver support) exposed as `window.PokeAssets`; the renderer consumes it, and the Worker gains edge-Cache-API + in-flight-dedup on top of R2 caching.
- **Why:** Preload and reuse foil/etch downloads so rapid swipes never restart useful work or exceed memory.
- **Conventional:** `feat(material): shared lookahead asset cache with edge cache`

### 5bd582a — 2026-10-30
- **Files:** `SURFACE_RENDERING.md`, `build-worker.py`, `material-routes.test.mjs`
- **What:** Removes the Worker-side Cache API edge caching and `materialInflight` dedup, reverting material delivery to the previously working R2-only route (client-side lookahead/reuse remains); drops the two corresponding tests.
- **Why:** The host rejected the Cache API optimization, so the simpler R2 route is kept for reliability.
- **Conventional:** `revert(worker): drop Cache API edge caching for R2 route`

### 111b2d7 — 2026-10-31
- **Files:** `art-selections.json`, `catalog.json`, `worker/index.js`
- **What:** Adds a new `art-selections.json` defining a policy to prefer full-color Spanish artwork over gold/silver silhouette prints, with 6 selections (Lugia, Dialga, Giratina, Arceus, Solgaleo, Lunala). Regenerates `catalog.json` and the embedded `CATALOG` in the worker to reflect the new card choices.
- **Why:** To improve card visuals by replacing prints that obscure the Pokémon, while preserving species IDs and votes.
- **Conventional:** `feat(art): add art-selections policy and 6 card swaps`

### 3e6a3e1 — 2026-10-31
- **Files:** `art-selections.json`, `catalog.json`, `worker/index.js`
- **What:** Expands the art policy to also avoid "rainbow VMAX" prints and adds ~19 selections (Butterfree, Machamp, Celebi, Heatran, Tornadus, Malamar, Trevenant, Melmetal, Corviknight, Orbeetle, Drednaw, Boltund, Coalossal, Sandaconda, Centiskorch, Stonjourner, Dracozolt, Eternatus, Regieleki). Regenerates catalog/worker.
- **Why:** To continue replacing artwork types that obscure the Pokémon with natural-color, clearer prints.
- **Conventional:** `feat(art): replace rainbow VMAX card artwork`

### 49e9b09 — 2026-10-31
- **Files:** `art-selections.json`, `catalog.json`, `worker/index.js`
- **What:** Updates the policy to also avoid "metallic TURBO/BREAK" prints and adds 4 selections (Golduck, Marowak, Omastar, Noivern). Regenerates catalog/worker.
- **Why:** To keep artwork natural and non-shiny for these species.
- **Conventional:** `feat(art): replace metallic TURBO/BREAK artwork`

### 0f5203c — 2026-10-31
- **Files:** `app.js`, `build-worker.py`, `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Introduces the `journey.js` feature module (round-progress ring, milestone/round celebration, and a playmat canvas composing favorite card artwork with save/share). Hooks `PokeJourney.update/celebrate/compose` into `app.js`, adds matching markup/CSS in `page.html`, and registers the `/journey.js` route in the worker build.
- **Why:** To add quiet progress feedback and a personal, shareable artwork composition built from the user's favorites.
- **Conventional:** `feat(journey): add progress, milestones and playmat`

### c2b0c7c — 2026-10-31
- **Files:** `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Replaces the stroke-dashoffset ring with a `clipPath`/`maskImage` conic-gradient, adds `#round-number`, `#round-pearls`, and a `#round-progress` button; on round completion shows a `#round-reward` preview of the 3 most recent liked cards. Reduces the playmat composition from 7 to 6 favorites.
- **Why:** To make round progress clearer and reward completed rounds with a peek at recent picks.
- **Conventional:** `feat(journey): refine round ring and reward preview`

### 2f64821 — 2026-10-31
- **Files:** `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Adds `discoveries`/`batches`/`memories` grouping favorites into batches of 15, a `#team-six` grid of the top 6 favorites, memory-detail panels, and a `#progress-pearl` flight animation. Exposes `team()` and `batches()` on `window.PokeJourney` and adds corresponding tests.
- **Why:** To give users a sense of their collection history and a six-Pokémon team that duels can refine.
- **Conventional:** `feat(journey): add team slots and batch memories`

### 7c143d6 — 2026-10-31
- **Files:** `app.js`, `page.html`, `verify-interactions.cjs`, `worker/index.js`
- **What:** Replaces the text `♡` with an inline stroke-based SVG heart in the likes counter and card stamp, adds matching CSS for the heart/vote icons and header layout, and updates `verify-interactions.cjs` to assert on the new `<span>` innerHTML.
- **Why:** To give the heart icon a consistent, outlined SVG look across the counter and stamp.
- **Conventional:** `style(app): use SVG hearts in counter and stamp`

### 8aec1e8 — 2026-10-31
- **Files:** `app.js`, `journey.js`, `page.html`, `verify-interactions.cjs`, `worker/index.js`
- **What:** Redesigns the collection sheet: adds a card detail dialog (`inspectCard`, favorite toggle with cross-device undo guard), paginated gallery with `#gallery-more`, a collection options menu, team/memories views, and per-filter titles with an accent color derived from the first favorite. Adds `showModal`/`close` to the test mock.
- **Why:** To turn the flat collection list into a navigable gallery with per-card detail and team/memories entry points.
- **Conventional:** `feat(app): redesign collection with card detail`

### 83fb667 — 2026-10-31
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds `browseDetail` (prev/next) and swipe navigation on `#detail-art` (swipe down to close, horizontal to browse), tracks `collectionCards`, wires `#team-menu`, and resets `filter` to `'yes'` when opening the collection.
- **Why:** To let users flip through cards in the detail view without returning to the grid.
- **Conventional:** `feat(app): add detail swipe navigation`

### 06fd2c6 — 2026-10-31
- **Files:** `app.js`, `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Adds a `showCollectionTab` toggle switching the sheet between "rounds" (memories) and "liked" (gallery) modes via `#show-rounds`/`#show-liked`. Refactors `journey.js` memories to render batch groups with a selectable batch and empty-state text.
- **Why:** To separate the collection gallery from the round/memories view and clean up memory rendering.
- **Conventional:** `feat(app): add rounds/liked collection switch`

### e25e9c6 — 2026-10-31
- **Files:** `app.js`, `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Splits `batches()` (likes-only, chunked every 15) from `discoveryBatches()` (all discoveries); `memories()` now renders batch groups with grids that open cards via a new `window.PokeInspect`. Adds an `'all'` collection filter and updates tests to assert likes-only batches.
- **Why:** To make "tandas" reflect only liked Pokémon and let memory cards open the detail view.
- **Conventional:** `refactor(journey): group favorites into like-only batches`

### 97fef53 — 2026-10-31
- **Files:** `app.js`, `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Bases round progress on favorite (like) count (`likes % 15`) instead of discoveries, with `celebrate` using a `favorite-round` reward key; passes no longer advance round progress. Adds a `#collection-settings` handler and tests for passes not completing rounds.
- **Why:** So round milestones reward only liked Pokémon rather than all discoveries including passes.
- **Conventional:** `feat(journey): base round progress on likes`

### 9acfff4 — 2026-10-31
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Persists completed batches in `seen.completedBatches` (localStorage) so tandas stay stable across reloads; `memories()` adds placeholder slots and a "next batch" hint. Removes the `#collection-menu` handler and reverts the liked filter to `'yes'`.
- **Why:** To make completed batches durable and show placeholders for the batch still in progress.
- **Conventional:** `feat(journey): persist batches and add placeholders`

### 2f31b75 — 2026-10-31
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Replaces the `#collection-options` modal behavior with a settings panel inside the sheet; `#options-close`, `#collection-settings`, and `#show-liked` now toggle `showCollectionTab(false)`. Adds `settings-panel` styling in `page.html`.
- **Why:** To surface collection settings inline rather than in a separate options modal.
- **Conventional:** `refactor(app): surface settings panel in collection`

### 4cf78bc — 2026-11-01
- **Files:** `journey.js`, `journey.test.mjs`, `page.html`, `worker/index.js`
- **What:** Reworks `batches()` to pop stale completed batches when members lose their "yes" vote, and reworks `update`/`celebrate` around a `newFavoriteId`/`previousActive` signature. Batch completion is now keyed to the batch's exact content (not like milestones), with a "♡ N/15" pill, "just-collected"/"favorite-arrived" animations, and a reward card strip.
- **Why:** Make the 15-per-batch "tanda" progress stable and un-farmable through undo/reload, and give each completed batch a distinct celebration.
- **Conventional:** `feat(journey): batch-based tanda progress with undo-safe rewards`

### 03708a8 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds an origin-fly animation when opening/closing the card detail viewer (`animateCardOrigin`, `closeDetail`), and extends `PokeInspect(p, group, tile)` to track the source tile. `journey.js` memoizes `memories()` via signature, marks the active batch, and gates `compose()` on the team/playmat view being open.
- **Why:** Animate the card from its album tile into the viewer and avoid recomposing when nothing changed.
- **Conventional:** `feat(app): viewer open/close origin animation`

### cd16858 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Turns the detail viewer into a full-screen dialog with a heart toggle (`aria-pressed`), a position counter, and `--viewer-hue` tint. Pointer drag now translates/rotates the image, closes on downward swipe, and browses on horizontal swipe.
- **Why:** Polish the full-screen card viewer with richer gestures and an accessible like control.
- **Conventional:** `feat(app): full-screen viewer with swipe gestures`

### 761006d — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Wraps the viewer card in a `#viewer-surface` host and wires `PokeHolo`/`PokeMaterial` (attach, prepare, pointer lighting, dispose) plus a `viewer-preview` neighbor shown while dragging. Adds `#viewer-surface`/canvas CSS for the foil overlay.
- **Why:** Render matched foil/holo material inside the card viewer instead of a static image.
- **Conventional:** `feat(app): holo material in card viewer`

### 57d7280 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds `addViewerNeighbors()` rendering left/right neighbor card buttons with `viewer-neighbor` CSS, clickable to browse.
- **Why:** Provide tappable adjacent cards as an alternative to swipe-to-browse.
- **Conventional:** `feat(app): viewer neighbor cards for browsing`

### 4d0c6a3 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Replaces the live drag-preview with a `moveViewer()` settle animation driven by `viewerSettling`/`viewerEpoch`; a horizontal swipe beyond 60px slides the card out then calls `browseDetail`. Adds settling transition CSS.
- **Why:** Give browsing a snap/settle feel rather than a raw drag.
- **Conventional:** `feat(app): settle animation for viewer swipe`

### ccce0ca — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Replaces the settle logic with a horizontal scroll-snap carousel: `viewerItems` + `activateViewer`/`centerViewer`, with a scroll handler detecting the nearest item. `#detail-art` becomes a snapping scroll container.
- **Why:** Rework browsing into a native-feeling scrollable card strip.
- **Conventional:** `refactor(app): scroll-snap viewer carousel`

### 71edb4f — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Fixes `animateCardOrigin` to target `#viewer-surface img`, and simplifies `closeDetail` (drops async animation, disposes holo, defers `render()`).
- **Why:** Correct the origin animation after the carousel refactor and tidy close cleanup.
- **Conventional:** `fix(app): origin animation after carousel refactor`

### 3c57962 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Smooths drag physics (weighted velocity, clamped drag travel, reduced-motion instant snap), adds a `warmArt` decode-prewarm map for upcoming cards, and speeds up the deal animation. Adds `quick-deal` CSS.
- **Why:** Make card flinging feel more natural and preload art to reduce jank.
- **Conventional:** `perf(app): smoother drag physics and art prewarm`

### 63440ca — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds album search (`batch-search`/`search-scope`) filtering batches by normalized name and like-only scope, expandable batch headings, and a `return-highlight` pulse on the origin tile when the viewer closes.
- **Why:** Let users find cards in a large collection and see where a viewed card lives.
- **Conventional:** `feat(journey): album search and expandable batches`

### 8723757 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Removes the search/onlyLiked filtering and adds `setAlbumDensity` with `album-overview`/`album-detail` toggles persisted to localStorage, plus `data-batch` attributes on sections.
- **Why:** Replace text search with a simpler overview-vs-detail density switch.
- **Conventional:** `refactor(journey): album density toggle replaces search`

### 425cd96 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds a vertical `PokeAlbumIndex` scrubber rail with a preview popover of each batch's cards and keyboard/pointer navigation; `journey.js` calls `refresh()` after rendering memories.
- **Why:** Add a fast jump index for navigating many batches.
- **Conventional:** `feat(app): album index scrubber with preview`

### 363dbd1 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Refines the index into a moving grip driven by `--index-position`, dedupes previews via `previewIndex`, and tracks the sheet scroll with a binary search for the nearest section. Updates scrubber CSS.
- **Why:** Make the scrubber track both drag and scroll accurately.
- **Conventional:** `refactor(app): scrubber grip follows section scroll`

### ad78b60 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds `scrubbing` state and `albumInset()` offset for `land()`, a preview hide timer, and requestAnimationFrame-throttled scroll handling; adjusts placeholder counts in `journey.js`.
- **Why:** Improve scrubber feel, inset math, and scroll performance.
- **Conventional:** `refactor(app): scrubber landing and scroll throttling`

### d870588 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Caches preview image nodes in a `previewCache` Map; `thumbnail()` now serves `low.webp` (falling back to `high.webp` on error) and `celebrate()` reuses it. Scrubber shows `data-position` via CSS.
- **Why:** Reduce preview churn and serve lighter thumbnails for tcgdex art.
- **Conventional:** `perf(journey): low-res thumbnails and preview cache`

### 6faa1a3 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds an `album-settings` button toggling between the rounds view and a settings/backup panel; simplifies batch count text and placeholder counts; adds compact 5-column album CSS with a sticky header.
- **Why:** Introduce a settings/backup destination and a denser album layout.
- **Conventional:** `feat(app): album settings toggle and compact grid`

### 6f78deb — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Hides scrollbars (`scrollbar-width:none` and `::-webkit-scrollbar` display:none) on html/body/sheet and the memories list.
- **Why:** Keep native touch scrolling without visible scrollbars.
- **Conventional:** `style(app): hide scrollbars for native scrolling`

### fc178f1 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** `fromPointer` now live-scrolls the sheet by interpolating between sections while scrubbing; `showCollectionTab` updates the heading. `journey.js` adds a "✓" complete-label, `--batch-progress`, and `just-completed` class with an `album-complete` animation.
- **Why:** Make the scrubber feel continuous and celebrate a freshly completed batch.
- **Conventional:** `feat(journey): live-scroll scrub and completion feedback`

### 8c7622f — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds a `delete-all` button with a three-stage timed confirmation that clears the localStorage key and reloads. Adds settings-icon/delete-all CSS.
- **Why:** Let users wipe their collection safely with explicit confirmations.
- **Conventional:** `feat(app): staged delete-all confirmation`

### d3dd65f — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Rewrites `sound()` to synthesize oscillator tones (layered sine/triangle notes for like/lift/choose) instead of the previous white-noise buffer.
- **Why:** Replace noisy blips with pleasant, distinct audio cues.
- **Conventional:** `feat(app): melodic oscillator sound cues`

### e84a052 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Retunes the like/choose tone frequencies and adds CSS for settings controls (checkbox toggles, pill grid, press feedback).
- **Why:** Fine-tune audio pitch and give settings controls a coherent look.
- **Conventional:** `style(app): tune tones and settings controls`

### d8479d4 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `worker/index.js`
- **What:** Adds a `round` sound (ascending arpeggio), exposes `window.PokePlaySound`, and plays it from `journey.js` `celebrate()` on batch completion; scales gain by 0.58.
- **Why:** Give completed tandas their own celebratory chime.
- **Conventional:** `feat(journey): completion chime on batch round`

### 905b6e4 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds an `albumTiles` cache and a `watchThumbnail` IntersectionObserver to eager-load visible tiles; `thumbnail()` builds a fallback source chain (low.webp → high.webp → PokeAPI official art). CSS makes batch headings non-sticky.
- **Why:** Speed up album image loading and add a resilient artwork fallback.
- **Conventional:** `perf(journey): lazy tile cache and art fallback chain`

### ace7bd2 — 2026-11-01
- **Files:** `journey.js`, `worker/index.js`
- **What:** A one-line internal adjustment to `memories()` (the `-`/`+` lines are otherwise identical in the truncated diff).
- **Why:** Likely a trivial cleanup or micro-refactor with no visible functional change.
- **Conventional:** `chore(journey): internal memories() tweak`

### 75a69f8 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds an `album-seen` counter showing `n/catalog.length` updated in `render()`, with CSS for the heading wrapper shown only in rounds mode.
- **Why:** Surface total-progress count in the album header.
- **Conventional:** `feat(app): album seen-counter in header`

### 47ad35a — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Exposes `--journey-hue` from the scene palette and adds a `#tanda-light` glow element whose scale/opacity follow batch progress, with a `tanda-bloom` pulse on completion.
- **Why:** Reflect batch progress as an ambient light and celebrate completion visually.
- **Conventional:** `feat(app): progress-driven tanda glow`

### 7c9957a — 2026-11-01
- **Files:** `RECOMMENDATIONS.md`, `app.js`, `catalog.json`, `page.html`, `recommendation.test.cjs`, `worker/index.js`
- **What:** Adds a local recommendation model: `adaptiveQueue()` scores unseen species by personal affinity vs. a Pokémon-of-the-Year-2020 prior, injects "reencounter" alternate-art cards fetched from TCGdex, tracks them in `state.encounters`, and wires a refine-favorites duel button. Adds `traits`/`communityVotes2020` to the catalog and a new test + RECOMMENDATIONS.md doc.
- **Why:** Personalize card ordering and surface alternate illustrations without affecting species votes.
- **Conventional:** `feat(resources): adaptive queue and alternate-art encounters`

### 5f0eefc — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds a floating `#front-refine` button wired to open the duelsheet, plus its CSS; hides the front vote controls and `#refine-favorites`.
- **Why:** Introduce a one-tap entry into the favorites comparison flow from the main card screen.
- **Conventional:** `feat(app): add front refine button to open duelsheet`

### 3448ae8 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Widens the controls' right padding (52px→64px) and nudges the `#front-refine` button's position and bottom offset.
- **Why:** Make room for the new floating refine button so it doesn't collide with controls.
- **Conventional:** `style(app): adjust front-refine padding and offset`

### c013e5d — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Wraps `nextPair`/`duel` to run a five-comparison round with progress dots, card reversal, palette background, and a summary; adds `#duel-undo` and full duelsheet CSS.
- **Why:** Turn single duels into a five-choice refinement session with a reversible choice.
- **Conventional:** `feat(app): add five-comparison duel sheet with undo`

### 7b7931b — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds long-press to enlarge a duel card (`#duel-full-card`) without voting, swaps text buttons for SVG icons, and switches duels to stacked equal panels.
- **Why:** Let users inspect artwork mid-duel without accidentally casting a vote.
- **Conventional:** `feat(app): add long-press inspect and equal panels`

### 91b5e08 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Replaces the duelsheet CSS with a single viewport-sized comparison layout, repositioning the pair cards and controls.
- **Why:** Rework the duel layout to be sized from the actual available viewport.
- **Conventional:** `style(app): resize duel layout to viewport`

### 0776b6e — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Adjusts pair card positioning (adds `isolation`, resets bottom/transform) and shifts the overlap seam and tools from 46% to 44%.
- **Why:** Fix card overlap so the two panels and mid-seam controls align correctly.
- **Conventional:** `fix(app): correct duel card overlap positioning`

### 1d77a61 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Restyles the duelsheet header into a flex row and turns the `#both` tie control into a small pill using ::before/::after strokes.
- **Why:** Keep the illustration unobstructed while retaining generous touch targets.
- **Conventional:** `style(app): restyle duel header and tie control`

### 801cd25 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Moves the tie (`#both`) control to the right edge of the shared seam and restyles it as a bordered pill.
- **Why:** Place the equal-preference action on the visual seam between the two cards.
- **Conventional:** `style(app): reposition tie button on card seam`

### fdfb570 — 2026-11-01
- **Files:** `app.js`, `page.html`, `refinement.test.cjs`, `worker/index.js`
- **What:** Replaces the duelsheet refinement with an inline `#refinement-event` on the card stage using Elo-style ratings and `state.comparisons`; adds rating-based affinity to the adaptive queue and a new test.
- **Why:** Make refinement a single event in the discovery stage instead of a separate sheet.
- **Conventional:** `feat(app): render refinement inline in card stage`

### aec12d7 — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Moves the round-progress counter into the top header (before `#open`), drops the ♡ prefix on round numbers, and styles the header pill plus the refinement tie.
- **Why:** Keep the batch count visible beside the favorite heart in the top bar.
- **Conventional:** `feat(app): move round counter into top bar`

### 46d1bf8 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Flattens the header round-progress (removes border/box shadow) and centers the tie glyph via absolute positioning.
- **Why:** Make the top-bar counter read as text rather than a button.
- **Conventional:** `style(app): flatten round-progress and center tie`

### 59b6260 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Adds `appearance:none` and strips ::before/::after, border, background, and outline from the header round-progress.
- **Why:** Suppress native button styling on the relocated counter.
- **Conventional:** `style(app): strip native chrome from round-progress`

### 81c9beb — 2026-11-01
- **Files:** `app.js`, `events.test.cjs`, `journey.js`, `journey.test.mjs`, `page.html`, `recommendation.test.cjs`, `worker/index.js`
- **What:** Adds an event coordinator (`scheduleEvents`/`runEvents`) gating refinements behind cooldowns and busy states; merges `comparisons`/`refinementSchedule` in `mergeRemote`; adds a discovery counter and milestone animations.
- **Why:** Centralize when refinement/encounter events fire and sync the new comparison state across devices.
- **Conventional:** `feat(app): add event coordinator and milestones`

### 712aaff — 2026-11-01
- **Files:** `journey.js`, `worker/index.js`
- **What:** Adds a `rewardArt` cache with `rewardThumbnail` and pre-warms the newest favorite's thumbnail.
- **Why:** Avoid re-decoding artwork when reward overlays display.
- **Conventional:** `perf(journey): cache reward thumbnails`

### 71a5919 — 2026-11-01
- **Files:** `app.js`, `events.test.cjs`, `journey.js`, `page.html`, `recommendation.test.cjs`, `worker/index.js`
- **What:** Adds `queuedPair`/`eventBoundary` so a prepared refinement enters only at a swipe boundary; adds `window.PokeOpenBatch` and artwork `remember`/`seenArt` caching; animates event deal/leave.
- **Why:** Prevent a due event from redrawing the visible card mid-gesture and let users jump back to a batch.
- **Conventional:** `feat(app): defer events to swipe boundary`

### b8647bd — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Removes the top-3 leader reward panel on milestones, keeping only the milestone highlight and sound.
- **Why:** Simplify milestone celebration to avoid a disruptive overlay.
- **Conventional:** `refactor(app): drop leader reward on milestone`

### 8d2e456 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds an optional manual refinement session (`beginManualRefinement`) with progress dots and pair dedup, rerouting `#front-refine`/`#refine-favorites`/`#duel`.
- **Why:** Let users run a short multi-comparison session on demand.
- **Conventional:** `feat(app): add manual refinement session`

### c800301 — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Widens the refinement tie control into a labeled pill at the shared midpoint and hides the undo button while refining.
- **Why:** Make the equal-preference action clearer and prevent undo conflicts during refinement.
- **Conventional:** `style(app): widen tie pill and hide undo`

### 0923bac — 2026-11-01
- **Files:** `RECOMMENDATIONS.md`, `app.js`, `build-worker.py`, `engine.test.cjs`, `recommendation.test.cjs`, `recommender.js`, `worker/index.js`
- **What:** Adds `recommender.js` (a Web Worker online logistic model), IndexedDB profile persistence with localStorage fallback, and a worker build/serve path; documents the online model.
- **Why:** Move recommendation to a dedicated worker with a regularized model and durable async storage.
- **Conventional:** `feat(recommender): add worker model and IndexedDB profile`

### 859f544 — 2026-11-01
- **Files:** `app.js`, `deck.test.cjs`, `journey.js`, `recommendation.test.cjs`, `recommender.js`, `worker/index.js`
- **What:** Adds `reconcileDeck` to reuse card nodes across renders, `scheduleAlternate`, `save(change)` with targeted vote tracking, batch caching in journey.js, and delta messaging in recommender.js.
- **Why:** Cut DOM churn and recomputation to improve performance.
- **Conventional:** `perf(app): reuse deck nodes and cache batches`

### a152e96 — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** When painting refinement, resets visible cards to `under` state via `setUnder` instead of only stopping motion.
- **Why:** Ensure hidden cards return to a reusable undercard state.
- **Conventional:** `fix(app): reset cards to under when refining`

### 2af83aa — 2026-11-01
- **Files:** `app.js`, `journey.js`, `journey.test.mjs`, `page.html`, `preference.test.cjs`, `worker/index.js`
- **What:** Adds `window.PokePreference` (regularized Bradley–Terry) in journey.js, uses it for favorites ranking, `score`, and pair selection; adds a favorites shelf UI and tests.
- **Why:** Replace Elo ratings with a deterministic Bradley–Terry preference model.
- **Conventional:** `feat(preference): add Bradley-Terry ranking and shelf`

### c78ac89 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Renames the collection heading from "Tus tandas" to "Tu colección" and adds compact album/shelf CSS.
- **Why:** Present the collection as a unified album rather than only batches.
- **Conventional:** `style(app): retitle and compact album`

### 935356c — 2026-11-01
- **Files:** `app.js`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds `discoveryComplete()` and turns the collection close button into a refine entry once all cards are seen; only shows the "next batch" hint when unseen remain.
- **Why:** Route users into refinement after finishing the catalog.
- **Conventional:** `feat(app): navigate to refine on completion`

### 58cff44 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Changes the album-seen counter to report likes (`likes / catalog.length`) instead of total seen.
- **Why:** Surface how many favorites have been collected.
- **Conventional:** `fix(app): show likes count in album header`

### 76f296f — 2026-11-01
- **Files:** `catalog.json`, `worker/index.js`
- **What:** Adds a trailing newline to catalog.json and terminates the generated `CATALOG` const with a semicolon.
- **Why:** Fix a build artifact missing a statement terminator.
- **Conventional:** `fix(build): terminate CATALOG const`

### 0db5a2e — 2026-11-01
- **Files:** `catalog.json`, `worker/index.js`
- **What:** Adjusts catalog.json and moves the `CATALOG` semicolon to its own line in the worker bundle.
- **Why:** Clean up the generated worker's statement terminator placement.
- **Conventional:** `build(worker): clean CATALOG terminator`

### e31688e — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Adds an async `resetCollection()` that clears all timers, resets state to empty (with `revision` + `resetAt`), wipes localStorage/IndexedDB keys, re-syncs to cloud, and re-renders; the "delete all" button now calls it on final confirmation. Also adds a `mergeRemote` guard that marks local dirty when the local reset is newer than the remote's.
- **Why:** Make "borrar toda la colección" a true end-to-end reset (local + cloud), and prevent a stale remote copy from resurrecting a freshly reset collection.
- **Conventional:** `feat(app): reset collection end-to-end incl. cloud`

### ace4ed1 — 2026-11-01
- **Files:** `catalog.json`, `worker/index.js`
- **What:** Single-line regeneration of `catalog.json`, mirrored into the worker's embedded `CATALOG` constant.
- **Why:** Routine data refresh of the Pokémon catalog (image/material metadata) with no code change.
- **Conventional:** `chore(data): regenerate catalog.json`

### 33b5582 — 2026-11-01
- **Files:** `catalog.json`, `worker/index.js`
- **What:** Another single-line regeneration of `catalog.json` and its embedded `CATALOG` copy in the worker.
- **Why:** Incremental catalog data update with no functional code change.
- **Conventional:** `chore(data): regenerate catalog.json`

### 8f9b6d2 — 2026-11-01
- **Files:** `audit_current_cards.py`, `catalog.json`, `worker/index.js`
- **What:** Adds `audit_current_cards.py`, which queries TCGdex for each catalog card and flags "suspicious" ones whose `cameoDexIds` includes 1024 (Terapagos), writing results to `current-suspicious.json`.
- **Why:** Detect cards potentially misnamed because of Terapagos cameo appearances on Tera cards.
- **Conventional:** `build(audit): flag Terapagos-cameo card audits`

### 53d0132 — 2026-11-01
- **Files:** `scan_special_surfaces.py`, `surface-scan.json`, `catalog.json`, `worker/index.js`
- **What:** Adds `scan_special_surfaces.py`, which downloads high-res images for Ultra/Secret/Hyper rare rarities, converts to HSV, and computes a gold-pixel ratio and hue entropy, ranking candidates into `surface-scan.json`.
- **Why:** Identify special foil/gold surfaces among high-rarity cards for future material matching.
- **Conventional:** `build(scan): score special surfaces by gold/hue`

### 8400e06 — 2026-11-01
- **Files:** `app.js`, `catalog.json`, `page.html`, `worker/index.js`
- **What:** Introduces a `debugCatalog` flag and a `#debug-catalog` button that opens a full-catalog debug view (every card with code + rarity, compact grid), plus debug-mode CSS; closing resets it.
- **Why:** A hidden developer tool to browse the whole catalog for verifying card data and art.
- **Conventional:** `feat(app): add debug full-catalog viewer`

### 956ca80 — 2026-11-01
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds per-card debug selection (`debugSelected` Set) with check-mark overlays, a detail-view "Agregar a proxies" toggle, and a "Copiar seleccionadas · Limitless" button that copies a text list.
- **Why:** Let the user build and export a proxy list (for Limitless) from selected catalog cards.
- **Conventional:** `feat(app): select cards and copy proxy list`

### 3370238 — 2026-11-01
- **Files:** `app.js`, `catalog.json`, `proxy-set-metadata.json`, `proxy.test.cjs`, `scripts/proxy-metadata.py`, `worker/index.js`
- **What:** Adds `scripts/proxy-metadata.py` to resolve each card's printed name, PTCGL set code, and collector number into a `proxy` field in catalog.json (set-metadata cache + overrides); `debugProxyText` now emits `1 <name> <set> <number>` in Pokédex order and errors on missing mappings. Adds `proxy.test.cjs`.
- **Why:** Replace name-guessing with authoritative print-to-export mappings so the copied list uses real set codes and numbers.
- **Conventional:** `build(proxy): resolve print→Limitless mappings`

### e2707c8 — 2026-11-01
- **Files:** `CARD-RESOURCES.md`, `card-resources.js`, `alternatives.test.cjs`, `card-resources.test.cjs`, `app.js`, `build-worker.py`, `catalog.json`, `data/alternatives-curated.json`, `data/card-metadata/proxies.json`, `data/proxy-overrides.json`, `generated/*`, `scripts/*`, `worker/index.js`
- **What:** Adds a content-addressed "card resources" system: `card-resources.js` lazily loads immutable alternatives/proxies JSON via a manifest; the worker serves `/card-resources.js` and `/data/*.json` (backing up to R2); `build-worker.py` embeds them. `app.js` replaces the runtime TCGdex fetch with `PokeCardResources`, adds `makeAlternativeCard`, and rewrites `prepareAlternate` with generation guards, per-print image validation, and 5-min/30s retry backoff.
- **Why:** Remove the runtime network dependency on TCGdex for alternative art, making resources deterministic, versioned, and validated offline.
- **Conventional:** `feat(resources): add lazy card-resource loading`

### cd066e0 — 2026-11-01
- **Files:** `CARD-RESOURCES.md`, `alternatives.test.cjs`, `app.js`, `data/alternatives-curated.json`, `scripts/build-card-resources.py`, `scripts/prepare-alternatives.py`, `worker/index.js`
- **What:** Adds a `debugAlternatives` toggle and "Alternativas" tab showing alternative prints; renames curated fields from `approved`/`verification` to `enabled`/`reviewStatus: pending-user`/`technicalCheck`; deletes `prepare-alternatives.py`; docs reframe alternatives as user-managed.
- **Why:** Make alternative-artwork selection explicitly user-owned, removing automatic approval so tech checks are no longer treated as approval.
- **Conventional:** `refactor(resources): make artwork review user-managed`

### de193b1 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `page.html`, `worker/index.js`
- **What:** Adds a long-press-to-select gesture (`bindDebugPress`) using pointer events (350ms hold toggles selection, movement cancels), a floating "Copiar" button, and CSS for a compact debug contact sheet.
- **Why:** Provide a touch-friendly way to rapidly select many cards in the debug sheet.
- **Conventional:** `feat(app): long-press selection in debug sheet`

### daca90d — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Removes the `suppressUntil` timestamp logic from `bindDebugPress`, leaving only the `held` flag to suppress the trailing click.
- **Why:** Simplify click suppression after the prior behavior proved sufficient without the extra 800ms window.
- **Conventional:** `refactor(app): drop suppressUntil from debug press`

### 4d0c814 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `worker/index.js`
- **What:** Adjusts `bindDebugPress` so a move past the threshold and `pointercancel` both set `held=true` (suppressing the trailing click), while `lostpointercapture` only cancels; adds tests for implicit capture loss and cancelled-scroll.
- **Why:** Harden gesture handling so scroll/capture-loss never triggers an accidental selection or viewer open.
- **Conventional:** `fix(app): suppress clicks after scroll/capture loss`

### 5947a84 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `worker/index.js`
- **What:** In `bindDebugPress`, a short tap on an already-selected print now toggles it off instead of opening the viewer (`debugSelected.has(p.card)` check); test updated.
- **Why:** Make tap-to-toggle consistent so selected prints deselect on tap rather than opening detail.
- **Conventional:** `fix(app): tap selected print to deselect`

### cc98be3 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `page.html`, `worker/index.js`
- **What:** Adds an explicit "Seleccionar/Listo" selection-mode toggle (`debugSelectionMode`), a long-press `#debug-peek` image preview overlay, and a "Limpiar" button; normal taps open detail, selection-mode taps toggle selection.
- **Why:** Separate browsing from selection so users can preview art (hold) and only select in selection mode.
- **Conventional:** `feat(app): selection mode + hold preview`

### 35941c6 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `page.html`, `worker/index.js`
- **What:** Reworks the hold preview into a session-based scrubber: moving after hold scrubs across tiles (via `elementFromPoint`) and auto-scrolls at screen edges (`tickDebugPeek`), with `touchmove` handling.
- **Why:** Let users drag to preview adjacent cards and auto-scroll instead of canceling on move.
- **Conventional:** `feat(app): scrub-across-cards peek preview`

### 835550c — 2026-11-01
- **Files:** `page.html`, `worker/index.js`
- **What:** Changes `#debug-peek img` sizing from max-width/max-height to fixed aspect-ratio-preserving `min()` dimensions.
- **Why:** Keep the preview at the correct card aspect ratio instead of stretching.
- **Conventional:** `fix(style): preserve card ratio in peek preview`

### 9080a05 — 2026-11-01
- **Files:** `app.js`, `debug-press.test.cjs`, `worker/index.js`
- **What:** Removes `inspectCard` from the normal-tap path in `bindDebugPress` (both click and space/Enter), so normal taps stay in the grid; selection-mode toggles remain.
- **Why:** Taps in the debug grid should only toggle selection, not open detail.
- **Conventional:** `refactor(app): taps no longer open detail in debug`

### 75d4d56 — 2026-11-01
- **Files:** `data/alternatives-curated.json`, `data/card-metadata/proxies.json`, `generated/*`, `scripts/build-card-resources.py`, `worker/index.js`
- **What:** Replaces auto-curated alternatives with user-supplied exact prints (`reviewStatus: "user-selected"`, varied rarities like "Reverso holográfico"/"Arte completo", `imageDecoded: false`), and updates `proxies.json` + regenerated hashed resources.
- **Why:** The user replaced the alternatives dataset with their own chosen prints.
- **Conventional:** `chore(resources): apply user-selected alternatives`

### 056fee9 — 2026-11-01
- **Files:** `catalog.json`, `worker/index.js`
- **What:** Single-line regeneration of `catalog.json` (dropping the inline `proxy` field) mirrored into the worker's embedded `CATALOG` constant.
- **Why:** Proxy mappings now live in the separate proxies resource rather than inline in the catalog.
- **Conventional:** `refactor(data): drop inline proxy from catalog`

### f7f1179 — 2026-11-01
- **Files:** `app.js`, `worker/index.js`
- **What:** Makes the debug-catalog open handler async, fetching a fresh catalog via `refreshDebugCatalog()` (cache-busted `/catalog.json`) and validating it before re-rendering.
- **Why:** Ensure the debug catalog reflects the latest published catalog rather than a stale embedded copy.
- **Conventional:** `feat(app): refresh catalog on debug open`

### f1b7233 — 2026-11-01
- **Files:** `scripts/build.sh`, `scripts/validate-catalog-artifact.mjs`
- **What:** Adds `scripts/validate-catalog-artifact.mjs`, which imports the built `dist/server/index.js`, requests `/catalog.json`, and asserts it equals source `catalog.json`; wired into `build.sh`.
- **Why:** Guard against publishing a worker whose embedded catalog diverges from source.
- **Conventional:** `build(validate): verify published catalog matches source`

### 61fa6f5 — 2026-11-01
- **Files:** `catalog.json`, `data/alternatives-curated.json`, `data/card-metadata/image-validation.json`, `generated/*`, `worker/index.js`
- **What:** Adds `data/card-metadata/image-validation.json` and updates alternatives so `imageDecoded` becomes true, switching image URLs from `/es/` to `/en/` where Spanish art was unavailable and recording a `language` field; regenerates hashed resources.
- **Why:** Re-validate and fix alternative images that failed to decode (falling back to English art) and persist the validation results.
- **Conventional:** `fix(resources): decode-validate alternative images`

### ec0f737 — 2026-11-07
- **Files:** `batch-export.js`, `build-worker.py`, `journey.js`, `worker/index.js`
- **What:** Adds a new `batch-export.js` module that formats a user's collected card batches into Limitless "List input" proxy lines (name/set/number), preserving album order and batch boundaries. It injects a "Copiar tandas" button, a per-batch copy button, a clipboard receipt, and a fallback manual-copy dialog.
- **Why:** Introduce a feature to copy card codes per batch for proxy printing; `build-worker.py` bundles the module and `journey.js` exposes `exportGroups()` to feed it.
- **Conventional:** `feat(export): add batch card export for proxies`

### fe8f2fb — 2026-11-07
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Rebuilds the export bar with a "Tus tandas" heading, batch/card counts, and per-batch copy buttons; adds loading/copying/copied states, an animated check icon, and a richer receipt with title + hint.
- **Why:** Polish the batch-export UI and its feedback for a clearer, more informative interface.
- **Conventional:** `style(export): polish batch export UI and feedback`

### 9af144c — 2026-11-07
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Adds "quiet confirmation" CSS to keep per-batch copy buttons transparent and non-disruptive, repositions/restyles the receipt, replaces the link with an arrow "Pegalas en Limitless" link, and swaps the per-batch count for a "n copiadas" message on copy.
- **Why:** Refine copy confirmation so the card grid stays stable and feedback is subtler.
- **Conventional:** `style(export): refine quiet copy confirmation`

### 3510d3d — 2026-11-07
- **Files:** `batch-export.js`, `journey.js`, `worker/index.js`
- **What:** Swaps the upload icon for a copy glyph and restructures each batch header into a `.batch-heading` (title + state) inside `journey.js`; adds `data-copy-label` and dynamic aria-labels for the copy buttons.
- **Why:** Improve accessibility labels and the batch header layout ahead of further styling.
- **Conventional:** `style(export): rework batch header and a11y labels`

### ebaaf65 — 2026-11-07
- **Files:** `batch-export.js`, `journey.js`, `worker/index.js`
- **What:** Makes the batch heading a row layout, shortens copy feedback to 1500ms, changes the receipt title to "Copiado", and replaces the journey count with "n/15" plus aria-labels and a per-section aria-label.
- **Why:** Simplify feedback wording and strengthen screen-reader descriptions of batch progress.
- **Conventional:** `style(export): simplify copy feedback and counts`

### 59d563c — 2026-11-07
- **Files:** `batch-export.js`, `page.html`, `worker/index.js`
- **What:** Removes the obsolete active-batch progress underline CSS from `page.html` and zeroes the `.batch-group h3` padding in `batch-export.js`.
- **Why:** Clean up leftover progress-bar styling replaced by the new batch headers.
- **Conventional:** `style(album): remove active-batch progress underline`

### 732783e — 2026-11-07
- **Files:** `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Limits the album index preview to 3 images and drops the "· n tandas" suffix; adds an `album-scrubbing` class to the sheet during drags; moves each batch heading inside its export button and hides export symbols while scrubbing.
- **Why:** Integrate the export buttons into the album scrubbing/navigation interaction.
- **Conventional:** `feat(album): align export buttons with album scrubbing`

### 0a2bffe — 2026-11-07
- **Files:** `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Raises the preview image slice to 15 and restyles the preview panel into a bordered 5-column grid (min 234px) with fixed-aspect card images.
- **Why:** Show a fuller batch in the album index preview with a more polished panel.
- **Conventional:** `style(album): expand preview to 5-column grid`

### a1dbfd4 — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Rewrites album navigation into a `measure`/`update` model with section offsets and a pointer-driven scrubber (precision gain, pending scroll, focus/pause states); adds a new `album-navigation.test.cjs` harness with drag/release tests; CSS hides the preview and adds precision/scrubbing/navigation-focus styles.
- **Why:** Introduce a scrollbar-style navigation rail with unit tests verifying drag behavior.
- **Conventional:** `feat(album): rework album navigation with tests`

### a8c0936 — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Replaces the stepped gain with a continuous exponential sensitivity curve, integrates coalesced pointer events, and shows "Tanda n" in the album heading during a paused drag; adds precision-boundary tests.
- **Why:** Smooth the drag sensitivity and surface the focused batch in the heading.
- **Conventional:** `refactor(album): smooth drag sensitivity curve`

### 089ce15 — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Replaces precision-scrubbing with a "viewing" mode: dragging a long album shows a full-screen overlay viewer previewing the batch while the grid stays still, committing scroll on release and restoring on cancel; rewrites the tests and adds `.album-viewer` CSS.
- **Why:** Switch long albums to a dedicated batch viewer overlay instead of inline scrubbing.
- **Conventional:** `feat(album): overlay batch viewer while scrubbing`

### 3e92a22 — 2026-11-07
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Narrows the `.album-viewing` visibility rule to hide only siblings other than `#album-index` and `#album-index-preview`.
- **Why:** Fix the viewer overlay accidentally hiding the navigation rail and preview.
- **Conventional:** `fix(album): keep rail visible in viewer mode`

### b93dc1f — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Replaces the overlay viewer with a "recovery" pill (`#album-recovery`) plus edge-running auto-scroll: one comfortable drag maps to one batch regardless of collection size, and holding an edge auto-advances; rewrites tests and adds recovery/edge-running CSS.
- **Why:** Trade the full-screen viewer for lighter recovery navigation with edge autoscroll.
- **Conventional:** `feat(album): edge autoscroll and recovery pills`

### e1cfe31 — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Replaces the edge/recovery model with anchored track expansion: the thumb keeps its grip while the expanded track follows the finger exactly and a stationary "map-preview" shows the target batch, committing the selected batch on release; rewrites tests and adds `map-preview` CSS.
- **Why:** Rework navigation into an anchored thumb plus stationary preview map.
- **Conventional:** `refactor(album): anchored track drag with map preview`

### 4584007 — 2026-11-07
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Adds progressive preview expansion (3 reference cards expanding to 5 after 250ms), a >4px movement threshold so a tap preserves position, and commit-on-move semantics; centers the map preview and animates its width; updates tests for expansion, stationary preview, and no-drag preservation.
- **Why:** Refine preview expansion animation and ensure taps don't commit an accidental scroll.
- **Conventional:** `feat(album): progressive preview expansion`

### b245e26 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Reworks album preview rendering to lazily create only visible card refs in a per-batch `Map`, adds a `place` helper setting `--slot` and a `motion` animation helper, and animates the preview entrance plus a batch-heading pulse on release. Rewrites the map-preview CSS with a stable centered backdrop and connector line.
- **Why:** Improve preview render efficiency and add subtle motion/polish to the album scrubber.
- **Conventional:** `feat(app): lazy centered album preview + motion`

### 126ed23 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Adds a `handoff` counter, makes the preview follow the finger via `positionPreview`, and on release keeps it visible through the destination's first paint with a fade-out, heading pulse, and brightness highlight on matching cards. Tests updated to assert the preview now moves.
- **Why:** Make the scrubber preview track the finger and hand off gracefully to the committed batch.
- **Conventional:** `feat(app): preview follows finger and hands off`

### ab0d449 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Reverses the `--slot` ordering so the last card stays anchored right, tweaks the preview vertical offset, and updates CSS to drop the centered backdrop/connector and right-anchor the cards; test asserts the last card stays anchored.
- **Why:** Use the rightmost card and destination number as a fixed visual anchor during expansion.
- **Conventional:** `refactor(app): anchor preview cards right`

### 86cf7af — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `worker/index.js`
- **What:** Tags each preview image with `_albumIndex` and adds `fly`/`morphLanding` that clone preview refs and animate them to their matching destination card rectangles, hiding targets and fading others; interrupts landing on touchstart/wheel.
- **Why:** Animate preview cards flying into their destination grid slots when a batch is committed.
- **Conventional:** `feat(app): morph preview cards into grid`

### d900445 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `worker/index.js`
- **What:** Shortens the fly animation (200→170ms) with a new easing, animates the destination number and fades unmatched targets faster, and tightens the preview entrance motion.
- **Why:** Tighten and smooth the landing/morph animations.
- **Conventional:** `style(app): tighten album landing timings`

### 4bd24dc — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Drops the "Tanda " prefix so the label shows only the number, sources the landing number from `#album-index-label`, adjusts the preview offset, and restyles the label as a circular badge with a new scrubber thumb. Adds a clamp/positioning test.
- **Why:** Present the destination number as a badge and keep the preview above the thumb.
- **Conventional:** `feat(app): number badge + clamped preview`

### f168a80 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Adds a `railTouch` flag and touchstart/move/end listeners so native scrolling is prevented only for gestures starting on the scrubber, plus overscroll-behavior and `touch-action:none` CSS. Adds a corresponding test.
- **Why:** Own only scrubber-originated gestures while keeping ordinary album scrolling native.
- **Conventional:** `fix(app): capture only scrubber touches`

### 196c8fa — 2026-11-08
- **Files:** `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Stops setting `--origin-position` on pointerdown and replaces the rail dot markers with a single scrubber `::before` bar, disabling the `::after` decorations.
- **Why:** Simplify the scrubber thumb styling.
- **Conventional:** `style(app): simplify scrubber thumb`

### 2602d31 — 2026-11-08
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Enlarges the preview (height 96px), moves the card row down and bigger (53px/75px), and relocates the label to a tiny top-right position.
- **Why:** Make preview cards larger and reposition the label.
- **Conventional:** `style(app): enlarge preview cards`

### 6c36181 — 2026-11-08
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Shrinks the preview, removes its `::before` backdrop, moves the label into a circular badge, and adds a card box-shadow.
- **Why:** Drop the backdrop and move the number into a circular badge.
- **Conventional:** `style(app): circular badge, drop backdrop`

### 89d271e — 2026-11-08
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Re-adds the `::before` backdrop with an inset that expands on `.expanded`, and hides the scrubber `::before` thumb entirely.
- **Why:** Restore the expanding backdrop while hiding the scrubber thumb.
- **Conventional:** `style(app): restore backdrop, hide thumb`

### 156d33f — 2026-11-08
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Re-adds the scrubber `::before` as a thin rail bar that fades to transparent while scrubbing.
- **Why:** Show a persistent rail bar that fades during scrubbing.
- **Conventional:** `style(app): rail bar fades while scrubbing`

### f4515bb — 2026-11-08
- **Files:** `app.js`, `detail-return.test.cjs`, `worker/index.js`
- **What:** Rewrites `closeDetail()` to clone the viewer image and animate it back to its origin thumbnail, scrolling the sheet to reveal it when offscreen, and replaces the old return-highlight with a cancellable cleanup. Adds `detail-return.test.cjs`.
- **Why:** Animate the card flying back to its collection tile on close instead of a static highlight.
- **Conventional:** `feat(app): animate detail close to tile`

### 275bc85 — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Adds pointerdown/keydown listeners toggling a `keyboard-navigation` class on `#card-detail`, plus CSS that hides the focus-visible outline on buttons unless navigating by keyboard.
- **Why:** Prevent dialog autofocus from looking like a persistent touch selection.
- **Conventional:** `fix(app): suppress focus ring for touch`

### fd62034 — 2026-11-08
- **Files:** `album-navigation.test.cjs`, `app.js`, `batch-export.js`, `worker/index.js`
- **What:** Adds `railTravel`/`positionGrip` to drive the scrubber via a continuous `--index-offset` (px) with `translate3d`, and adds a test asserting the grip follows exact scroll progress.
- **Why:** Track native scroll continuously instead of easing to a stale position.
- **Conventional:** `fix(app): continuous scroll grip tracking`

### d7c173e — 2026-11-08
- **Files:** `batch-export.js`, `worker/index.js`
- **What:** Zeroes the album's bottom dock clearance (padding-bottom, inner padding, round-memories margin, last batch-group padding).
- **Why:** Let the album end cleanly after its oldest batch without the old dock clearance.
- **Conventional:** `style(app): drop album dock clearance`

### 8e42723 — 2026-11-08
- **Files:** `app.js`, `page.html`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Adds `bindRefinementChoice` with hold-to-peek overlay, press/cancel/move handling, and synthetic-click suppression; makes the "both" button icon-only; adds pair press/chosen/unchosen animations and a peek overlay. Adds `refinement-gestures.test.cjs`.
- **Why:** Add tap/hold gestures and polish to the preference refinement step.
- **Conventional:** `feat(app): hold-to-peek refinement gestures`

### fdd800b — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Un-hides stage cards on refinement finish; `chooseRefinement` sets `--choice-rise` and toggles chosen/unchosen with a 210ms delay; adds CSS so the chosen card reveals through travel and the pair slides away.
- **Why:** Reveal the chosen card by sliding the pair apart instead of a white fade.
- **Conventional:** `feat(app): chosen card travel reveal`

### 058cf8e — 2026-11-08
- **Files:** `page.html`, `worker/index.js`
- **What:** Disables text selection and touch callouts globally, re-enabling them only for inputs/textareas/contenteditable.
- **Why:** Prevent browser text selection and callouts during card hold gestures.
- **Conventional:** `style(app): disable text selection`

### adcc3cf — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Moves the "both" equal tool into a separate footer under `#app`, adds `equalPress` state with pointer listeners, a ResizeObserver setting `--duel-half`, and half-card clip-path; adds footer equal-button CSS.
- **Why:** Make equality a distinct footer action with half-card windows.
- **Conventional:** `feat(app): separate footer equal button`

### 28abc8e — 2026-11-08
- **Files:** `app.js`, `worker/index.js`
- **What:** Replaces the manual refinement icon SVG with a new paired-glyph design.
- **Why:** Update the manual refinement icon.
- **Conventional:** `style(app): update refinement icon`

### 1e178dd — 2026-11-08
- **Files:** `app.js`, `worker/index.js`
- **What:** Replaces the manual refinement icon SVG again (new viewBox and path).
- **Why:** Further refine the manual icon glyph.
- **Conventional:** `style(app): refine manual icon glyph`

### b4a9da0 — 2026-11-08
- **Files:** `app.js`, `page.html`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Replaces the hold overlay with `holding-upper`/`holding-lower` classes that slide the actual cards apart, removing the `.refinement-peek` overlay CSS; updates tests accordingly.
- **Why:** Inspect cards by sliding them apart in place rather than a separate overlay.
- **Conventional:** `refactor(app): slide cards apart on hold`

### 29b668d — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Clears `equal-exit` on new pairs, adds an equality-exit path in `chooseRefinement`, and introduces a shared `--battle-footer-bottom` footer alignment plus front-refine positioning; tweaks the manual icon.
- **Why:** Add an equality-exit path with consistent footer alignment.
- **Conventional:** `feat(app): equal-exit refinement path`

### b33b4c0 — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Skips the 170ms close delay when `equal-exit` is present, applies a half-window clip-path and stacking transforms to the equal-exit chosen cards, and tweaks the manual icon.
- **Why:** Close instantly on equality with a half-window reveal.
- **Conventional:** `fix(app): instant equality exit reveal`

### df67518 — 2026-11-08
- **Files:** `app.js`, `page.html`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Adds `exitEqualRefinement()` that builds an overflow cover with two cloned panels traveling apart (±half) after `finishRefinement` mounts the next pair underneath; removes the obsolete `:has` rule and adds a test for the split sequence.
- **Why:** Animate the two equal cards separating while the next pair mounts beneath them.
- **Conventional:** `feat(app): split equal-exit into next pair`

### d6ed8ad — 2026-11-08
- **Files:** `app.js`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Renames `exitEqualRefinement` to `exitRefinement(winner=2)` and unifies the equal/tie exit with the chosen-card exit. `chooseRefinement` drops the per-button `chosen`/`unchosen` toggling and always calls `exitRefinement(winner)`, and the winning panel gets a brief scale pulse.
- **Why:** Collapse the two refinement-exit branches into one shared handoff animation.
- **Conventional:** `refactor(app): unify refinement exit handoff`

### 1bc41b8 — 2026-11-08
- **Files:** `app.js`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Reworks `exitRefinement` so a chosen card uses full-height panels that align edge-to-edge before traveling, via a two-stage keyframe animation (align then travel) at 360ms; cleanup timeout becomes `duration+60`.
- **Why:** Make the picked card's exit read as one continuous aligned motion.
- **Conventional:** `refactor(app): align chosen card on exit`

### c7a6466 — 2026-11-08
- **Files:** `app.js`, `battle-session.test.cjs`, `journey.js`, `preference.test.cjs`, `worker/index.js`
- **What:** Adds `PokePreference.plan()` to deterministically generate a multi-pair comparison session (balance/exposure/relevance/age scoring, seeded tie rotation); `pair()` becomes a one-pair wrapper. `beginManualRefinement` plans a session up front, pre-decodes artwork per pair (`prepareRefinementPair`), validates the session against favorites/reset, and saves after each choice.
- **Why:** Replace ad-hoc refinement with a pre-planned, artwork-prewarmed, invalidatable battle session.
- **Conventional:** `feat(battle): plan pre-warmed refinement sessions`

### 9018a9a — 2026-11-08
- **Files:** `app.js`, `batch-export.js`, `collection-cue.test.cjs`, `journey.js`, `page.html`, `worker/index.js`
- **What:** Adds `PokeCollectionCue` which pulses a heart "breath" on the collection button at most twice per new batch and scrolls to it on click; `celebrate()` calls it. batch-export.js updates the album counter data attribute and reorders the export bar; CSS adds `collection-breathe`.
- **Why:** Give a subtle, non-perpetual cue that a new batch is ready to review.
- **Conventional:** `feat(app): cue collection on new batch`

### ac8e4e6 — 2026-11-08
- **Files:** `app.js`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Adds `launchCard()`, animating a released card fully opaque off-screen via Web Animations (direction-aware distance, momentum-based speed) then removing it, replacing the prior inline CSS transition in `vote()`.
- **Why:** Keep released artwork opaque and moving until it fully clears the viewport.
- **Conventional:** `feat(app): animate card flight via WAAPI`

### 758d5fa — 2026-11-08
- **Files:** `app.js`, `page.html`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Replaces the `decision-glow` sigil confirmation and animationend-driven `pulseCollection` with a `decisionGeneration` counter; the collection pulse now fires only on a successful "yes" flight completion. Hides `.decision-glow .sigil` and disables the exiting stamp animation.
- **Why:** Remove the second floating confirmation so the badge shares the card's own flight.
- **Conventional:** `refactor(app): pulse collection on like flight`

### c4ffb99 — 2026-11-08
- **Files:** `app.js`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Adds `c.getFlightPose()` and rebuilds `launchCard` to emit transform lists that preserve the card's tilt/scale/depth (only translation changes), using a fixed 260ms duration.
- **Why:** Preserve the card's pose through flight instead of resetting to a flat rotation.
- **Conventional:** `feat(app): preserve pose during flight`

### 11587d9 — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Sets the stamp `transform` only when not already set, and replaces stamp CSS with explicit transitions for opacity/transform/color/box-shadow plus heart fill so geometry stays stable while colors settle.
- **Why:** Let the decision badge settle colors smoothly without a transform jump on release.
- **Conventional:** `fix(app): stabilize decision badge transitions`

### 36b7ce5 — 2026-11-08
- **Files:** `app.js`, `material-renderer.js`, `material.test.mjs`, `page.html`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Adds a `beginFlight()`/`flights` gate in `PokeMaterial` so material uploads wait for in-flight cards and resume once (deferring scene attach and prepare); `launchCard` calls it. Adds a `.material-canvas` `foil-arrive` fade-in.
- **Why:** Coordinate WebGL foil activation with the card flight so foil doesn't pop in over a moving card.
- **Conventional:** `feat(material): gate foil behind flights`

### b04750e — 2026-11-08
- **Files:** `material-gpu.test.cjs`, `material-renderer.js`, `worker/index.js`
- **What:** Adds an LRU texture cache (3 entries) keyed by asset bundle, skips etch sampling for non-etched cards in the shader, caps decoded texture resolution to 1024px and draw resolution to 480px; adds material-gpu tests.
- **Why:** Reduce GPU memory and repeated decode/upload work by reusing textures and bounding resolutions.
- **Conventional:** `perf(material): cache textures, bound resolution`

### 5769398 — 2026-11-08
- **Files:** `app.js`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Removes the stamp/decision badge from `makeCard` entirely, and rewrites `launchCard` to interpolate a shared `swipeArc` curve (17 keyframes carrying rotation and downward travel); drops the completion pulse.
- **Why:** Fold decision feedback into the card's own curved flight, dropping the separate stamp.
- **Conventional:** `refactor(app): flight follows swipe arc`

### 4a68449 — 2026-11-08
- **Files:** `app.js`, `artwork-handoff.test.cjs`, `journey.js`, `swipe-coordinator.test.cjs`, `swipe-flight.test.cjs`, `worker/index.js`
- **What:** Adds a `swipeTasks`/`afterSwipe` coordinator deferring secondary work (persist, engine delta, surface attach, artwork substitution) behind the active gesture/flight with deadlines; `img()` defers exact-artwork swap; journey.js splits `favoriteCount()` from `favorites()` to avoid recomputing the model when only counting.
- **Why:** Keep gesture latency low by deferring non-critical work, and skip model recomputation in hot count paths.
- **Conventional:** `perf(app): coalesce work behind swipes`

### e0c938c — 2026-11-08
- **Files:** `page.html`, `worker/index.js`
- **What:** Adjusts the decision-glow radial gradient colors and the choice-light gradient stops/opacities.
- **Why:** Strengthen the decision feedback tint contrast on the card.
- **Conventional:** `style(app): strengthen decision glow tints`

### 02b5fd3 — 2026-11-08
- **Files:** `app.js`, `page.html`, `swipe-seal.test.cjs`, `worker/index.js`
- **What:** Adds `paintSwipeSeal()` and a card-bound `.swipe-seal` (heart/cross with progressive fill) driven by gesture strength/direction; `vote` commits it via `c.commitDecision`. Removes the old stamp badge handling.
- **Why:** Replace the floating badge with a card-bound seal that tracks the swipe.
- **Conventional:** `feat(app): card-bound swipe decision seal`

### 963e898 — 2026-11-08
- **Files:** `app.js`, `page.html`, `worker/index.js`
- **What:** Softens the seal scale curve to `.94+amount*.06` and enlarges/recenters the seal to 56px with a bigger icon.
- **Why:** Refine the seal's size and scaling for better visual balance.
- **Conventional:** `style(app): enlarge and recenter swipe seal`

### ac8f116 — 2026-11-08
- **Files:** `page.html`, `worker/index.js`
- **What:** Enlarges the swipe seal to 68px, adds a gradient fill/background and layered shadow, and bumps the icon to 36px.
- **Why:** Make the decision seal more prominent and dimensional.
- **Conventional:** `style(app): polish swipe seal depth`

### 0d6e9ee — 2026-11-08
- **Files:** `app.js`, `battle-feedback.test.cjs`, `page.html`, `refinement-gestures.test.cjs`, `worker/index.js`
- **What:** Adds `battleFeedback()`/`markBattleChoice()` showing a centered heart overlay on the chosen (or both, for equality) battle halves during refinement, including a clone in the moving exit panel; adds `.battle-feedback`/`.battle-heart` CSS.
- **Why:** Show which battle card was picked during refinement duels.
- **Conventional:** `feat(battle): mark chosen battle half`

### 1c569f8 — 2026-11-08
- **Files:** `catalog.json`, `data/card-metadata/*`, `generated/card-resources/*`, `main-card-additions.test.cjs`, `worker/index.js`
- **What:** Rebuilds catalog.json as pretty-printed JSON and adds card-metadata files (image-validation, main-card-additions, proxies) plus regenerated proxies/manifest/report and a test; worker/index.js re-embeds the expanded catalog.
- **Why:** Bulk-expand the card catalog and its metadata/validation assets (generated data).
- **Conventional:** `build(data): expand catalog and metadata`

### 9cf2f69 — 2026-11-08
- **Files:** `catalog.json`, `data/card-metadata/hif-image-corrections.json`, `data/card-metadata/image-validation.json`, `hif-images.test.cjs`, `worker/index.js`
- **What:** Switches ~56 shiny-vault entries from broken Spanish image URLs to verified English ones, adds `fallbackImage` fields, and records corrections/validation in new hif-image-corrections.json with an accompanying test.
- **Why:** Fix 404 Spanish images by pointing to verified English variants.
- **Conventional:** `fix(data): correct broken HIF image sources`

### bc22b2a — 2026-11-08
- **Files:** `page.html`, `worker/index.js`
- **What:** Adds `.debug-mode` CSS making the debug collection sheet an edge-to-edge contact sheet (6→8 column grid, full touch targets, hidden summary/settings).
- **Why:** Improve the debug card browser layout for inspecting prints.
- **Conventional:** `style(app): edge-to-edge debug contact sheet`

### 34b0a0c — 2026-11-08
- **Files:** `catalog.json`, `data/card-metadata/*`, `generated/card-resources/*`, `hif-images.test.cjs`, `main-replacements.test.cjs`, `material.test.mjs`, `worker/index.js`
- **What:** Applies the first wave of card print replacements (image/card/artist swaps, several material-matched surfaces dropped to null) via main-replacements-2026-11-08.json, and regenerates validation/proxies/manifest/report.
- **Why:** Correct mis-assigned card prints and refresh proxy/validation metadata.
- **Conventional:** `build(data): apply main card replacements`

### 54a6b31 — 2026-11-08
- **Files:** `catalog.json`, `data/card-metadata/*`, `generated/card-resources/*`, `hif-images.test.cjs`, `material.test.mjs`, `wave2-replacements.test.cjs`, `worker/index.js`
- **What:** Applies the second wave of card print replacements (wave2) and regenerates validation/proxies/manifest/report.
- **Why:** Continue the print-correction audit in a second batch.
- **Conventional:** `build(data): apply wave-2 card replacements`

### 4dc8940 — 2026-11-08
- **Files:** `catalog.json`, `data/card-metadata/*`, `generated/card-resources/*`, `hif-images.test.cjs`, `wave3-replacements.test.cjs`, `worker/index.js`
- **What:** Applies the third wave of card print replacements (wave3), including some TCGplayer image URLs, and regenerates validation/proxies/manifest/report.
- **Why:** Finish the print-correction audit with a third batch.
- **Conventional:** `build(data): apply wave-3 card replacements`

### e867ab3 — 2026-11-08
- **Files:** `app.js`, `debug-peek.test.cjs`, `worker/index.js`
- **What:** Adds `debugTileAtPoint()` hit-testing and rewrites `paintDebugPeek`/`moveDebugPeek` to preview a `low.webp` immediately (with onerror fallback) then swap to `high.webp`, tracking the tile under the finger robustly.
- **Why:** Preview debug zooms faster and track the correct tile despite iOS pointer-capture quirks.
- **Conventional:** `fix(app): improve debug peek hit-testing`

### 5bc70e6 — 2026-11-08
- **Files:** `app.js`, `debug-peek.test.cjs`, `worker/index.js`
- **What:** Makes `paintDebugPeek` use `p.image` (or the tile's currentSrc) as the full-res source and guards onerror/high-image onload with serial checks so the zoom preview stays on the selected print.
- **Why:** Keep the debug zoom preview on the selected print instead of a different fallback.
- **Conventional:** `fix(app): keep debug zoom on selected print`

### 22cd78a — 2026-11-08
- **Files:** `album-reading.test.cjs`, `app.js`, `collection-cue.test.cjs`, `page.html`, `worker/index.js`
- **What:** Adds a "settled batch" module that auto-expands the most-overlapping batch group (`reading-batch`) after ~2s idle in rounds mode, animating tiles via FLIP and anchoring scroll; suppresses during scroll/pointer/reduced-motion with a cooldown. Adds 3-column expanded-grid CSS.
- **Why:** Auto-expand a settled batch for easier reading without disturbing native scrolling.
- **Conventional:** `feat(app): auto-expand settled album batch`

### 54c0db8 — 2026-11-08
- **Files:** `album-reading.test.cjs`, `app.js`, `worker/index.js`
- **What:** Refines the batch auto-expand anchor to follow the batch heading on open and the reached content on close, includes headings in the animated elements, and delays re-inspect during the quiet window instead of skipping.
- **Why:** Keep scroll anchored correctly as a batch expands and contracts.
- **Conventional:** `fix(app): anchor batch expansion to heading`

### 3d537ec — 2026-11-09
- **Files:** `app.js`, `journey.js`, `material-assets.js`, `resource-coordinator.js`, `build-worker.py`, `worker/index.js`
- **What:** Adds a new `resource-coordinator.js` exposing `window.PokeResources` (a shared, deduplicating download queue with priority plans, adaptive windowing, concurrency cap, and metrics). Rewrites `app.js` `img()`/`makeCard`/`render`/viewer logic to plan/release through it, and makes `material-assets.js` delegate to it. `journey.js` switches thumbnails to `p.image` and guards `remember()`.
- **Why:** Consolidate image/material fetching into one coordinator so discovery, viewer, and materials share in-flight downloads instead of each module caching separately.
- **Conventional:** `feat(resources): add shared PokeResources queue`

### df38f34 — 2026-11-09
- **Files:** `app.js`, `material-assets.js`, `resource-coordinator.js`, `worker/index.js`, `build-worker.py`
- **What:** `img()` gains an `artReady` promise that decodes after load; `makeCard`/`warmArtwork` key off it. Worker material routes add a `caches.default` edge-cache layer (`remember`/`match`). Coordinator adds a `completed` metric and leaves a concurrency slot for urgent loads; `material-assets.getBlob` bumps non-front priority.
- **Why:** Track exact decoded-image readiness and serve cached material from the edge to skip R2/upstream round-trips.
- **Conventional:** `feat(worker): edge-cache materials and art readiness`

### c8948ff — 2026-11-09
- **Files:** `catalog.json`, `data/card-metadata/main-replacements-wave4-2026-11-09.json`, `data/card-metadata/proxies.json`, `generated/card-resources/*`
- **What:** Replaces many `tcgp/P-A` card images with `sv`/`swsh`/`me` prints, sets `surface` to `null`, and adds `fallbackImage` per card. Introduces a wave-4 replacements metadata file and expands proxies.json.
- **Why:** Migrate the catalog to verified Spanish prints and record the wave-4 replacement mapping for provenance.
- **Conventional:** `chore(data): apply wave-4 print replacements`

### 20a69ac — 2026-11-09
- **Files:** `page.html`, `worker/index.js`
- **What:** Changes `#app` `overflow:hidden` to `overflow:visible`.
- **Why:** Let card artwork extend beyond the app frame without clipping.
- **Conventional:** `style(app): allow card overflow beyond frame`

### 390ef4b — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Adds `updateBattleLayout()` toggling a `battle-wide` mode on ≥760px screens, lays the pair out horizontally, and reworks the exit animation to translate cards along X when wide.
- **Why:** Present the refinement duel side-by-side on tablet-width hosts instead of stacked vertically.
- **Conventional:** `feat(battle): wide horizontal duel layout`

### 4f4016d — 2026-11-09
- **Files:** `app.js`
- **What:** `prepareRefinementPair` now waits on `art.artReady`/`cardReady`/`naturalWidth` (22s timeout) instead of `load`+`decode`, and releases the `battle` plan on finish/failure.
- **Why:** Prevent an empty (complete-but-sourceless) image from passing battle readiness and failing the duel.
- **Conventional:** `fix(battle): gate battle on decoded artwork`

### 21319c1 — 2026-11-09
- **Files:** `app.js`, `resource-coordinator.js`, `worker/index.js`
- **What:** Adds `artTiming` timestamps to `img()`; introduces `prepareBattleCandidate()` to pre-plan a `battle-preview` and reuse its artwork; reuses `manualSession.art` in `paintRefinement`. Coordinator records per-request `timings`.
- **Why:** Preload the next battle pair in the background and reuse the exact decoded image on tap, with instrumentation for latency.
- **Conventional:** `feat(battle): preload candidate and timing`

### 6598703 — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Adds battle progress state/painting (`battleProgressState`, `paintBattleProgress`, `commitBattleProgress`) rendering a dots indicator with a completed-acknowledgement cue, plus `refine-dots` CSS.
- **Why:** Show session progress on the refine button and briefly confirm the final choice.
- **Conventional:** `feat(battle): session progress indicator`

### 13571ec — 2026-11-09
- **Files:** `app.js`
- **What:** Adds `artworkReady()` to attach readiness to native `Image` objects (used by alternate encounters) and records `session.loadFailures` on preparation failure.
- **Why:** Let preloaded native alternative images satisfy battle readiness without redownload.
- **Conventional:** `fix(battle): native preloaded image readiness`

### 8b1a0f0 — 2026-11-09
- **Files:** `catalog.json`, `data/card-metadata/main-replacements-wave4-2026-11-09.json`, `worker/index.js`
- **What:** Corrects Eternatus (id 890): swaps `swsh11tg` image for `swsh11/TG21`, and changes rarity/artist; adds metadata/validation to the wave-4 record.
- **Why:** Fix the wrong set code and metadata for the Eternatus print.
- **Conventional:** `fix(data): correct Eternatus TG21 print`

### fac6c77 — 2026-11-09
- **Files:** `app.js`, `card-identity.js`, `journey.js`, `resource-coordinator.js`, `build-worker.py`, `RESOURCE-ARCHITECTURE.md`
- **What:** Adds `card-identity.js` (`window.PokeCards` with `resolve`/`key`/`windowIndices`) producing frozen, immutable presentation references. `journey.js` and `resource-coordinator.js` switch to these keys; coordinator adds `invalidate()` and release-cancels queued work. Adds `card-identity.test.mjs` and the architecture doc.
- **Why:** Normalize print/language/revision identity so caches, album tiles, and downloads key off a stable reference instead of raw URLs.
- **Conventional:** `feat(resources): immutable card identity`

### 909b43f — 2026-11-09
- **Files:** `app.js`, `card-identity.js`, `card-resources.js`, `journey.js`, `resource-coordinator.js`, `build-worker.py`, `scripts/build-card-resources.py`, `worker/index.js`
- **What:** Adds `install()` to build species/print/locale indexes, `PokeCardResources.installBundle()` for atomic bundle install, a `/catalog-bundle.json` worker route, and `bindImage`/`observeImage`/`releaseImage` presentation leases in the coordinator. `app.js` `init()` fetches the bundle; journey thumbnails use intersection-based start/stop.
- **Why:** Serve catalog + proxies + alternatives atomically from one revision and give every image consumer a unified lease lifecycle.
- **Conventional:** `feat(resources): atomic bundle and image leases`

### eea95af — 2026-11-09
- **Files:** `app.js`, `journey.js`, `resource-coordinator.js`
- **What:** `bindImage` gains a `tryNative` fallback that retries the identical native URL when the compressed fetch fails; `app.js`/`journey.js` guard the `artReady` callback against a released/rebound presentation. Adds presentation tests for fetch-failure retry, release-as-cancellation, and sprite-only-after-retry.
- **Why:** Recover from coordinator fetch failures via a browser-native load and stop stale callbacks from swapping a cancelled presentation to a sprite.
- **Conventional:** `fix(resources): native fallback on fetch failure`

### 339f5e6 — 2026-11-09
- **Files:** `app.js`, `discovery-buffer.js`, `resource-coordinator.js`, `page.html`
- **What:** Adds `discovery-buffer.js` (`window.PokeDiscoveryBuffer`) holding one presentation per upcoming print. `makeCard` takes from the buffer with `transferTo` front/back/flight; `render` reconciles it; `vote` ignores incomplete/committed cards; coordinator adds `preparePresentation` and per-kind (`byKind`) stats. Adds `.preparing`/`.load-error` CSS and `discovery-buffer.test.mjs`.
- **Why:** Reuse one DOM image/resource lease across back→front→flight to keep swipe continuity and bound decoded memory.
- **Conventional:** `feat(discovery): presentation buffer for continuity`

### 5240316 — 2026-11-09
- **Files:** `app.js`, `discovery-buffer.js`, `material-renderer.js`
- **What:** Discovery buffer grows its window 5→10 on sub-300ms advances (24MiB pixel budget). Material renderer adds a gesture gate (`beginInteraction`) with a 180ms quiet interval, and clears reused WebGL canvas transparently before mounting. `app.js` holds the gate during pointer gestures.
- **Why:** Reduce buffer starvation during rapid swipes and defer foil decode/upload while the user is interacting.
- **Conventional:** `feat(material): gesture gate and burst buffer`

### 4cd28c5 — 2026-11-09
- **Files:** `journey.js`, `resource-coordinator.js`, `page.html`
- **What:** `rewardThumbnail` draws an already-decoded image onto a small canvas instead of downloading a thumbnail; coordinator exposes `readyImage()`. CSS accepts `canvas` in reward slots and speeds the reward transition.
- **Why:** Reuse the exact decoded front for the completion reward preview, avoiding a redundant download/decode.
- **Conventional:** `perf(journey): reuse decoded art for reward`

### 7584db6 — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Adds `cueBattleEntrance()` with a `battle-clash` bolt overlay, opposite-motion card slide, impact sound (`sound('battle')`), and delayed idle hints; wires cleanup into finish/exit/choose. Adds `battle-entrance.test.cjs`.
- **Why:** Give the refinement duel a tactile entrance animation and impact feedback without a full-screen flash.
- **Conventional:** `feat(battle): entrance clash animation and sound`

### 7770ff7 — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Replaces the simple bolt glyph with a multi-segment lightning `spine`/`branches` and layered `.clash-aura`/`.clash-branches`/`.clash-edge`/`.clash-core` strokes, oriented per `battle-wide`.
- **Why:** Make the clash effect richer and orientation-aware.
- **Conventional:** `style(battle): layered lightning clash`

### ec3d3bc — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Replaces the two-tone `battle` sound with a synthesized noise-buffer crackle through a bandpass filter, and lengthens the bolt animation to 560ms while tightening its sizing.
- **Why:** Produce a short filtered crackle locally with no audio download, and slow the clash slightly.
- **Conventional:** `perf(battle): synthesize clash crackle`

### 9144584 — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Lengthens the bolt animation to 740ms and adds `clash-shift` keyframes (scaleX/scaleY flips) plus `overflow:visible` and a wider clash track.
- **Why:** Add a shimmer/oscillation to the clash and keep the expanded bolt from clipping.
- **Conventional:** `style(battle): animated clash shimmer`

### cd553a7 — 2026-11-09
- **Files:** `app.js`
- **What:** Adds `prepareAutomaticBattle`/`clearAutomaticBattle` to preload the automatic duel pair via `bindImage`, reusing those exact image nodes in `paintRefinement`; `runEvents`/`render` guard promotion behind readiness and clear stale candidates. Adds `automatic-battle.test.mjs`.
- **Why:** Preload automatic refinement pairs so they mount instantly without interrupting discovery to download.
- **Conventional:** `feat(battle): preload automatic duel pair`

### 3078312 — 2026-11-09
- **Files:** `app.js`, `page.html`
- **What:** Adds `ondragstart` prevention to debug tiles and battle buttons; hardens `bindRefinementChoice` with multi-pointer guards (ignore secondary pointers); switches entrance/idle animations to individual `translate` axes and `.pressing` to the `scale` property. Updates gesture/entrance tests.
- **Why:** Prevent native drag from hijacking touches and ensure a secondary finger can't restart or cancel the first pointer's hold.
- **Conventional:** `fix(battle): multi-touch and drag guards`

---

*Generated from 201 commits. Every entry's "Conventional" message is a suggestion — confirm scope and
type against your team's convention before applying the rewrite.*
