/**
 * Gideon's 3D head — a self-contained WebGL scene rendered inside a WebView
 * (native) or an iframe (web). No dependency, no cloud, no downloaded asset:
 * the head is generated procedurally at load time and deformed in the vertex
 * shader by lip-sync uniforms (jaw, lips, blink / gaze).
 *
 * Why WebGL instead of SVG: a nose and a mouth only read as real when they
 * have volume and light. The scene below sculpts an anatomically proportioned
 * head (brow ridge, eye sockets, nose bridge + tip + alae + nostrils, philtrum,
 * upper/lower lips with a REAL opening, chin crease, cheekbones, jaw corners,
 * ears), lights it with key/fill/rim, and renders it as a hologram scan.
 *
 * Protocol — RN -> page:
 *   { type: 'config', status, color, deep, core, amplitude }
 *   { type: 'speak', frames: [{ open, width, full, durationMs }] }
 *   { type: 'stop' }
 * Page -> RN:
 *   { type: 'ready' } | { type: 'error', message }
 *
 * NOTE: never use backticks or dollar-brace inside this string — the whole page
 * is embedded in a TypeScript template literal. Same trap for newline escapes:
 * a single-backslash n anywhere here (code OR comment) becomes a real newline
 * in the output and can silently break the page's syntax — which is exactly how
 * the scene once failed to run at all. Only ever write them as double-backslash
 * n, and keep them inside .join() calls. `__tests__/gideonHeadScene.test.ts`
 * parses the generated page to catch a regression.
 */
