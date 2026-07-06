# Cole County GIS → DPI Map Migration Schema

**Date:** 2026-07-06
**Source data:** Cole County GIS exports (`CC_WardsPrec.zip`, `CC_Addresses.zip`, `CC_Parcels.zip`)
**Source CRS:** NAD83 State Plane Missouri Central FIPS 2402 (US feet) — all artifacts below are already reprojected to WGS84 (EPSG:4326).

---

## 1. Boundary audit findings (2026-07-06)

Compared `public/dpi-data/MO/precinct.geojson` (14 JC ward-precincts) against the county's
`CC_WardsPrec` file (edited 2023-06-21) by geometric intersection-over-union, then counted
authoritative county address points falling on the wrong side of the map's lines.

- **No label swaps.** Every map precinct's best geometric match is the identically-coded
  county precinct. Codes/names are correct.
- **Boundaries are stale.** The map appears to use pre-2023 (Census VTD) lines. Four
  precincts have material drift:

| Precinct | IoU vs county 2023 | Ward-level effect |
|----------|-------------------:|-------------------|
| W5P3     | 0.72 | Clark Ave / Dunklin St area (224 addrs) shown in W5, actually **W1** |
| W2P2     | 0.77 | Hayselton Dr area (143 addrs) shown in W3, actually **W2** |
| W3P1     | 0.77 | St. Marys Blvd / Blair Dr corridor (253 addrs) shown in W4, actually **W3** |
| W4P1     | 0.85 | Bluebird/Meadowlark/Starling area (132 addrs) shown in W4, actually **W5** |

- **835 addresses (3.0% of 28,259 JC addresses) render in the wrong ward**;
  864 (3.1%) in the wrong precinct. Also ~66 addresses inside the 2023 city limits
  (Rock Beacon Rd, Country Club Dr areas — annexations) fall outside the map's city
  polygons entirely.
- Ward-level IoU: W1 0.99, W2 0.93, W3 0.91, W4 0.92, W5 0.93.

**Conclusion:** replace the 14 JC precinct geometries with the county 2023 lines
(Stage A). DPI stats were estimated on the old lines; treat them as unchanged
(differences are within stated CI) but bump a provenance flag.

---

## 2. Prepared artifacts (in `docs/cole-county/`)

| File | Contents |
|------|----------|
| `jc-wardprec-2023.geojson` | 14 JC ward-precinct polygons, WGS84, 6-decimal coords. Props: `key` (`W1P1`…`W5P3`), `ward`, `precinct`, `name` (`JC W1 P1` — matches map naming), `voting_dist` (county VotingDist 1–14), `src`, `src_edited`. |
| `jc-wards-2023.geojson` | 5 ward polygons dissolved from the above. Props: `key` (`JC-1`…`JC-5`), `ward`, `name`. |
| `doors-by-precinct.json` | Address-point ("doors") counts per Cole precinct, keyed by the map's precinct `key`, counted against the 2023 lines for JC and existing map lines for rural precincts. 1,302 county points matched no Cole precinct polygon (edge/rural gaps). |

Raw shapefiles stay out of the repo; keep the zips archived with the external pipeline's
source data.

---

## 3. Migration stages (external dpi-data pipeline)

### Stage A — JC precinct boundary refresh (fixes the audit findings)

For each feature in `MO/precinct.geojson` with `cofips == "051"` and name matching
`JC W{w} P{p}`:

1. Replace `geometry` with the matching feature from `jc-wardprec-2023.geojson`
   (join on `key` = `W{w}P{p}`).
2. Keep all existing properties; add provenance:

```jsonc
{
  "geom_src": "cole-county-gis",   // string, new
  "geom_asof": "2023-06-21"        // ISO date, new
}
```

3. Regenerate `precinct.geojson.gz` (nginx serves via gzip_static).

### Stage B — Jefferson City entries in the `cityward` layer

Append 5 features to `MO/cityward.geojson` using `jc-wards-2023.geojson` geometry.
Properties must match the existing cityward contract (KC/STL entries), i.e. **all** of:

