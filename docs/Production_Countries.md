# Production countries

Details and the right-hand preview show every verified production country directly below Genres. The source is TMDB's `production_countries`, not the original language, cast nationality, filming locations, or streaming availability. Country labels follow the interface language; Chinese uses 国别.

Discover now has one saved switch, **隐藏中日韩印及东南亚** (Hide China, Japan, Korea, India & Southeast Asia), next to Hide watched. It defaults off. Turning it on excludes mainland China (CN), Hong Kong (HK), Macao (MO), Taiwan (TW), Japan (JP), South Korea (KR), North Korea (KP), India (IN), and all 11 Southeast Asian countries: Brunei (BN), Cambodia (KH), Indonesia (ID), Laos (LA), Malaysia (MY), Myanmar (MM), Philippines (PH), Singapore (SG), Thailand (TH), Timor-Leste (TL) and Vietnam (VN). A co-production is hidden if any production country is in this set. All remaining countries use the same behavior; no country chip selector remains. The old per-country exclusions no longer affect the list. The new switch uses its own stable boolean preference, independently of Hide watched.

Country exclusions combine with the existing genre and hide-watched controls and apply to the already collected aggregate catalog. With the switch off, missing-country movies stay visible and no bulk country lookup is scheduled. With it on, unresolved or missing country data cannot establish eligibility, so those movies remain hidden rather than being guessed.

Existing bilingual responses seed the shared country cache. Disabling bilingual presentation does not disable country details/filtering. Country-only requests skip translations and artwork, run two at a time in Discover and share bounded caches. Inactive routes stop scheduling further requests. No account, add-on, library or watched records are changed.

## Validation and release

Unit tests cover the exact 19-country/region switch scope, country localization, any-country co-production exclusion, unknown-data handling, identity matching, shared cache/expiry, malformed responses, Access expiry, and endpoint method/credential/feature boundaries. Real browser validation must also check details, the preview drawer, switch persistence, and existing genre/watch controls at the fixed address.

The pre-feature production version is `7cf07a92-f044-4e7c-8797-e632f8afa103` (Git `edadd6bc48c2e4d3ec59b383962ab55dae418f93`). Roll back with `pnpm exec wrangler rollback 7cf07a92-f044-4e7c-8797-e632f8afa103 --config wrangler.personal.jsonc --message "Restore release before production country chips" --yes` from the release checkout. This restores code/assets without clearing the user's account, add-ons, local preferences or viewing data.

References: https://developer.themoviedb.org/reference/movie-details and https://developer.themoviedb.org/reference/configuration-countries.

## Simplification rollback

The country-chip release before this simplification is `f6ddb997-8668-4a8b-b046-b3ef2b32ae5c` (Git `c3b7a99cba984c60aa6594eeda7e83748295fead`). To restore it, run `pnpm exec wrangler rollback f6ddb997-8668-4a8b-b046-b3ef2b32ae5c --config wrangler.personal.jsonc --message "Restore country-chip release" --yes` from the release checkout. The new switch preference is harmless when rolling back and does not change the old per-country preference.

2026-10-19 更新：地区隐藏不再将国别未知、请求失败或尚未解析视为命中排除地区；这些影片保留，仅明确包含屏蔽地区的合拍片被隐藏。详情国别展示及排除地区集合不变。
