# Card resource architecture

## Identity and data publication

The checked-in catalog is the authoring source for principal assignments. PokeCards builds separate species, print and language-resource indexes at installation. Immutable presentation references include exact image, thumbnail, material and proxy mapping. References distinguish print, language and resource revision; existing missing Spanish assets/proxy records remain explicit data gaps and are not replaced automatically.

The build hashes principal catalog content as well as alternatives and proxies. `/catalog-bundle.json` serves the catalog and both metadata tables with their manifest from the same Worker version. The browser validates both tables before replacing any active metadata. Catalog refresh installs these together, clears derived caches and rebuilds album references. Already mounted presentations finish with their original images.

## Transfer and preparation

PokeResources owns compressed transfer deduplication, concurrency, priorities and persistent cache. PokeAssets delegates material transfer to it. All principal images, alternatives, debug previews, lazy grid images, album thumbnails and playmat fronts use this coordinator. Thumbnail intersections defer loading and release offscreen presentation leases. Cards keep their chosen source throughout display and gestures; debug preview no longer upgrades a visible low image to another source.

`bindImage` creates a presentation lease with independent queued/decoding/presentable/error state, readiness promise and decode timing. Shared downloads do not imply shared readiness. Rebinding cancels only the obsolete presentation and ignores late results. A failed decode invalidates the compressed entry and persistent copy after any pending cache write. Sprites never satisfy card readiness.

DOM image leases pin needed files; release drops ownership without cancelling another consumer's transfer. Detached formerly mounted images release automatically; the viewer explicitly releases distant images and close teardown. The carousel retains current -1 through +3, and warm artwork is bounded while preserving battle-owned preparations. Reward cache lookup uses the same print identity as insertion.

## Budgets and measurements

Compressed memory: 20 MiB / 64 entries, soft under active ownership. Persistent same-origin cache: 32 entries. Network: four transfers with speculative work leaving a slot for urgent images. Discovery lookahead: 6–24 images under existing byte and save-data constraints. Prepared carousel: at most five images. GPU and decoded DOM presentation lifetimes remain separate from compressed transfer caching.

`snapshot()` reports transfer timings, queue time, bytes, failures, active leases, decoded image count and estimated RGBA pixel bytes. This pixel estimate is not browser heap or measured GPU residency. Actual Safari frame timing and peak memory require a real-device run. Publication and tests cannot establish those numbers.

## Verification

Identity, shared transfers, independent preparation, rebind cancellation, decode failure eviction, atomic bundle rejection, Worker bundle response, carousel bounds, battle readiness, material routes and final battle progress are covered by automated suites. User votes, history and recommendation semantics retain their existing schema. Normalized registries are derived from the authoring catalog rather than duplicating editable assignments in a second file.

## Discovery presentation buffer (swipe continuity)

`discovery-buffer.js` retains one presentation per upcoming print. `makeCard` takes that presentation instead of allocating another warmed image. Buffer-to-back-to-front-to-flight transfers preserve the same DOM image and resource lease. A pending front stays opaque and noninteractive; terminal errors expose retry without recording a vote. Readiness remains distinct from mounting.

Outgoing cards own their resources until their own animation cleanup; render no longer truncates to two outgoing nodes. Undo uses the same cleanup, and final discovery waits for the last flight before opening completion. The animation curve and normal duration remain unchanged.

The buffer reserves a minimum prefix and limits speculative decoded images to five with a 16 MiB estimated pixel budget for additional entries. The minimum three positions can exceed that soft budget. This preserves the recommender's existing three-position lock. Background battle/alternative preparation yields when discovery has fewer than two ready positions; explicit battle entry remains urgent. Network size statistics now distinguish frontals, thumbnails and materials.

Persistence and Journey state updates retain their current semantics; broad deferral of batch/reward updates was deliberately not introduced without event-snapshot tests. Repeated like-icon markup is avoided. Further UI coalescing, strict total decoded memory accounting, global observer replacement and device performance tuning remain follow-up work, not measured improvements of this change.

## Burst and material quiet interval

Discovery preparation grows from five toward ten entries during sub-300 ms advances, within a 24 MiB estimated decoded pixel budget (the minimum stable prefix remains a soft exception). Slow advances shrink the window gradually. This reduces buffer starvation during bursts; it cannot guarantee uninterrupted consumption on an arbitrarily slow connection.

Pointer gestures now hold the material gate, as do outgoing flights. Releasing a gate waits 180 ms before allowing deferred material decoding/texture work; another gesture keeps it blocked. The image remains interactive as soon as its front is ready, independent of foil readiness. Decode checks the gate before acquiring and decoding material bytes, and uploads check it again. Reused WebGL canvas contents are cleared transparently before mounting to avoid showing a previous scene's pixels.
