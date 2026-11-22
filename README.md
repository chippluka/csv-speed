# csv-reader-speed — fast drop-in for csv-reader 1.0.0

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/chippluka/csv-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/chippluka/csv-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0, written from its published brief: one left-to-right pass that answers `{columns, rows, errors}` exactly as csv-reader does on every case — BOM, LF/CRLF/lone CR, quoted fields with `""` escapes and embedded line breaks, junk after a closing quote, unterminated quotes, short/long rows — while jumping between delimiters with indexOf instead of walking one character at a time. A record with no quotes and no stray CR is split at once.

## Run it

```sh
node main.ts
```

`main.ts` (the house driver, kept as-is) reads every case from `$MAKEFUN_INPUT_DIR/cases.json` and writes `$MAKEFUN_OUTPUT_DIR/answers.json`.

---

Entered on [make.fun](https://make.fun/?ref=REFERRAL_CODE&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards
