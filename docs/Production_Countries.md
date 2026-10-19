# Production countries

Details and the right-hand preview show every verified production country directly below Genres. The source is TMDB's `production_countries`, not the original language, cast nationality, filming locations, or streaming availability. Country labels follow the interface language; Chinese uses 国别.

Discover lists the full TMDB country/region configuration snapshot (251 codes, retrieved 2026-10-19), partitioned into Europe and the Americas, China/Japan/Korea (including separately recorded regions), and other countries/regions with India first. Each section scrolls independently so the complete set remains available without pushing the movie grid off screen. Country chips are accessible checkboxes. All start checked; deselections persist in this site's local storage independently of account, add-on and watched data.

A co-production is excluded if **any** production country is deselected. Country exclusions combine with the existing genre and hide-watched controls. All-selected preserves movies with missing country data. When an exclusion is active, unresolved or missing country data cannot prove eligibility, so those movies remain hidden; no country is guessed. Filtering covers the already collected aggregate catalog, not all movies in TMDB or every possible page of every installed catalog.

The default all-selected catalog performs no bulk country lookup. Existing bilingual metadata responses include countries and seed a shared browser cache. Disabling bilingual presentation does not disable countries: the independent, read-only `/api/bilingual/v1/countries` endpoint supports details and filtering. Country-only requests skip translations and artwork, run two at a time in Discover, share in-flight requests and use bounded caches. Inactive routes stop scheduling additional requests. Loading results never mutate add-ons, libraries or watching history.

## Validation and release

Unit tests cover the full country partition, country localization, any-country co-production exclusion, unknown-data handling, identity matching, shared cache/expiry, malformed responses, Access expiry, and endpoint method/credential/feature boundaries. Real browser validation must also check details, the preview drawer, selection persistence, and existing genre/watch controls at the fixed address.

The pre-feature production version is `7cf07a92-f044-4e7c-8797-e632f8afa103` (Git `edadd6bc48c2e4d3ec59b383962ab55dae418f93`). Roll back with `pnpm exec wrangler rollback 7cf07a92-f044-4e7c-8797-e632f8afa103 --config wrangler.personal.jsonc --message "Restore release before production country chips" --yes` from the release checkout. This restores code/assets without clearing the user's account, add-ons, local preferences or viewing data.

References: https://developer.themoviedb.org/reference/movie-details and https://developer.themoviedb.org/reference/configuration-countries.
