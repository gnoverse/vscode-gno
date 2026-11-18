# Test explorer

## Implementation (src/gnoTest)
### Mapping tests

`TestItem`s cannot be used as `Map` keys. For object keys, `Map` uses strict
equality, and the extension host may provide different objects for the same
test. Use the ID of a `TestItem` as the key instead.
