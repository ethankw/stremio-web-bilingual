# Stream source labels

Release names are informal, addon-supplied claims, not an international standard or verification of video bytes. This feature only annotates movie/series stream rows. It neither selects, reorders nor opens streams and never marks playback/watched state.

## Research and rules

Common layout: title, year, resolution, source, codec, audio/languages, release group. Order, punctuation and capitalization vary. Classification uses explicit source tokens with alphanumeric boundaries; resolution, codec, HDR, file size, peer counts, group and tracker names alone are not source proof.

| Source tags | UI result | Interpretation |
| --- | --- | --- |
| CAM, CAMRip, HDCAM, HD-CAM, HQCAM, NEWCAM | 偷拍版 / CAM | camera source; HD in its name does not make it a clean digital source |
| TS, TSRip, HDTS, HD-TS, HDTSRip, Telesync, Telesynch, PDVD | 偷拍版 / CAM | camera picture, possibly better separately sourced audio |
| WEB-DL, WEBDL, WEBRip, WEBMux, BluRay, BDRip, BRRip, HDTV | 高清版 / HD | a named digital source; not a guarantee of resolution, bitrate or perceptual quality |
| bare WEB immediately beside a resolution or video codec | 高清版 / HD | contextual release source, not the word Web in a title |
| TC/HDTC/Telecine, DVD/DVDRip/DVDSCR/SCR, Workprint, R5, SDTV/PDTV/TVRip/DSR | 未知 / Unknown | film transfer, disc/screener or other sources cannot truthfully be forced into camera versus HD digital |
| 240p–576p, even with a digital source | 未知 / Unknown | avoid labeling known SD as HD |
| only 720p/1080p/2160p/4K, x264/x265/HEVC, HDR, REMUX, no named source | 未知 / Unknown | missing source evidence |

CAM evidence wins over digital evidence, including contradictory claims across fields; uncertain/SD evidence prevents an HD label. TC is not called a camera recording: Telecine is a different process. Transport stream extension `.ts` is not the Telesync tag. Title text before a release year is excluded to avoid `Cam.2018` and `The.Web.2026` false positives. Boundaries avoid matching `Scam` or `m2ts`.

The matcher reads core-serialized behaviorHints.filename, externalPlayer.fileName, the first description line (release name), and addon name lines. It ignores later description lines with peers/trackers/languages. Sources on other lines, obfuscated or dishonest names may remain unknown or be misidentified; no content-level authenticity claim is made. Tooltip text explains each inferred label and matched tag. No filename, URL, hash or account data is sent to a new service.

externalUrl links (including discussion/analysis) and YouTube are not classified as movie files; their left column stays blank for alignment. Trailer compact actions and EPG rows keep existing behavior. Chips are noninteractive text inside the existing stream link, avoiding nested controls. Existing playback links, menus and analytics are retained.

## Primary sources checked 2026-10-15

- Radarr source parser, pinned research commit df2faa64c75e6081556d11232dc46523e7264ea1: https://github.com/Radarr/Radarr/blob/df2faa64c75e6081556d11232dc46523e7264ea1/src/NzbDrone.Core/Parser/QualityParser.cs . Used to verify source vocabulary and the separation of CAM/TS, TC, DVD, WEB and BluRay. This project implements a smaller conservative matcher, not Radarr ranking/download selection.
- Stremio addon stream response specification: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/stream.md . Defines name/description, behaviorHints.filename and externalUrl.
- Pinned actual core stream serialization: https://github.com/Stremio/stremio-core/blob/c4806e8614452fd49d5dbb22db74afa88959b554/stremio-core-web/src/model/serialize_meta_details.rs and https://github.com/Stremio/stremio-core/blob/c4806e8614452fd49d5dbb22db74afa88959b554/src/types/resource/stream.rs . Stream fields are flattened, preserving behaviorHints and source variants.

## Validation

Table-driven source tests cover variants, contradictory HD/CAM claims, uncertain sources, SD, misleading titles/extensions, multiline addon labels, metadata exclusion, external links and input immutability. Browser acceptance and release/rollback receipts are kept in the local task outputs, without publishing account library data.
