# Resource architecture

The catalog remains the compatible authoring format. PokeCards resolves it into immutable presentation references; no secondary copy of the full catalog is created. A reference identifies print, declared language, revision, exact front, thumbnail and compatible material. URLs are explicit, never inferred from a set code. Existing incomplete language coverage remains visible in source data rather than silently selecting a different print.

PokeResources owns compressed transfer deduplication and scheduling. PokeAssets delegates to it in production. Decoded DOM images and GPU textures retain separate lifetimes. Discovery and battle images are higher priority than speculative materials. Playmat now shares front transfers and never uses a different-print fallback.

Carousel shells preserve layout for all positions, while only current -1 through +3 instantiate images. Moving releases distant image references. Closing releases all carousel references after capturing the reverse-animation clone. Album tiles use print identity and detached tiles are purged when rebuilding. Catalog refresh clears derived visual caches and rebinds the album catalog; already presented cards keep their original source until presentation ends.

Decode failure invalidates compressed memory and persistent local cache so a failed resource can retry. Sprites remain an explicit emergency presentation and cannot satisfy battle preparation. The existing gesture engine retains source identity throughout flight.

Verification: card-identity.test.mjs and resource-coordinator.test.mjs exercise bounded carousel hydration, exact print identity, immutable references, language/revision separation, shared requests, failed cache eviction, consumer release and concurrency. Existing battle/readiness suites guard presentation behavior.

Remaining boundaries: native lazy thumbnails and debug peek still use browser image loading; alternative preparation still bridges native Image into readiness. The normalized reference is a compatibility layer over authoring data, not yet a physical migration of all historical JSON into relational print/locale tables. Cache budgets remain soft when owners pin resources; decoded/GPU residency and Safari frame timing require real-device measurement. Do not infer RAM savings from serialized JSON size. Atomic versioned catalog/proxy deployment remains handled by the existing build manifest; historical proxy entries remain supported.
