# SLR backtest

Offline check of `snowFromLiquid` in `utils/snowRatio.js`. It does not call Visual Crossing or the National Weather Service, and it does not change the published blend. The numbers it prints are a diagnostic. They are not an accuracy claim and they are not for publication.

The curve is the Kuchera piecewise line (12:1 at 271.16 K, slope 2 on the warm side and slope 1 on the cold side), with snow set to 0 above 32°F. Coefficients and the Alta context are cited in `utils/snowRatio.js`. The fixed comparison is 10:1.

## (a) Ratio only

For each station in `stations.json`, over the last three winters (1 Nov–30 Apr, plus November 2026 through the 27th):

- liquid = increase in SNOTEL snow-water equivalent, clipped at 0
- predicted snow = that liquid times the ratio at the observed temperature
- observed snow = increase in snow depth, clipped at 0

Temperature is the mean of daily maximum and minimum when both exist, otherwise the observed temperature. Data comes from the public NRCS AWDB REST API (`https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data`). No key.

Depth change undercounts new snow. The pack settles and compacts during a storm, and a negative change is clipped to 0, so the "observed" number is a lower bound. A positive bias against depth is expected even for a fair ratio.

Stations are the ones paired with resorts in the internal station map. A station shared by two resorts is scored once. Sites with no snow-depth sensor, or no SWE, drop out of this comparison and are named in the output. Weak matches (far from the resort, or a low-elevation SCAN site) are reported separately.

## (b) Capture overlap

Pass the extracted internal capture directory (the one that contains `data/accuracy.sqlite`). The script joins PowAlert forecast rows to SNOTEL actuals on resort and date. Where the capture also has SWE for that day and the day before, it scores 10:1 and the Kuchera curve against the same depth change. That overlap is a short, mostly dry sample. It is not a reason to turn `BLEND_INCLUDE_POWALERT_SLR` on.

Do not commit the capture, its sqlite file, or any raw third-party forecast pages.

## Run

```bash
node scripts/backtest-slr/backtest.js --capture /path/to/powalert-accuracy
```

Omit `--capture` to run only the ratio test. The command reads the network for AWDB and nothing else.
