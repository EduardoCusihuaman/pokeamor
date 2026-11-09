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