export const buildGideonHeadScene = (): string => `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
      * { margin: 0; padding: 0; }
      html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
      canvas { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
    <canvas id="c"></canvas>
    <script>
      (function () {
        var canvas = document.getElementById('c');
        var gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });

        function post(payload) {
          var message = JSON.stringify(payload);
          try {
            if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
              window.ReactNativeWebView.postMessage(message);
              return;
            }
          } catch (e) {}
          try { parent.postMessage(message, '*'); } catch (e) {}
        }
        function fail(message) { post({ type: 'error', message: message }); }
        if (!gl) { fail('webgl-unavailable'); return; }

        // Derivative-based normals give the face its shading; without them we
        // fall back to a radial normal so the scene still renders.
        var canDerive = !!gl.getExtension('OES_standard_derivatives');

        // ---------------------------------------------------------- small math
        function norm(v) {
          var d = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
          return [v[0] / d, v[1] / d, v[2] / d];
        }
        function smoothstep(edge0, edge1, x) {
          var t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
          return t * t * (3 - 2 * t);
        }
        function gauss(dx, dy, dz, rx, ry, rz) {
          return Math.exp(-((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz)));
        }

        // ------------------------------------------------------- anatomy blobs
        // Landmarks: eyes at mid-height, nose base a third below, mouth a third
        // between nose base and chin, ears from brow to nose base.
        // Amplitudes matter more than count: a nose only reads if it stands
        // out from the face by roughly a fifth of the head's height. The first
        // version of this list used amplitudes around 0.03 on a 1.9-unit head,
        // which left the whole face looking like a smooth egg.
        var BLOBS = [
          { c: [0, 0.28, 0.6], r: [0.36, 0.075, 0.26], a: 0.085 },        // brow ridge
          { c: [0.3, 0.05, 0.6], r: [0.24, 0.2, 0.24], a: -0.105 },       // eye socket L
          { c: [-0.3, 0.05, 0.6], r: [0.24, 0.2, 0.24], a: -0.105 },      // eye socket R
          // The dorsum and tip are NOT here: they are a directed ridge built in
          // sculpt(), because a radial blob turns a nose into a spike.
          { c: [0.112, -0.17, 0.68], r: [0.062, 0.055, 0.08], a: 0.16 },  // ala L
          { c: [-0.112, -0.17, 0.68], r: [0.062, 0.055, 0.08], a: 0.16 }, // ala R
          { c: [0.085, -0.2, 0.6], r: [0.042, 0.035, 0.06], a: -0.16 },   // nostril L
          { c: [-0.085, -0.2, 0.6], r: [0.042, 0.035, 0.06], a: -0.16 },  // nostril R
          { c: [0.215, -0.3, 0.62], r: [0.06, 0.12, 0.075], a: -0.07 },   // nasolabial fold L
          { c: [-0.215, -0.3, 0.62], r: [0.06, 0.12, 0.075], a: -0.07 },  // nasolabial fold R
          { c: [0, -0.3, 0.72], r: [0.032, 0.06, 0.09], a: -0.06 },       // philtrum
          { c: [0, -0.375, 0.7], r: [0.19, 0.055, 0.12], a: 0.12 },       // upper lip
          { c: [0.155, -0.39, 0.64], r: [0.07, 0.05, 0.08], a: -0.07 },   // lip corner L
          { c: [-0.155, -0.39, 0.64], r: [0.07, 0.05, 0.08], a: -0.07 },  // lip corner R
          { c: [0, -0.435, 0.72], r: [0.2, 0.02, 0.1], a: -0.1 },         // mouth slit
          { c: [0, -0.485, 0.7], r: [0.16, 0.07, 0.12], a: 0.14 },        // lower lip
          { c: [0, -0.575, 0.66], r: [0.15, 0.035, 0.09], a: -0.07 },     // sublabial groove
          { c: [0, -0.74, 0.55], r: [0.2, 0.14, 0.2], a: 0.1 },           // chin
          { c: [0.46, -0.12, 0.5], r: [0.22, 0.14, 0.18], a: 0.05 },      // cheekbone L
          { c: [-0.46, -0.12, 0.5], r: [0.22, 0.14, 0.18], a: 0.05 },     // cheekbone R
          { c: [0.4, -0.38, 0.52], r: [0.16, 0.12, 0.14], a: -0.05 },     // cheek hollow L
          { c: [-0.4, -0.38, 0.52], r: [0.16, 0.12, 0.14], a: -0.05 },    // cheek hollow R
          { c: [0.63, 0.24, 0.12], r: [0.16, 0.22, 0.3], a: -0.03 },      // temple L
          { c: [-0.63, 0.24, 0.12], r: [0.16, 0.22, 0.3], a: -0.03 },     // temple R
          { c: [0.36, -0.54, -0.06], r: [0.18, 0.22, 0.22], a: 0.02 },    // jaw corner L
          { c: [-0.36, -0.54, -0.06], r: [0.18, 0.22, 0.22], a: 0.02 },   // jaw corner R
          // Ears: not one lump but a plate with a rim, a bowl and a tragus —
          // the same landmarks a real ear reads by.
          { c: [0.7, 0.02, -0.02], r: [0.1, 0.2, 0.16], a: 0.06 },        // ear plate L
          { c: [-0.7, 0.02, -0.02], r: [0.1, 0.2, 0.16], a: 0.06 },       // ear plate R
          { c: [0.735, 0.03, -0.06], r: [0.05, 0.17, 0.1], a: 0.045 },    // helix rim L
          { c: [-0.735, 0.03, -0.06], r: [0.05, 0.17, 0.1], a: 0.045 },   // helix rim R
          { c: [0.7, 0.04, 0.02], r: [0.045, 0.1, 0.06], a: 0.032 },      // antihelix L
          { c: [-0.7, 0.04, 0.02], r: [0.045, 0.1, 0.06], a: 0.032 },     // antihelix R
          { c: [0.655, 0, 0.035], r: [0.055, 0.1, 0.08], a: -0.078 },     // concha L
          { c: [-0.655, 0, 0.035], r: [0.055, 0.1, 0.08], a: -0.078 },    // concha R
          { c: [0.63, -0.055, 0.1], r: [0.045, 0.045, 0.05], a: 0.036 },  // tragus L
          { c: [-0.63, -0.055, 0.1], r: [0.045, 0.045, 0.05], a: 0.036 }, // tragus R
          { c: [0.67, -0.16, -0.02], r: [0.055, 0.055, 0.055], a: 0.03 }, // lobe L
          { c: [-0.67, -0.16, -0.02], r: [0.055, 0.055, 0.055], a: 0.03 } // lobe R
        ];

        function sculpt(p) {
          var x = p[0] * 0.72;
          var y = p[1] * 0.95;
          var z = p[2] * 0.78;
          var jaw = smoothstep(-0.02, -0.82, y);
          x *= 1 - 0.32 * jaw;
          z += 0.09 * jaw * jaw;
          z += 0.05 * smoothstep(0.1, 0.7, y) * Math.max(0, p[2]);
          for (var i = 0; i < BLOBS.length; i++) {
            var b = BLOBS[i];
            var dx = x - b.c[0];
            var dy = y - b.c[1];
            var dz = z - b.c[2];
            var w = gauss(dx, dy, dz, b.r[0], b.r[1], b.r[2]);
            if (w < 0.002) continue;
            var d = norm([dx, dy, dz]);
            var amount = b.a * w;
            x += d[0] * amount;
            y += d[1] * amount;
            z += d[2] * amount;
          }

          // Nose: a directed ridge. The displacement only goes forward and
          // falls off across the midline, so the dorsum stays a ridge with a
          // defined tip and flanks instead of the spike a radial blob makes.
          var front = smoothstep(0.1, 0.5, z);
          if (front > 0.01 && Math.abs(x) < 0.34) {
            var t = (0.3 - y) / 0.44;  // 0 at the bridge root, 1 at the tip
            if (t > -0.5 && t < 1.9) {
              var bridge = Math.exp(-Math.pow((t - 0.6) * 1.3, 2));
              var tip = Math.exp(-Math.pow((t - 1.04) * 2.3, 2));
              var width = 0.06 + 0.052 * Math.max(0, Math.min(1.4, t));
              var lateral = Math.exp(-Math.pow(x / width, 2));
              z += (0.08 * bridge + 0.115 * tip) * lateral * front;
            }
          }
          return [x, y, z];
        }

        // Per-vertex rig weights: jaw, upper lip, lower lip, mouth corners.
        function weightsOf(px, py, pz) {
          var front = smoothstep(-0.5, 0.25, pz);
          var jaw = smoothstep(-0.12, -0.5, py) * front;
          var lipU = gauss(px, py + 0.375, pz - 0.66, 0.2, 0.05, 0.13);
          var lipL = gauss(px, py + 0.478, pz - 0.655, 0.18, 0.055, 0.13);
          var corner =
            (gauss(px - 0.21, py + 0.42, pz - 0.62, 0.12, 0.08, 0.14) +
              gauss(px + 0.21, py + 0.42, pz - 0.62, 0.12, 0.08, 0.14)) *
            0.9;
          return [jaw, lipU, lipL, Math.min(1, corner)];
        }

        // The mouth is a genuine opening: the triangles between the lips are
        // removed so the cavity and teeth show through when the jaw drops.
        // The band has to be at least half a mesh row tall, otherwise only some
        // of the triangles between the lips are dropped and the mouth comes out
        // as a dashed line.
        var MOUTH_Y = -0.435;
        function inMouthOpening(c) {
          return Math.abs(c[0]) < 0.155 && Math.abs(c[1] - MOUTH_Y) < 0.027 && c[2] > 0.5;
        }

        // --------------------------------------------------------- mesh builder
        // Baked ambient occlusion: the carved blobs (eye sockets, nostrils,
        // mouth line, folds, concha) mark the concave landmarks of the face.
        // Without it the sculpt reads as a smooth mask no matter how much
        // relief it has, because nothing goes dark.
        function occlOf(px, py, pz) {
          var occ = 0;
          for (var i = 0; i < BLOBS.length; i++) {
            var b = BLOBS[i];
            if (b.a >= 0) continue;
            occ += -b.a * 3.4 * gauss(px - b.c[0], py - b.c[1], pz - b.c[2], b.r[0], b.r[1], b.r[2]);
          }
          // The neck sits in the shadow of the jaw, the sides fall away from
          // the key light.
          occ += 0.5 * smoothstep(-0.62, -0.95, py);
          occ += 0.28 * smoothstep(0.2, 0.75, Math.abs(px));
          return Math.exp(-occ);
        }

        function gridMesh(lon, lat, pointOf, weightsFn, aoFn) {
          var positions = [];
          var weights = [];
          var ao = [];
          var indices = [];
          var grid = [];
          for (var iy = 0; iy <= lat; iy++) {
            grid[iy] = [];
            for (var ix = 0; ix <= lon; ix++) {
              var theta = (iy / lat) * Math.PI;
              var phi = (ix / lon) * Math.PI * 2;
              var sp = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)];
              var p = pointOf(sp);
              grid[iy][ix] = positions.length / 3;
              positions.push(p[0], p[1], p[2]);
              if (weightsFn) {
                var w = weightsFn(p);
                weights.push(w[0], w[1], w[2], w[3]);
              }
              if (aoFn) ao.push(aoFn(p));
            }
          }
          for (var y = 0; y < lat; y++) {
            for (var x = 0; x < lon; x++) {
              var a = grid[y][x];
              var b = grid[y + 1][x];
              var c = grid[y + 1][x + 1];
              var d = grid[y][x + 1];
              if (weightsFn) {
                var centroid = [
                  (positions[a * 3] + positions[b * 3] + positions[c * 3] + positions[d * 3]) / 4,
                  (positions[a * 3 + 1] + positions[b * 3 + 1] + positions[c * 3 + 1] + positions[d * 3 + 1]) / 4,
                  (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2] + positions[d * 3 + 2]) / 4
                ];
                if (inMouthOpening(centroid)) continue;
              }
              indices.push(a, b, d, b, c, d);
            }
          }
          // Per-vertex normals from the grid neighbours. Derivative normals are
          // flat per triangle, which is what made the sculpted face read as
          // low-poly facets instead of a surface.
          var normals = [];
          for (var ny = 0; ny <= lat; ny++) {
            for (var nx = 0; nx <= lon; nx++) {
              var i0 = grid[ny][Math.max(0, nx - 1)] * 3;
              var i1 = grid[ny][Math.min(lon, nx + 1)] * 3;
              var j0 = grid[Math.max(0, ny - 1)][nx] * 3;
              var j1 = grid[Math.min(lat, ny + 1)][nx] * 3;
              var ux = positions[i1] - positions[i0];
              var uy = positions[i1 + 1] - positions[i0 + 1];
              var uz = positions[i1 + 2] - positions[i0 + 2];
              var vx = positions[j1] - positions[j0];
              var vy = positions[j1 + 1] - positions[j0 + 1];
              var vz = positions[j1 + 2] - positions[j0 + 2];
              var nx0 = uy * vz - uz * vy;
              var ny0 = uz * vx - ux * vz;
              var nz0 = ux * vy - uy * vx;
              var nlen = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0) || 1;
              var selfAt = grid[ny][nx] * 3;
              var outward =
                (nx0 * positions[selfAt] + ny0 * positions[selfAt + 1] + nz0 * positions[selfAt + 2]) / nlen;
              var sign = outward < 0 ? -1 : 1;
              normals.push((nx0 / nlen) * sign, (ny0 / nlen) * sign, (nz0 / nlen) * sign);
            }
          }
          return {
            positions: positions,
            weights: weights.length ? weights : null,
            indices: indices,
            normals: normals,
            ao: ao.length ? ao : null
          };
        }

        var head = gridMesh(
          104,
          78,
          function (sp) { return sculpt(sp); },
          function (p) { return weightsOf(p[0], p[1], p[2]); },
          function (p) { return occlOf(p[0], p[1], p[2]); }
        );

        // Neck + shoulders so the head is not floating.
        var bodyParts = (function () {
          var rings = [
            { y: -0.78, r: 0.33, z: 0.02 },
            { y: -0.95, r: 0.3, z: -0.02 },
            { y: -1.08, r: 0.29, z: -0.05 },
            { y: -1.2, r: 0.34, z: -0.08 },
            { y: -1.32, r: 0.5, z: -0.1 },
            { y: -1.45, r: 0.78, z: -0.12 },
            { y: -1.58, r: 1.02, z: -0.14 }
          ];
          var positions = [];
          var indices = [];
          var seg = 48;
          for (var r = 0; r < rings.length; r++) {
            for (var i = 0; i <= seg; i++) {
              var a2 = (i / seg) * Math.PI * 2;
              positions.push(
                Math.sin(a2) * rings[r].r,
                rings[r].y,
                Math.cos(a2) * rings[r].r * 0.72 + rings[r].z
              );
            }
          }
          for (var r2 = 0; r2 < rings.length - 1; r2++) {
            for (var i2 = 0; i2 < seg; i2++) {
              var base = r2 * (seg + 1) + i2;
              indices.push(base, base + seg + 1, base + 1, base + 1, base + seg + 1, base + seg + 2);
            }
          }
          return { positions: positions, indices: indices };
        })();

        // Eyeball, built around the origin: the shader places it at the socket.
        var eyeball = (function () {
          var lat = 24;
          var lon = 32;
          var positions = [];
          var locals = [];
          var indices = [];
          var grid = [];
          var radius = 0.152;
          for (var iy = 0; iy <= lat; iy++) {
            grid[iy] = [];
            for (var ix = 0; ix <= lon; ix++) {
              var theta = (iy / lat) * Math.PI;
              var phi = (ix / lon) * Math.PI * 2;
              var d = [Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi)];
              grid[iy][ix] = positions.length / 3;
              positions.push(d[0] * radius, d[1] * radius, d[2] * radius);
              locals.push(d[0], d[1], d[2]);
            }
          }
          for (var y = 0; y < lat; y++) {
            for (var x = 0; x < lon; x++) {
              var a = grid[y][x];
              var b = grid[y + 1][x];
              var c = grid[y + 1][x + 1];
              var d2 = grid[y][x + 1];
              indices.push(a, b, d2, b, c, d2);
            }
          }
          return { positions: positions, locals: locals, indices: indices };
        })();

        // Eyelid shell: a spherical band around the eyeball in the OPEN state.
        // ang is measured from +y towards +z (0 = top of the eye, PI/2 = front).
        function lidShell(radius, angFrom, angTo, spreadMax) {
          var seg = 30;
          var across = 8;
          var positions = [];
          var indices = [];
          var grid = [];
          for (var iy = 0; iy <= across; iy++) {
            var ang = angFrom + (angTo - angFrom) * (iy / across);
            grid[iy] = [];
            for (var ix = 0; ix <= seg; ix++) {
              var u = (ix / seg) * 2 - 1;
              var spread = u * spreadMax * (0.55 + 0.45 * Math.sin(Math.min(Math.PI, ang * 1.6)));
              var y = Math.cos(ang) * Math.cos(spread);
              var z = Math.sin(ang) * Math.cos(spread);
              var x = Math.sin(spread);
              var n = norm([x, y, z]);
              grid[iy][ix] = positions.length / 3;
              positions.push(n[0] * radius, n[1] * radius, n[2] * radius);
            }
          }
          for (var y2 = 0; y2 < across; y2++) {
            for (var x2 = 0; x2 < seg; x2++) {
              var a = grid[y2][x2];
              var b = grid[y2 + 1][x2];
              var c = grid[y2 + 1][x2 + 1];
              var d3 = grid[y2][x2 + 1];
              indices.push(a, b, d3, b, c, d3);
            }
          }
          return { positions: positions, indices: indices };
        }
        var lidUpper = lidShell(0.163, 0.17, 0.7, 1.08);
        var lidLower = lidShell(0.16, 2.86, 2.66, 0.88);

        // Teeth arcs (in head space, so the lower row rides the jaw weight).
        function teethArc(y, radius, zOffset, thickness, span, steps) {
          var positions = [];
          var indices = [];
          var grid = [];
          for (var i = 0; i <= steps; i++) {
            var u = i / steps;
            var ang = -span / 2 + span * u;
            var wobble = 1 - 0.05 * (i % 2);
            grid[i] = [];
            for (var j = 0; j < 2; j++) {
              grid[i][j] = positions.length / 3;
              positions.push(
                Math.sin(ang) * radius * wobble,
                y - (j === 0 ? 0 : thickness),
                Math.cos(ang) * radius + zOffset
              );
            }
          }
          for (var s = 0; s < steps; s++) {
            var a4 = grid[s][0];
            var b4 = grid[s][1];
            var c4 = grid[s + 1][0];
            var d4 = grid[s + 1][1];
            indices.push(a4, b4, c4, b4, d4, c4);
          }
          return { positions: positions, indices: indices };
        }
        var teethUpper = teethArc(-0.377, 0.19, 0.4, 0.05, 0.95, 12);
        var teethLower = teethArc(-0.497, 0.18, 0.4, 0.05, 0.95, 12);

        // Tongue + dark mouth cavity.
        var tongue = gridMesh(16, 12, function (sp) {
          return [sp[0] * 0.14, sp[1] * 0.045 - 0.465, sp[2] * 0.13 + 0.47];
        });
        var cavity = gridMesh(18, 14, function (sp) {
          return [sp[0] * 0.19, sp[1] * 0.14 - 0.44, sp[2] * 0.16 + 0.43];
        });

        // ------------------------------------------------------------- shaders
        var VS = [
          'attribute vec3 aPos;',
          'attribute vec4 aW;',
          'attribute vec3 aLocal;',
          'attribute vec3 aNormal;',
          'attribute float aAo;',
          'uniform float uAspect;',
          'uniform float uFocal;',
          'uniform float uCamZ;',
          'uniform float uPart;',
          'uniform float uJaw;',
          'uniform float uLipOpen;',
          'uniform float uLipWidth;',
          'uniform float uLipFull;',
          'uniform float uLidAngle;',
          'uniform float uEyeShift;',
          'uniform vec3 uEyeCenter;',
          'uniform vec2 uShift;',
          'varying vec3 vPos;',
          'varying vec3 vEyeLocal;',
          'varying vec4 vW;',
          'varying vec2 vLidUv;',
          'varying vec3 vNormal;',
          'varying float vAo;',
          'void main() {',
          '  vec3 p = aPos;',
          '  vAo = aAo;',
          // The normal follows the same rig as the surface, otherwise the
          // shading would stay put while the jaw moves.
          '  vec3 nrm = aNormal;',
          '  vec2 lidUv = vec2(0.0);',
          '  if (uPart > 0.5) {',
          '    p = uEyeCenter + p;',
          '    lidUv = vec2(aPos.x, aPos.y);',
          '  }',
          '  float jaw = aW.x;',
          '  if (jaw > 0.001 && uPart < 0.5) {',
          '    vec3 hinge = vec3(0.0, -0.14, -0.22);',
          '    vec3 rel = p - hinge;',
          '    float ang = -0.30 * uJaw * jaw;',
          '    float c = cos(ang);',
          '    float s = sin(ang);',
          '    p = hinge + vec3(rel.x, rel.y * c - rel.z * s, rel.y * s + rel.z * c);',
          '    nrm = vec3(nrm.x, nrm.y * c - nrm.z * s, nrm.y * s + nrm.z * c);',
          '  }',
          '  if (uPart < 0.5) {',
          '    p.y += 0.034 * uLipOpen * aW.y;',
          '    p.y -= 0.032 * uLipOpen * aW.z;',
          '    p.x *= mix(1.0, uLipWidth, aW.w);',
          '    p.z += 0.026 * (uLipFull - 1.0) * (aW.y + aW.z) * 0.5;',
          '    p.y += 0.012 * (uLipFull - 1.0) * aW.y;',
          '    p.y -= 0.014 * (uLipFull - 1.0) * aW.z;',
          '  }',
          '  if (uPart > 0.5 && abs(uEyeShift) > 0.0001) {',
          '    p.x += uEyeShift;',
          '  }',
          '  if (abs(uLidAngle) > 0.0001) {',
          '    vec3 rel2 = p - uEyeCenter;',
          '    float cc = cos(uLidAngle);',
          '    float ss = sin(uLidAngle);',
          '    p = uEyeCenter + vec3(rel2.x, rel2.y * cc - rel2.z * ss, rel2.y * ss + rel2.z * cc);',
          '    nrm = vec3(nrm.x, nrm.y * cc - nrm.z * ss, nrm.y * ss + nrm.z * cc);',
          '  }',
          '  vPos = p;',
          '  vEyeLocal = p - uEyeCenter;',
          '  vW = aW;',
          '  vNormal = nrm;',
          '  vLidUv = lidUv;',
          '  vec3 vp = p + vec3(0.0, 0.03, -uCamZ);',
          // Proper perspective: clip = (ndc.xy * depth, ndc.z * depth, depth) so
          // the hardware divides ONCE, and the depth grows with distance —
          // with the old mapping the far side of the skull tested as nearer
          // than the face, so the render showed the smooth back of the head
          // instead of the sculpted face.
          '  float depth = -vp.z;',
          '  float zNdc = (2.0 * depth - 7.0) / 5.0;',
          '  vec2 screen = vec2(vp.x * uFocal / uAspect / depth, vp.y * uFocal / depth) + uShift;',
          '  gl_Position = vec4(screen * depth, zNdc * depth, depth);',
          '}'
        ].join('\\n');

        // NOTE: the #extension directive must be the very first token of the
        // shader and is only valid when the driver actually exposes the
        // extension — wrapping it in #ifdef never enables it (that mistake
        // silently disabled the whole scene). The normal therefore falls back
        // to a radial approximation on drivers without derivatives.
        // Built as an array joined below on purpose: a raw newline escape
        // written inline here is turned into a REAL newline by the outer
        // template literal, which breaks this whole page's syntax (see the
        // header note). Keep newline escapes only inside .join() calls.
        var FS_PRE = canDerive
          ? ['#extension GL_OES_standard_derivatives : enable', '#define HAS_DERIVATIVES 1']
          : [];
        var FS_HEAD = FS_PRE.concat([
          'precision mediump float;',
          'uniform float uTime;',
          'uniform vec3 uColor;',
          'uniform vec3 uDeep;',
          'uniform vec3 uCore;',
          'uniform float uAmp;',
          'uniform float uReveal;',
          'uniform float uMode;',
          'uniform float uLid;',
          'uniform float uVertexNormals;',
          'varying vec3 vPos;',
          'varying vec3 vEyeLocal;',
          'varying vec4 vW;',
          'varying vec2 vLidUv;',
          'varying vec3 vNormal;',
          'varying float vAo;',
          'void main() {',
          // The face carries real per-vertex normals (smooth skin); the small
          // parts fall back to derivative normals.
          '#ifdef HAS_DERIVATIVES',
          '  vec3 flatN = normalize(cross(dFdx(vPos), dFdy(vPos)));',
          '#else',
          '  vec3 flatN = normalize(vec3(vPos.x / 0.5184, vPos.y / 0.9025, vPos.z / 0.6084));',
          '#endif',
          '  vec3 vn = dot(vNormal, vNormal) > 0.01 ? normalize(vNormal) : flatN;',
          '  vec3 n = normalize(mix(flatN, vn, uVertexNormals));',
          '  vec3 viewDir = normalize(vec3(0.0, 0.0, 2.45) - vPos);',
          // Key light with a real falloff, plus a highlight: the previous
          // flat 0.5-baseline diffuse flattened the whole face into an egg.
          '  vec3 key = normalize(vec3(-0.42, 0.52, 0.74));',
          '  vec3 fill = normalize(vec3(0.62, -0.3, 0.4));',
          '  float diffuse = max(0.0, dot(n, key));',
          '  float fillLight = max(0.0, dot(n, fill)) * 0.22;',
          '  float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.6);',
          '  float ambient = (0.36 + 0.3 * (0.5 + 0.5 * n.y)) * vAo;',
          '  vec3 color = uDeep * (0.55 + 0.7 * ambient) + uColor * (0.6 * diffuse + fillLight + 0.2 * ambient);',
          '  if (uMode < 0.5) {',
          '    color *= mix(0.34, 1.0, vAo);',
          '    color += uCore * rim * (0.3 + 0.2 * uAmp);',
          '    float spec = pow(max(0.0, dot(reflect(-key, n), viewDir)), 26.0);',
          '    color += uCore * spec * 0.45;',
          // Scanlines stay coarse on purpose: a dense grid aliases into moire
          // noise that hides the very anatomy it is drawn over.
          '    float gridY = smoothstep(0.985, 1.0, abs(sin(vPos.y * 13.0)));',
          '    float gridX = smoothstep(0.99, 1.0, abs(sin(vPos.x * 11.0)));',
          '    color += uColor * (gridY * 0.05 + gridX * 0.035);',
          '    float sweep = exp(-pow((fract(uTime * 0.11) * 2.8 - 1.4) - vPos.y, 2.0) * 14.0);',
          '    color += uCore * sweep * 0.26;',
          '    float lips = smoothstep(0.25, 0.95, max(vW.y, vW.z));',
          '    color *= 1.0 - 0.26 * lips;',
          '    if (uLid > 0.5) {',
          '      float lidEdge = smoothstep(0.055, 0.105, abs(vLidUv.y) + abs(vLidUv.x) * 0.35);',
          '      color *= 0.68 + 0.32 * lidEdge;',
          '    }',
          '  } else if (uMode < 1.5) {',
          '    vec3 d = normalize(vEyeLocal);',
          '    float radial = length(d.xy);',
          '    float iris = smoothstep(0.42, 0.4, radial);',
          '    float pupil = smoothstep(0.17, 0.15, radial);',
          '    float limbal = smoothstep(0.43, 0.4, radial) - smoothstep(0.4, 0.37, radial);',
          '    vec3 irisColor = mix(vec3(0.04, 0.3, 0.38), uColor, 0.5);',
          '    color = mix(vec3(0.42, 0.6, 0.66), irisColor, iris);',
          '    color = mix(color, vec3(0.01, 0.04, 0.06), pupil);',
          '    color += uCore * limbal * 0.7;',
          '    float catchLight = smoothstep(0.09, 0.01, length(d.xy - vec2(-0.12, 0.13)));',
          '    color += vec3(1.0) * catchLight * 0.85;',
          '    color *= 0.7 + 0.3 * diffuse;',
          '  } else if (uMode < 2.5) {',
          '    color = vec3(0.85, 0.96, 1.0) * (0.5 + 0.5 * diffuse);',
          '  } else {',
          '    color = vec3(0.01, 0.045, 0.065) + uDeep * 0.25;',
          '  }',
          '  color *= 0.94 + 0.06 * sin(uTime * 28.0 + vPos.y * 36.0);',
          '  if (uReveal < 0.999) {',
          '    float band = mix(1.4, -1.4, uReveal);',
          '    if (vPos.y > band) discard;',
          '    color += uCore * smoothstep(0.18, 0.0, abs(vPos.y - band)) * 0.45;',
          '  }',
          '  gl_FragColor = vec4(color, 0.98);',
          '}'
        ]).join('\\n');

        function compile(type, src) {
          var sh = gl.createShader(type);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            fail('shader: ' + gl.getShaderInfoLog(sh));
            return null;
          }
          return sh;
        }
        var program = gl.createProgram();
        var vs = compile(gl.VERTEX_SHADER, VS);
        var fs = compile(gl.FRAGMENT_SHADER, FS_HEAD);
        // compile() already reported the failure; bail out instead of handing
        // null to attachShader (which throws inside the page and leaves the
        // caller with a silent black frame).
        if (!vs || !fs) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          fail('link: ' + gl.getProgramInfoLog(program));
          return;
        }
        gl.useProgram(program);

        function bufferOf(data) {
          var b = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
          return b;
        }
        function part(positions, weights, indices, locals, normals, ao) {
          var ib = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
          return {
            pos: bufferOf(positions),
            w: weights ? bufferOf(weights) : null,
            local: locals ? bufferOf(locals) : null,
            nrm: normals ? bufferOf(normals) : null,
            ao: ao ? bufferOf(ao) : null,
            idx: ib,
            count: indices.length
          };
        }
        function uniformWeights(count, jaw) {
          var out = [];
          for (var i = 0; i < count; i++) out.push(jaw, 0, 0, 0);
          return out;
        }

        var parts = {
          head: part(head.positions, head.weights, head.indices, null, head.normals, head.ao),
          body: part(bodyParts.positions, uniformWeights(bodyParts.positions.length / 3, 0), bodyParts.indices),
          eye: part(eyeball.positions, null, eyeball.indices, eyeball.locals),
          lidUpper: part(lidUpper.positions, null, lidUpper.indices),
          lidLower: part(lidLower.positions, null, lidLower.indices),
          teethUpper: part(
            teethUpper.positions,
            uniformWeights(teethUpper.positions.length / 3, 0),
            teethUpper.indices
          ),
          teethLower: part(
            teethLower.positions,
            uniformWeights(teethLower.positions.length / 3, 1),
            teethLower.indices
          ),
          tongue: part(tongue.positions, uniformWeights(tongue.positions.length / 3, 1), tongue.indices),
          cavity: part(cavity.positions, uniformWeights(cavity.positions.length / 3, 0), cavity.indices)
        };

        var A = {
          pos: gl.getAttribLocation(program, 'aPos'),
          w: gl.getAttribLocation(program, 'aW'),
          local: gl.getAttribLocation(program, 'aLocal'),
          nrm: gl.getAttribLocation(program, 'aNormal'),
          ao: gl.getAttribLocation(program, 'aAo')
        };
        var U = {};
        [
          'uTime', 'uAspect', 'uFocal', 'uCamZ', 'uPart', 'uJaw', 'uLipOpen', 'uLipWidth', 'uLipFull',
          'uLidAngle', 'uEyeShift', 'uEyeCenter', 'uColor', 'uDeep', 'uCore', 'uAmp', 'uReveal', 'uMode', 'uLid',
          'uShift', 'uVertexNormals'
        ].forEach(function (name) {
          U[name] = gl.getUniformLocation(program, name);
        });

        var state = {
          color: [0.0, 0.9, 1.0],
          deep: [0.02, 0.16, 0.21],
          core: [0.85, 0.98, 1.0],
          amplitude: 0,
          frames: [],
          frameStart: 0,
          speaking: false,
          jaw: 0,
          lipOpen: 0,
          lipWidth: 1,
          lipFull: 1,
          lastBlink: -4000
        };

        function bind(p) {
          gl.bindBuffer(gl.ARRAY_BUFFER, p.pos);
          gl.enableVertexAttribArray(A.pos);
          gl.vertexAttribPointer(A.pos, 3, gl.FLOAT, false, 0, 0);
          if (A.w >= 0) {
            if (p.w) {
              gl.bindBuffer(gl.ARRAY_BUFFER, p.w);
              gl.enableVertexAttribArray(A.w);
              gl.vertexAttribPointer(A.w, 4, gl.FLOAT, false, 0, 0);
            } else {
              gl.disableVertexAttribArray(A.w);
              gl.vertexAttrib4f(A.w, 0, 0, 0, 0);
            }
          }
          if (A.local >= 0) {
            if (p.local) {
              gl.bindBuffer(gl.ARRAY_BUFFER, p.local);
              gl.enableVertexAttribArray(A.local);
              gl.vertexAttribPointer(A.local, 3, gl.FLOAT, false, 0, 0);
            } else {
              gl.disableVertexAttribArray(A.local);
              gl.vertexAttrib3f(A.local, 0, 0, 0);
            }
          }
          if (A.ao >= 0) {
            if (p.ao) {
              gl.bindBuffer(gl.ARRAY_BUFFER, p.ao);
              gl.enableVertexAttribArray(A.ao);
              gl.vertexAttribPointer(A.ao, 1, gl.FLOAT, false, 0, 0);
            } else {
              gl.disableVertexAttribArray(A.ao);
              gl.vertexAttrib1f(A.ao, 1);
            }
          }
          if (A.nrm >= 0) {
            if (p.nrm) {
              gl.bindBuffer(gl.ARRAY_BUFFER, p.nrm);
              gl.enableVertexAttribArray(A.nrm);
              gl.vertexAttribPointer(A.nrm, 3, gl.FLOAT, false, 0, 0);
            } else {
              // No normals uploaded: the shader falls back to derivative normals.
              gl.disableVertexAttribArray(A.nrm);
              gl.vertexAttrib3f(A.nrm, 0, 0, 0);
            }
          }
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.idx);
        }

        var EYE = [0.3, 0.06, 0.6];

        function draw(p, opts) {
          bind(p);
          gl.uniform1f(U.uMode, opts.mode);
          gl.uniform1f(U.uPart, opts.part || 0);
          gl.uniform1f(U.uLid, opts.lid || 0);
          gl.uniform1f(U.uLidAngle, opts.lidAngle || 0);
          gl.uniform1f(U.uEyeShift, opts.eyeShift || 0);
          gl.uniform1f(U.uVertexNormals, opts.vn || 0);
          gl.uniform3fv(U.uEyeCenter, opts.eyeCenter || [0, 0, 0]);
          gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_SHORT, 0);
        }

        // ------------------------------------------------------------- framing
        // The head is generated, not authored, so its size is not a given:
        // frame it from its own bounding box rather than hardcoded camera
        // values (which is what once left the whole scene stuck in extreme
        // close-up on a blank ball).
        var HEAD_BOX = (function () {
          var lo = [1e9, 1e9, 1e9];
          var hi = [-1e9, -1e9, -1e9];
          var p = head.positions;
          for (var i = 0; i < p.length; i += 3) {
            for (var k = 0; k < 3; k++) {
              if (p[i + k] < lo[k]) lo[k] = p[i + k];
              if (p[i + k] > hi[k]) hi[k] = p[i + k];
            }
          }
          return {
            cx: (lo[0] + hi[0]) / 2,
            cy: (lo[1] + hi[1]) / 2,
            halfW: (hi[0] - lo[0]) / 2,
            halfH: (hi[1] - lo[1]) / 2
          };
        })();

        // -------------------------------------------------------------- resize
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var camZ = 2.4;
        var frameState = { focal: 1.5, shiftX: 0, shiftY: 0, aspect: 1 };
        var HEAD_TARGET_Y = 0.16;
        function applyFrame() {
          gl.uniform1f(U.uCamZ, camZ);
          gl.uniform1f(U.uFocal, frameState.focal);
          gl.uniform1f(U.uAspect, frameState.aspect);
          gl.uniform2f(U.uShift, frameState.shiftX, frameState.shiftY);
        }
        function resize() {
          var w = canvas.clientWidth || window.innerWidth || 1;
          var h = canvas.clientHeight || window.innerHeight || 1;
          canvas.width = Math.max(1, Math.floor(w * dpr));
          canvas.height = Math.max(1, Math.floor(h * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);
          var aspect = w / h;
          frameState.aspect = aspect;

          // Analytic first guess: the head fills ~62% of the canvas height,
          // centred a touch above the middle, with the rest of the frame left
          // to the neck, shoulders and the projection column.
          var m = Math.min(0.62 / HEAD_BOX.halfH, (0.78 * aspect) / HEAD_BOX.halfW);
          frameState.focal = m * camZ;
          frameState.shiftX = (-m * HEAD_BOX.cx) / aspect;
          frameState.shiftY = 0.24 - m * HEAD_BOX.cy;
          applyFrame();
        }
        window.addEventListener('resize', resize);

        // ---------------------------------------------------- auto calibration
        // The projection above is right on paper, yet measured against a real
        // framebuffer the head came out at roughly half the intended size and
        // the shift had no effect — driver behaviour that cannot be reasoned
        // about from the shader source alone. So: render, read the pixels back,
        // correct, and repeat. On a driver that behaves as expected the first
        // pass measures the target already and nothing is changed.
        function measureExtent() {
          var w = gl.drawingBufferWidth;
          var h = gl.drawingBufferHeight;
          var buf = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          var minX = w;
          var maxX = -1;
          var minY = h;
          var maxY = -1;
          for (var p = 0; p < w * h; p++) {
            if (buf[p * 4 + 3] > 24) {
              var x = p % w;
              var y = h - 1 - ((p / w) | 0);
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          return {
            minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: w, h: h,
            empty: maxX < 0
          };
        }

        function calibrateFraming() {
          for (var pass = 0; pass < 3; pass++) {
            // Measure the head on its own: the neck and shoulders must not be
            // allowed to shrink the face (they are meant to be cropped).
            renderScene(0, 1, 0, true);
            var b = measureExtent();
            if (b.empty) return;
            var height = b.maxY - b.minY;
            var width = b.maxX - b.minX;
            if (height < 8 || width < 8) return;
            // uAspect first: it is the only knob for the horizontal scale, and
            // a wrong one squashes the whole face into an egg.
            var targetAspect = HEAD_BOX.halfW / HEAD_BOX.halfH;
            var measuredAspect = width / height;
            var aspectFix = Math.min(1.6, Math.max(0.6, measuredAspect / targetAspect));
            frameState.aspect *= aspectFix;

            // Then fit the head to ~60% of the canvas height, capped by width.
            var target = Math.min(0.6 * b.h, (0.84 * b.w * height) / width);
            var grow = Math.min(2.6, Math.max(0.35, target / height));
            var centreY = 1 - (2 * ((b.minY + b.maxY) / 2)) / b.h;
            var centreX = (2 * ((b.minX + b.maxX) / 2)) / b.w - 1;
            if (
              Math.abs(aspectFix - 1) < 0.01 &&
              Math.abs(grow - 1) < 0.01 &&
              Math.abs(centreY - HEAD_TARGET_Y) < 0.01 &&
              Math.abs(centreX) < 0.01
            ) {
              return;
            }
            frameState.focal *= grow;
            // Aim the head's centre a little above the middle so the neck,
            // shoulders and projection column stay in frame below it.
            frameState.shiftY += HEAD_TARGET_Y - centreY;
            frameState.shiftX -= centreX;
            applyFrame();
          }
        }

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clearColor(0, 0, 0, 0);
        // uFocal / uCamZ / uShift are computed in resize() from the head box.

        // ----------------------------------------------------------- animation
        var reveal = 0;
        var t0 = performance.now();

        function visemeAt(now) {
          if (!state.speaking || !state.frames.length) return null;
          var elapsed = now - state.frameStart;
          var acc = 0;
          for (var i = 0; i < state.frames.length; i++) {
            var f = state.frames[i];
            if (elapsed < acc + f.durationMs) return { f: f, t: (elapsed - acc) / f.durationMs };
            acc += f.durationMs;
          }
          // Outlived the timeline: keep a soft idle articulation.
          return { f: { open: 0.25 + 0.2 * Math.sin(now * 0.02), width: 1, full: 1 }, t: 0 };
        }

        function frame() {
          var now = performance.now();
          var time = (now - t0) / 1000;
          var target = visemeAt(now);
          var ease = target && state.speaking ? 0.18 : 0.08;

          if (target) {
            state.jaw += (target.f.open * 0.9 - state.jaw) * ease;
            state.lipOpen += (target.f.open - state.lipOpen) * ease;
            state.lipWidth += (target.f.width - state.lipWidth) * ease;
            state.lipFull += (target.f.full - state.lipFull) * ease;
          } else {
            state.jaw += (0 - state.jaw) * ease;
            state.lipOpen += (0.02 - state.lipOpen) * ease;
            state.lipWidth += (1 - state.lipWidth) * ease;
            state.lipFull += (1 - state.lipFull) * ease;
          }

          var sinceBlink = now - state.lastBlink;
          if (sinceBlink > 4200) state.lastBlink = now - 0;
          var blink = 0;
          if (sinceBlink > 3600 && sinceBlink < 3770) blink = (sinceBlink - 3600) / 170;
          else if (sinceBlink >= 3770 && sinceBlink < 3900) blink = 1 - (sinceBlink - 3770) / 130;
          else if (sinceBlink >= 3900 && sinceBlink < 4200) blink = 0;

          reveal = Math.min(1, reveal + 0.011);

          renderScene(time, reveal, blink);
          requestAnimationFrame(frame);
        }

        function renderScene(time, revealValue, blink, headOnly) {
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          gl.uniform1f(U.uTime, time);
          gl.uniform3fv(U.uColor, state.color);
          gl.uniform3fv(U.uDeep, state.deep);
          gl.uniform3fv(U.uCore, state.core);
          gl.uniform1f(U.uJaw, state.jaw);
          gl.uniform1f(U.uLipOpen, state.lipOpen);
          gl.uniform1f(U.uLipWidth, state.lipWidth);
          gl.uniform1f(U.uLipFull, state.lipFull);
          gl.uniform1f(U.uAmp, state.amplitude);
          gl.uniform1f(U.uReveal, revealValue);

          // Body first, then the head — teeth only show once the jaw drops,
          // otherwise the closed mouth would read as an open one.
          if (!headOnly) draw(parts.body, { mode: 0 });
          draw(parts.cavity, { mode: 3 });
          draw(parts.tongue, { mode: 3 });
          draw(parts.head, { mode: 0, vn: 1 });
          if (state.jaw > 0.055) {
            draw(parts.teethUpper, { mode: 2 });
            draw(parts.teethLower, { mode: 2 });
          }

          var gaze = 0.012 * Math.sin(time * 0.5) + 0.004 * Math.sin(time * 1.7);
          // The lids rest partly closed: a full sphere of sclera reads as a
          // stuck-on googly eye, not a human one.
          var lidUpperAngle = blink * 1.42 + 0.5;
          var lidLowerAngle = blink * -0.26 - 0.22;
          [1, -1].forEach(function (side) {
            var center = [EYE[0] * side, EYE[1], EYE[2]];
            draw(parts.eye, { mode: 1, part: 1, eyeCenter: center, eyeShift: gaze * side });
            draw(parts.lidUpper, { mode: 0, part: 1, lid: 1, eyeCenter: center, lidAngle: lidUpperAngle });
            draw(parts.lidLower, { mode: 0, part: 1, lid: 1, eyeCenter: center, lidAngle: lidLowerAngle });
          });
        }

        function onMessage(raw) {
          var data = raw;
          if (typeof raw === 'string') {
            try { data = JSON.parse(raw); } catch (e) { return; }
          }
          if (!data || !data.type) return;
          if (data.type === 'config') {
            if (data.color) state.color = data.color;
            if (data.deep) state.deep = data.deep;
            if (data.core) state.core = data.core;
            if (typeof data.amplitude === 'number') state.amplitude = data.amplitude;
            if (data.status && data.status !== 'speaking') {
              state.speaking = false;
              state.frames = [];
            }
          } else if (data.type === 'speak') {
            state.frames = data.frames || [];
            state.frameStart = performance.now();
            state.speaking = true;
          } else if (data.type === 'stop') {
            state.speaking = false;
            state.frames = [];
          }
        }

        window.addEventListener('message', function (e) { onMessage(e.data); });
        document.addEventListener('message', function (e) { onMessage(e.data); });

        resize();
        // Fit the camera to what this GPU actually draws before the first paint.
        calibrateFraming();
        requestAnimationFrame(frame);
        post({ type: 'ready' });
      })();
    </script>
  </body>
</html>
`;
