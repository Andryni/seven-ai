#!/usr/bin/env node
'use strict';

/**
 * On-device acceptance run, in one command:
 *
 *   1. build   — EAS preview APK (or reuse one you already downloaded)
 *   2. install — adb install onto the connected device
 *   3. flows   — the Maestro end-to-end flows in .maestro/
 *   4. font    — OS font-scale A/B: does our 1.6 cap actually hold on device?
 *
 * The last stage is the one that cannot be answered from a unit test: the cap
 * is applied by a Metro resolution shim (src/theme/fontScaling.ts), and the only
 * proof that a real device honours it is to change the system font scale and
 * measure what the OS laid out. See scripts/lib/font-scale-probe.cjs for how the
 * measurement is turned into a verdict.
 *
 *   node scripts/device-acceptance.cjs --build
 *   node scripts/device-acceptance.cjs --apk ~/Downloads/build-123.apk
 *   node scripts/device-acceptance.cjs --apk app.apk --skip-maestro --measure IDLE
 *
 * Exits non-zero if any executed stage failed; skipped stages do not count as
 * failures, but they are reported loudly so a green run cannot hide them.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const probe = require('./lib/font-scale-probe.cjs');

const ROOT = path.resolve(__dirname, '..');
const APP_ID = 'com.seven.ai';
const DASHBOARD_MARKERS = /Active brain|Cerveau actif|SYSTEMS NOMINAL|SYSTÈMES NOMINAUX/;
const LOCK_SCREEN_MARKERS = /SEVEN LOCKED|SEVEN VERROUILLÉ/;

// ---------------------------------------------------------------- utilities

function parseArgs(argv) {
  const options = {
    apk: null,
    build: false,
    serial: null,
    flows: null,
    out: path.join(ROOT, '.acceptance'),
    skipFont: false,
    skipMaestro: false,
    includeOptIn: false,
    dryRun: false,
    lowScale: 0.9,
    highScale: 1.6,
    cap: 1.6,
    measure: null,
    timeoutMs: 25 * 60_000,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} expects a value`);
      return value;
    };
    if (arg === '--apk') options.apk = path.resolve(next());
    else if (arg === '--build') options.build = true;
    else if (arg === '--serial') options.serial = next();
    else if (arg === '--flows') options.flows = next().split(',').map((f) => f.trim());
    else if (arg === '--out') options.out = path.resolve(next());
    else if (arg === '--skip-font') options.skipFont = true;
    else if (arg === '--skip-maestro') options.skipMaestro = true;
    else if (arg === '--include-opt-in') options.includeOptIn = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--low-scale') options.lowScale = Number(next());
    else if (arg === '--high-scale') options.highScale = Number(next());
    else if (arg === '--cap') options.cap = Number(next());
    else if (arg === '--measure') options.measure = new RegExp(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

const HELP = `
Usage: node scripts/device-acceptance.cjs [options]

  --build            launch an EAS preview build and wait for its APK
  --apk <path>       install this APK instead of building (skips EAS entirely)
  --serial <id>      target one device when several are connected
  --flows a,b        run only these Maestro flows (default: every flow in .maestro)
  --include-opt-in   also run flows that need a human (app-lock-cycle.yaml)
  --skip-maestro     skip the flows stage
  --skip-font        skip the font-scale measurement
  --low-scale <n>    lower font scale to compare (default 0.9)
  --high-scale <n>   upper font scale to compare (default 1.6)
  --cap <n>          the cap the app is supposed to apply (default 1.6)
  --measure <regex>  restrict the measurement to matching labels
  --out <dir>        artifact directory (default .acceptance)
  --dry-run          print the plan without touching the device or EAS
`;

/** Windows shims (.cmd/.bat) are not executable by Node directly. */
function resolveBin(name) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(finder, [name], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return candidates.find((line) => /\.(cmd|exe|bat)$/i.test(line)) || candidates[0];
}

