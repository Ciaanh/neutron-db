#### 0.1.0 [2026-04-14]

- Add `AsyncDatabase` with in-memory cache, write debounce, and configurable auto-save interval
- Add `writeDebounceMs` and `autoSaveIntervalMs` fields to `Schema`
- `location` in `Schema` is now required (was previously optional)
- Improve error handling in `Database`: catch blocks now use typed `unknown` and chain `cause`
- Migrate ESLint to v10 flat config (`eslint.config.mjs`), remove deprecated `tslint.json`
- Upgrade TypeScript to v6, Jest to v30, ESLint to v10
- Expand test coverage with comprehensive sync and async test suites

#### 0.0.7 [2022-11-22]

- Add compressedJson option to save compressed or pretty-print JSON

#### 0.0.6 [2022-11-14]

- Add minify JSON by default

#### 0.0.5 [2022-11-14]

- Add one-indexed option for the db ids
