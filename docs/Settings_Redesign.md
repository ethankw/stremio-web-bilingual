# Common and advanced settings

The default Settings screen shows everyday language, display, subtitle and playback preferences, installed addons and playback-service status. Advanced contains subtitle styling, playback compatibility, device controls, service addresses, storage and network settings. Account/security, help, shortcuts and attribution remain directly accessible.

Search covers all destinations. Opening settings, searching and changing destinations only changes presentation; existing hooks and storage remain responsible for values. Platform capabilities still control which settings are available. No user defaults or storage formats are migrated.

## Addon compatibility

Configuration buttons for installed addons route to the same settings entry without placing their potentially private URLs in the address bar. Uninstalled addons retain their existing configuration/install flow.

Installed instances remain separate and no install/uninstall is dispatched by this screen. Known, version-bound Torrentio (0.0.15) and TMDB addon (3.1.7) URL formats can expose a draft editor with common and advanced options. Unknown fields and credentials remain unchanged and are not rendered. Unsupported hosts, versions, aliases, data types and opaque configurations fall back to provider settings when the addon declares them.

A generated draft is **not a saved addon update**. The existing core replaces descriptors by transport URL; changed configuration URLs identify another instance. This screen therefore opens the provider's configuration flow explicitly and never uninstalls/reorders an existing addon to simulate atomic replacement. Generic manifest.config fields alone do not enable an editor until that provider's encode/decode and return flow have been verified.

No arbitrary configuration-page proxy, iframe rewriting, OS protocol registration or credentials backend is added. Trakt account authorization and any addon's separate OAuth authorization retain their original ownership.

## Validation

- Tests cover setting destinations, cross-destination search, translations, adapter host/version/type checks, invalid inputs and preservation of unknown/private values.
- Browser validation uses a synthetic fixture for configurable addons and an isolated anonymous origin with the real WASM core for settings persistence. It does not modify the user's account, existing addon configurations or existing playback-service configuration.
- Final online checks use only https://stremio2.ethankw.workers.dev/ . Provider-side authenticated configuration saving is a separate acceptance item and is not claimed by draft generation.