```
key, name, dpi, dpi_forecast, dpi_pres, dpi_mid, elasticity, pres_trend,
mid_trend, lt_pres_trend, vs_state, pvi_vs_state, pvi_vs_nation, n_races,
ci95, confidence, pres_avg, lean, reg_voters, turnout_pres, turnout_mid,
turnout_pres_2020, pres_turnout_chg, turnout_gap, vap_2026, vap_2035,
vap_chg_26_35, nonwhite_2026, nonwhite_2035, nonwhite_chg, reg_current,
party_dem, party_rep, party_lib, party_unaf, party_fill, party_dem2p
```

- `key`: `JC-1` … `JC-5`; `name`: `Jefferson City — Ward {w} ({councilmember})`
  (same em-dash + incumbent convention as `KC-6`).
- **Aggregation from the ward's 3 precincts:** sum the count fields
  (`reg_voters, reg_current, vap_*, party_dem, party_rep, party_lib, party_unaf`);
  weight the rate/index fields by precinct `reg_voters`
  (`dpi*, elasticity, *_trend, vs_state, pvi_*, pres_avg, turnout_*, nonwhite_*,
  party_fill, party_dem2p`); recompute `lean` from blended dpi with the standard
  thresholds; `ci95` = reg-weighted RMS of precinct CIs (conservative); `n_races`
  = min of the precincts.
- `DpiMapPage.tsx` resolves city races via `cityRace(info.key)` — add JC April
  municipal results to `races.json` under keys `JC-1`…`JC-5`, or the tooltip's race
  row will be empty (map still renders without it).

### Stage C — `doors` enrichment (all Cole precincts now; other counties as data is acquired)

Add to each precinct feature's properties where a county address file exists:

```jsonc
{
  "doors": 2744,                  // int — count of situs address points in polygon
  "doors_src": "cole-county-gis", // string
  "doors_asof": "2026-07-06"      // ISO date the count was computed
}
```

Values for Cole are precomputed in `doors-by-precinct.json`. Absent for precincts
without source data — frontend must treat `doors` as optional.

### Stage D — address → district lookup (yard-sign / volunteer tooling, not the map bundle)

Compact per-county artifact, served lazily (never bundled with the map):
`MO/lookup/051.json` + `.gz`, ~28k JC + rural entries.

```jsonc
{
  "$schema": "dpi-addr-lookup/v1",
  "state": "MO", "cofips": "051", "asof": "2026-07-06",
  "streets": {
    "CLARK AVE": {                 // normalized: uppercase, suffix attached, no punctuation
      "65101": [                   // grouped by zip to disambiguate
        [401, 599, 1, "W1P1", "JC-1"]  // [from, to, parity, precinct_key, ward_key|null]
      ]
    }
  }
}
```

- `parity`: 0 = both sides, 1 = odd numbers, 2 = even (ranges built from the point
  file; split a range whenever consecutive points disagree on district).
- `precinct_key` values use the map's precinct `key` namespace so a hit joins
  straight to DPI properties; `ward_key` null outside city limits.
- Consumers: yard-sign RSVP auto-routing, volunteer signup, donor tagging.

### Deferred — parcels

`CC_Parcels` carries only geometry + PID (no owner/land-use/value). No action.
Revisit if the assessor attribute table is obtained; join path is
`Addresses.PID → CC_Parcels.PID`.

---

## 4. Validation checklist (run in pipeline before publishing)

1. Every replaced JC precinct: IoU ≥ 0.99 against `jc-wardprec-2023.geojson`.
2. Re-run the address containment audit: wrong-ward count must drop from 835 to ~0
   (tolerance: <10 points, all on boundary streets).
3. Ward dissolve of the 14 precincts equals the 5 cityward polygons (no slivers > 100 m²).
4. `cityward.geojson` feature count 35 → 40; all 37 properties present and finite on JC rows.
5. Sum of JC ward `reg_voters` equals sum of the 14 precinct values (27,173).
6. Regenerate every touched `.gz`; sizes sane; `src/__tests__/dpi-data.test.ts` passes.
