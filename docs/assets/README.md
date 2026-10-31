# Screenshots

These images are committed because they are generated from the repository's own
fixture, contain no operator session data, and stay stable between runs.

| File | Surface | Profile | Viewport / DPR | Source |
| --- | --- | --- | --- | --- |
| `web-fixture-390x844.png` | `web` | `phone-390x844` | 390×844 @3× | `test/fixtures/desktop.html` |
| `web-fixture-768x1024.png` | `web` | `tablet-768x1024` | 768×1024 @2× | `test/fixtures/desktop.html` |

The fixture reproduces a desktop three-column shell with `min-width: 960px`, so
both captures overflow horizontally and the images show the clipped main
column. The viewport and overflow numbers are recorded in the `shot --json`
output, not inferred from the image.

Regenerate them from a checkout:

```bash
dsh-ui-lab shot --surface web --profile phone-390x844 \
  --url "file://$PWD/test/fixtures/desktop.html" --out .shots/docs

dsh-ui-lab shot --surface web --profile tablet-768x1024 \
  --url "file://$PWD/test/fixtures/desktop.html" --out .shots/docs

# the CLI writes <surface>__<profile>.png; copy to the committed names
cp .shots/docs/web__phone-390x844.png docs/assets/web-fixture-390x844.png
cp .shots/docs/web__tablet-768x1024.png docs/assets/web-fixture-768x1024.png
```

`dsh-mobile` captures are intentionally **not** committed: a real capture
contains the operator's session titles, workspace names and account image.
Generate them locally; `.shots/` is git-ignored. See
[`docs/surfaces.md`](../surfaces.md) for the pairing flow.
