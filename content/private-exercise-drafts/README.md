# Unpublished exercise drafts

These files are **not** in `public` and are never merged into either catalogue,
saved cards, templates, category overrides or the patient mobile experience.
The table-pick record keeps its existing ID, category and exact Dutch text.

Import an eligible local candidate using:

```
npm run drafts:import -- /absolute/path/table-pick-import-candidate.json
npm run test:drafts
```

The importer checks source equality, PNG size/dimensions and SHA256, rejects
publication flags and refuses differing existing drafts. It imports only the
explicitly scoped table-pick candidate. Repeating the same import is a no-op.
This allowlist is a bounded implementation scope, not clinical approval.

Source assets must remain inside the bundle directory after resolving symlinks.
The importer stages already-verified bytes privately, validates the complete
staged draft, then atomically renames it into place under an exclusive ID lock.
Caught write or validation failures remove only that import's temporary files
and lock, allowing retry without exposing an incomplete draft.

`/draft-review.html` consumes the read-only `/api/exercise-drafts` routes. These
require the existing custom `ADMIN_KEY` header; the public default `admin88`
does not grant access. Keys are not stored, and private image replies are
`no-store`. No publish or mutation endpoint is provided. The page explicitly
shows labelled stills, not movement video, using the same full canvas without
independent cropping or zooming.

Remaining: actual mobile viewport/readability QA, application integration
decision, and audio/video production if this is to satisfy the full multimedia
request. There is no audio or video here. No clinical approval is claimed and
no additional mandatory clinical gate is introduced by this draft feature.