function run(command, args, { allowFailure = false, timeoutMs = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (!allowFailure && (result.status !== 0 || result.error)) {
    throw new Error(
      `${path.basename(command)} ${args.join(' ')} failed (status ${result.status}): ${output.slice(0, 400)}`
    );
  }
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', output };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeArtifact(dir, name, contents) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

// ------------------------------------------------------------------- stages

function resolveTarget(options, adb) {
  const result = run(adb, ['devices']);
  const devices = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);

  if (!devices.length) {
    throw new Error('no device in "device" state — plug the phone in and accept the USB debugging prompt');
  }
  if (options.serial) {
    if (!devices.includes(options.serial)) {
      throw new Error(`device ${options.serial} is not connected (connected: ${devices.join(', ')})`);
    }
    return options.serial;
  }
  if (devices.length > 1) {
    throw new Error(`several devices connected (${devices.join(', ')}) — pick one with --serial`);
  }
  return devices[0];
}

function buildApk(options, eas) {
  if (options.apk) {
    if (!fs.existsSync(options.apk)) throw new Error(`APK not found: ${options.apk}`);
    return options.apk;
  }
  if (!options.build) {
    throw new Error('no APK given — pass --apk <path> or --build to launch an EAS build');
  }
  if (!eas) throw new Error('eas CLI not found on PATH (npm install -g eas-cli)');

  console.log('  launching EAS preview build (this is the slow part)…');
  const result = run(
    eas,
    ['build', '--profile', 'preview', '--platform', 'android', '--non-interactive', '--wait', '--json'],
    { timeoutMs: options.timeoutMs }
  );
  writeArtifact(options.out, 'eas-build.json', result.stdout);

  const json = result.stdout.slice(result.stdout.indexOf('['));
  const [build] = JSON.parse(json);
  const url = build.artifacts?.applicationArchiveUrl || build.artifacts?.buildUrl;
  if (!url) throw new Error(`EAS build finished without an artifact URL (status ${build.status})`);

  const target = path.join(options.out, `seven-${build.appVersion}-${build.appBuildVersion}.apk`);
  console.log(`  downloading ${url}`);
  run('curl', ['-sL', '--retry', '2', '-o', target, url], { timeoutMs: options.timeoutMs });
  return target;
}

function installApk(adb, serial, apk) {
  const result = run(adb, ['-s', serial, 'install', '-r', '-d', apk], { timeoutMs: 10 * 60_000 });
  if (!/Success/i.test(result.output)) throw new Error(`adb install said: ${result.output.trim()}`);
  return result.output.trim().split('\n').pop();
}

function maestroFlows(options) {
  const dir = path.join(ROOT, '.maestro');
  const all = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort();
  const selected = options.flows ? options.flows : all;
  return selected
    .map((file) => (file.endsWith('.yaml') ? file : `${file}.yaml`))
    .filter((file) => options.includeOptIn || !/-cycle\.yaml$/.test(file))
    .map((file) => path.join(dir, file))
    .filter((file) => fs.existsSync(file));
}

function runFlows(options, maestro, serial) {
  const flows = maestroFlows(options);
  if (!flows.length) throw new Error('no Maestro flow selected');

  const results = [];
  for (const flow of flows) {
    console.log(`  ${path.basename(flow)}…`);
    const result = run(maestro, ['test', '--device', serial, flow], {
      allowFailure: true,
      timeoutMs: 10 * 60_000,
    });
    writeArtifact(options.out, `maestro-${path.basename(flow)}.log`, result.output);
    results.push({ flow: path.basename(flow), passed: result.status === 0 });
  }

  const failed = results.filter((r) => !r.passed).map((r) => r.flow);
  if (failed.length) throw new Error(`flow(s) failed: ${failed.join(', ')} (logs in ${options.out})`);
  return `${results.length} flow(s) passed`;
}

function adbShell(adb, serial, args, options) {
  return run(adb, ['-s', serial, 'shell', ...args], options);
}

function readFontScale(adb, serial) {
  const result = adbShell(adb, serial, ['settings', 'get', 'system', 'font_scale'], { allowFailure: true });
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Writing `font_scale` needs WRITE_SETTINGS, which vendor ROMs do not always
 * grant the adb shell user — on a Realme/ColorOS device this answers
 * "com.android.shell was not granted this permission: WRITE_SETTINGS". Worse,
 * the failure is silent: the `put` exits 0, the setting never moves, and both
 * dumps would then be taken at the *same* scale and honestly report a ratio of
 * 1.0 — a number that looks like evidence. So probe with the value that is
 * already there (the device is left untouched) before measuring anything.
 */
function assertFontScaleWritable(adb, serial, current) {
  // Writes the value that is already there, so the device is left untouched —
  // but the *exit status* is what counts. Comparing the value back cannot tell
  // "the write was refused" from "the write did nothing", which is exactly how
  // this guard first fooled itself on a realme device: the refused `put` leaves
  // font_scale at 0.9, the probe writes 0.9, and every check passes.
  const probe = adbShell(adb, serial, ['settings', 'put', 'system', 'font_scale', String(current)], {
    allowFailure: true,
  });
  if (probe.status !== 0 || /SecurityException|Permission denial|not granted/i.test(probe.output)) {
    const reason = probe.output.trim().split('\n')[0].replace(/\r/g, '');
    throw new Error(
      `this device refuses font_scale changes from adb (com.android.shell lacks WRITE_SETTINGS): ${reason}. ` +
        'Enable "USB debugging (Security settings)" in Developer options and ' +
        'retry, or change Settings > Display > Font size by hand between two runs and compare the ' +
        'saved dumps yourself'
    );
  }
}

function restartApp(adb, serial) {
  adbShell(adb, serial, ['am', 'force-stop', APP_ID], { allowFailure: true });
  adbShell(adb, serial, ['am', 'start', '-n', `${APP_ID}/.MainActivity`], { allowFailure: true });
}

function dumpUi(adb, serial) {
  const remote = '/sdcard/seven-window-dump.xml';
  const dumped = adbShell(adb, serial, ['uiautomator', 'dump', remote], { allowFailure: true });
  // "ERROR: could not get idle state" is the usual answer while animating.
  if (/ERROR/i.test(dumped.output)) return '';
  return run(adb, ['-s', serial, 'exec-out', 'cat', remote], { allowFailure: true }).stdout;
}

/**
 * How long to keep asking for a UI dump before giving up on a screen.
 *
 * Default is generous on purpose: a SEVEN dashboard keeps a looping animation
 * alive, so the window never reaches the idle state uiautomator waits for, and
 * dumps land only in the gaps. Measured on a realme RMX2063 running SEVEN 3.3.0,
 * three consecutive dumps failed and a later one succeeded without the screen
 * changing — so the answer is retry, not fail.
 */
const DASHBOARD_TIMEOUT_MS = 180_000;

/**
 * uiautomator refuses to dump while the screen animates, so this retries rather
 * than failing the whole run on one unlucky timing.
 */
function waitForDashboard(adb, serial, timeoutMs = DASHBOARD_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  let attempts = 0;
  while (Date.now() < deadline) {
    last = dumpUi(adb, serial);
    attempts += 1;
    if (LOCK_SCREEN_MARKERS.test(last)) {
      throw new Error('the app is showing its lock screen — disable APP LOCK (or unlock it) and re-run');
    }
    if (DASHBOARD_MARKERS.test(last)) return last;
    // Stay quiet for the first few tries (they usually fail fast) but never let a
    // minutes-long wait look like a hang.
    if (attempts % 5 === 0) {
      console.log(`    … ${attempts} dumps so far, still no stable UI (last one ${last.length} bytes)`);
    }
    sleep(2500);
  }
  throw new Error(
    `dashboard never showed up within ${timeoutMs}ms after ${attempts} dumps. ` +
      'If uiautomator keeps answering "could not get idle state", something on screen animates ' +
      'non-stop (SEVEN keeps a live readout running) — try again with the phone left untouched.'
  );
}

function measureFontScales(options, adb, serial) {
  const original = readFontScale(adb, serial);
  if (original === null) {
    throw new Error('could not read the current font_scale from the device — refusing to measure');
  }
  assertFontScaleWritable(adb, serial, original);
  const dumps = {};
  try {
    for (const [label, scale] of [
      ['low', options.lowScale],
      ['high', options.highScale],
    ]) {
      console.log(`  font_scale ${scale}…`);
      adbShell(adb, serial, ['settings', 'put', 'system', 'font_scale', String(scale)]);
      // A `put` that did not take effect would make both dumps identical and the
      // ratio a meaningless 1.0, so confirm the device actually moved.
      const applied = readFontScale(adb, serial);
      if (applied === null || Math.abs(applied - scale) > 1e-6) {
        throw new Error(
          `font_scale ${scale} did not take effect (device reports ${applied}) — ` +
            'measurement aborted rather than comparing two identical renders'
        );
      }
      restartApp(adb, serial);
      const xml = waitForDashboard(adb, serial);
      dumps[label] = xml;
      writeArtifact(options.out, `ui-font-scale-${scale}.xml`, xml);
    }
  } finally {
    // The device is the user's; whatever happens, leave its setting as found.
    adbShell(adb, serial, ['settings', 'put', 'system', 'font_scale', String(original)], {
      allowFailure: true,
    });
    console.log(`  font_scale restored to ${original}`);
  }

  const pairs = probe.pairTextHeights(dumps.low, dumps.high, options.measure || undefined);
  const summary = probe.summarizeRatios(pairs);
  if (summary.scalingCount < 3 || !summary.median) {
    throw new Error(
      `not enough scaled text to conclude (${summary.scalingCount} of ${summary.paired} labels grew) — ` +
        'is the app actually on the dashboard, with the system font setting applied?'
    );
  }

  const verdict = probe.classifyRatio(summary.median, {
    lowScale: options.lowScale,
    highScale: options.highScale,
    cap: options.cap,
  });
  writeArtifact(
    options.out,
    'font-scale-report.json',
    JSON.stringify({ summary, verdict, pairs, scales: options }, null, 2)
  );

  const detail =
    `median ratio ${summary.median.toFixed(3)} over ${summary.scalingCount} labels ` +
    `(p10 ${summary.p10.toFixed(3)}, p90 ${summary.p90.toFixed(3)}) — ` +
    `expected ${verdict.expected.capped.toFixed(3)} capped, ${verdict.expected.uncapped.toFixed(3)} uncapped`;

  if (verdict.verdict === 'uncapped') {
    throw new Error(`the cap is NOT applied: ${detail}`);
  }
  if (verdict.verdict === 'inconclusive') {
    throw new Error(`measurement cannot tell capped from uncapped: ${detail}`);
  }
  return detail;
}

// --------------------------------------------------------------------- main

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${HELP}`);
    process.exit(2);
  }
  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  const adb = resolveBin('adb');
  const eas = resolveBin('eas');
  const maestro = resolveBin('maestro');

  if (options.dryRun) {
    console.log('Plan (dry run):');
    console.log(`  adb     : ${adb || 'MISSING'}`);
    console.log(`  eas     : ${eas || 'MISSING (only needed for --build)'}`);
    console.log(`  maestro : ${maestro || 'MISSING (flows stage will be skipped)'}`);
    console.log(`  apk     : ${options.apk || (options.build ? 'built by EAS (preview)' : 'MISSING — pass --apk or --build')}`);
    console.log(`  font    : ${options.lowScale} → ${options.highScale} (cap ${options.cap}), measure ${options.measure || 'every label'}`);
    for (const flow of maestroFlows(options)) console.log(`  flow    : ${path.relative(ROOT, flow)}`);
    console.log(`  out     : ${path.relative(ROOT, options.out)}`);
    return;
  }

  if (!adb) {
    console.error('adb not found on PATH — install Android platform-tools first');
    process.exit(2);
  }

  const stages = [];
  const record = (name, status, detail) => {
    stages.push({ name, status, detail });
    const icon = status === 'PASS' ? '✓' : status === 'SKIP' ? '•' : '✗';
    console.log(`${icon} ${name}: ${detail}`);
  };

  let serial = null;
  try {
    serial = resolveTarget(options, adb);
    console.log(`device: ${serial}`);
  } catch (error) {
    record('device', 'FAIL', error.message);
    printSummary(stages);
    process.exit(1);
  }

  let apkPath = null;
  try {
    apkPath = buildApk(options, eas);
    console.log(`apk: ${apkPath}`);
    record('build', 'PASS', path.basename(apkPath));
  } catch (error) {
    record('build', 'FAIL', error.message);
    printSummary(stages);
    process.exit(1);
  }

  let installed;
  try {
    installed = installApk(adb, serial, apkPath);
    record('install', 'PASS', installed);
  } catch (error) {
    record('install', 'FAIL', error.message);
    printSummary(stages);
    process.exit(1);
  }

  if (options.skipMaestro) record('flows', 'SKIP', '--skip-maestro');
  else if (!maestro) {
    record(
      'flows',
      'SKIP',
      'maestro CLI not found — install it (https://maestro.mobile.dev) then re-run without --skip-maestro'
    );
  } else {
    try {
      record('flows', 'PASS', runFlows(options, maestro, serial));
    } catch (error) {
      record('flows', 'FAIL', error.message);
    }
  }

  if (options.skipFont) record('font-cap', 'SKIP', '--skip-font');
  else {
    try {
      record('font-cap', 'PASS', measureFontScales(options, adb, serial));
    } catch (error) {
      record('font-cap', 'FAIL', error.message);
    }
  }

  printSummary(stages);
  process.exit(stages.some((stage) => stage.status === 'FAIL') ? 1 : 0);
}

function printSummary(stages) {
  console.log('\n=== acceptance summary ===');
  for (const stage of stages) {
    console.log(`${stage.status.padEnd(4)} ${stage.name.padEnd(10)} ${stage.detail}`);
  }
}

main();
