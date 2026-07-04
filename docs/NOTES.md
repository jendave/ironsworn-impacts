```
fvtt package --id ironsworn-impacts --type Module unpack ironsworn-impacts-entries -c --json --in "src/packs" --out "json-packs/ironsworn-impacts-entries"
fvtt package --id ironsworn-impacts --type Module unpack ironsworn-impacts-macros -c --json --in "src/packs" --out "json-packs/ironsworn-impacts-macros"

note: --type Module (foundry-ironsworn used System); --in points at src/packs where your .ldb lives
```