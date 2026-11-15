# Demo video

A 76-second video (1920 x 1080, no sound) of the portal and the driver app working together: one job from the office to
the cab and back. It is built from the store screenshots (`apps/dashboard/store-assets/raw/` and
`apps/driver-app/store-assets/raw/`), so every screen is real and all the data is made up.

- `wagonwise-demo.mp4`: the whole video.
- `clips/`: the same video as one file per scene, in order. Drop them into any video editor to reorder, cut or replace one.
- `index.html`: the animation itself (layout, wording, timings). Open it in a browser and run `render(35)` in the console
  to see second 35.
- `render.mjs`: turns `index.html` into the clips and joins them.

| Clip                        | Seconds  | Shows                                                   |
| --------------------------- | -------- | ------------------------------------------------------- |
| `00-intro`                  | 0 to 4   | Logo and title                                          |
| `01-office-plans-the-job`   | 4 to 12  | Portal: the Jobs page, JOB-1042 assigned                |
| `02-lands-on-the-phone`     | 12 to 20 | App: the job screen, Accept job                         |
| `03-route-that-fits`        | 20 to 30 | App: route choice, hazards on the route, Start trip     |
| `04-office-sees-the-trip`   | 30 to 40 | App on a trip beside the portal's Live trips            |
| `05-drivers-report-hazards` | 40 to 50 | App: report a hazard, the faster-route offer            |
| `06-daily-checks`           | 50 to 60 | App: daily check due; portal: check results and defects |
| `07-what-the-work-made`     | 60 to 70 | Portal: overview, job profit, reports                   |
| `08-outro`                  | 70 to 76 | Logo, store badges, web address                         |

## Changing it

- **Wording:** the captions are the `C` list in `index.html` (start, end, label, heading, sentence).
- **A screen:** retake the screenshot (see `apps/driver-app/store-assets/README.md`) and save it over the old file, or
  change which file shows when in the `B` (portal) and `P` (phone) lists in `index.html`.
- **Highlights and taps:** the `hl(...)`, `tap(...)` and `pulse(...)` lines under "story beats", in screenshot pixels.
- **Scene lengths:** change the times in `index.html` and the matching row of `SCENES` in `render.mjs`.

Then render. It needs `ffmpeg` and Playwright with Chromium (`npm i -g playwright && npx playwright install chromium`):

```bash
node sites/demo-video/render.mjs
```

```bash
node sites/demo-video/render.mjs 4 5
```

The first renders everything (about two minutes); the second re-renders only scenes 4 and 5 and rejoins the full video.

The video is the store screenshots animated, not a screen recording: the driver app needs an Android emulator, which the
machine that made this did not have. Keep the wording to what the product does (no "compliant").
