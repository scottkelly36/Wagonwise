// Renders the demo video: one clip per scene into clips/, then joins them into wagonwise-demo.mp4.
//   node render.mjs        every scene, then the full video
//   node render.mjs 4 5    only scenes 4 and 5 (see SCENES), then the full video from the clips
// Needs ffmpeg and Playwright with Chromium. Timings and wording live in index.html.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Loaded with require so a globally installed Playwright (NODE_PATH) is found as well as a local one.
const { chromium } = createRequire(import.meta.url)('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
// [file name, start second, end second]: keep in step with the captions (C) in index.html.
const SCENES = [
  ['00-intro', 0, 4],
  ['01-office-plans-the-job', 4, 12],
  ['02-lands-on-the-phone', 12, 20],
  ['03-route-that-fits', 20, 30],
  ['04-office-sees-the-trip', 30, 40],
  ['05-drivers-report-hazards', 40, 50],
  ['06-daily-checks', 50, 60],
  ['07-what-the-work-made', 60, 70],
  ['08-outro', 70, 76],
];

function ffmpeg(args, stdin = 'ignore') {
  const child = spawn('ffmpeg', ['-v', 'error', '-y', ...args], {
    stdio: [stdin, 'inherit', 'inherit'],
  });
  const done = new Promise((resolve, reject) =>
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    ),
  );
  return { child, done };
}

const wanted = process.argv.slice(2).map(Number);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + join(here, 'index.html'));
await page.waitForLoadState('networkidle');

for (const [index, [name, start, end]] of SCENES.entries()) {
  if (wanted.length > 0 && !wanted.includes(index)) continue;
  console.log(`scene ${index}: ${name}`);
  // A silent audio track is included so the clips drop into any editor and join cleanly.
  const { child, done } = ffmpeg(
    [
      ...['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'],
      ...['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest'],
      ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p'],
      ...[
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-movflags',
        '+faststart',
        join(here, 'clips', `${name}.mp4`),
      ],
    ],
    'pipe',
  );
  for (let frame = 0; frame < (end - start) * FPS; frame++) {
    await page.evaluate((t) => window.render(t), start + frame / FPS);
    const image = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!child.stdin.write(image))
      await new Promise((resolve) => child.stdin.once('drain', resolve));
  }
  child.stdin.end();
  await done;
}
await browser.close();

const list = join(here, 'clips', 'list.txt');
writeFileSync(list, SCENES.map(([name]) => `file '${name}.mp4'\n`).join(''));
// The clips are joined as they are. If there is a music.mp3 beside this script it is laid under the whole video (quieter,
// faded in and out, cut to the video's length); the clips themselves stay silent so they can be reordered in an editor.
const music = join(here, 'music.mp3');
const total = SCENES.at(-1)[2];
const joined = ['-f', 'concat', '-safe', '0', '-i', list];
const out = ['-movflags', '+faststart', join(here, 'wagonwise-demo.mp4')];
if (existsSync(music)) {
  const fade = `volume=0.5,afade=t=in:d=0.8,afade=t=out:st=${total - 3}:d=3`;
  await ffmpeg([
    ...joined,
    ...['-i', music, '-map', '0:v', '-map', '1:a', '-af', fade, '-t', String(total)],
    ...['-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', ...out],
  ]).done;
} else {
  await ffmpeg([...joined, '-c', 'copy', ...out]).done;
}
rmSync(list);
console.log('wagonwise-demo.mp4 written');

// The copy the For hauliers page plays: smaller (1280 x 720) so it starts quickly, and a still to show before it plays.
const web = join(here, '..', 'landing', 'video');
mkdirSync(web, { recursive: true });
await ffmpeg([
  ...[
    '-i',
    join(here, 'wagonwise-demo.mp4'),
    '-vf',
    'scale=1280:720',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
  ],
  ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-pix_fmt', 'yuv420p'],
  ...['-movflags', '+faststart', join(web, 'wagonwise-demo.mp4')],
]).done;
await ffmpeg([
  ...['-ss', '35', '-i', join(here, 'wagonwise-demo.mp4'), '-frames:v', '1'],
  ...['-vf', 'scale=1280:720', '-q:v', '4', join(web, 'wagonwise-demo-poster.jpg')],
]).done;
console.log('landing/video copy and poster written');
