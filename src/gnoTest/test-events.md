# Gno test events

The test controller runs `gno test -v` and parses its plain text output line by
line (see `gnoTestOutput.ts`). Each line becomes a test event with an action,
such as `run`, `pass`, `fail`, `skip` or `output`, which is converted to a VS
Code test API event.

## Tests

- `=== RUN TestXxx` marks a test as running.
- `--- PASS: TestXxx (0.01s)`, `--- FAIL: ...` and `--- SKIP: ...` mark it as
  passed, failed or skipped, with its elapsed time.
- Any other line is recorded as output of the test that is currently running.

## Filetests

gno reports a filetest as `./z_filetest.gno`. The `./` prefix is removed so the
name matches the test item. gno prints the details of a failed filetest after
its `FAIL` line, so the fail event is held back until the next `=== RUN`, `---` or
summary line is reached. The lines in between are recorded as its output.

## Summary lines

Package summaries (`ok`, `FAIL`, `?`), failure lists (`failed: "TestA"`,
`./z_filetest.gno failed`) and gas reports (`--- GAS: `) end the output of the
current test and are not recorded as test output.
