import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { AssistantStatus } from '../types';

interface OrbShaderViewProps {
  status?: AssistantStatus;
  size?: number;
  amplitude?: number;
  themeColor?: string;
}

/**
 * 3D WebGL Shader Orb using interactive GLSL particle mesh.
 * Renders directly via local HTML/Canvas WebGL context at 60 FPS, with zero cloud or API cost.
 */
export const OrbShaderView: React.FC<OrbShaderViewProps> = ({
  status = 'idle',
  size = 280,
  amplitude = 0,
  themeColor = '#00E5FF',
}) => {
  const htmlContent = useMemo(() => {
    // Dynamic color depending on status
    const rgbColor =
      status === 'thinking'
        ? [0.74, 0.0, 1.0] // Deep Purple
        : status === 'speaking'
        ? [0.0, 0.9, 1.0] // Cyan pulse
        : status === 'listening'
        ? [0.0, 1.0, 0.64] // Neon emerald
        : status === 'healing'
        ? [1.0, 0.2, 0.4] // Crimson red
        : [0.0, 0.9, 1.0]; // SEVEN core

    const speed =
      status === 'thinking'
        ? 3.2
        : status === 'speaking'
        ? 2.5
        : status === 'listening'
        ? 1.8
        : 1.0;

    const amp = Math.max(0.05, Math.min(amplitude, 1.0));

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
          <style>
            * { margin: 0; padding: 0; overflow: hidden; background: transparent; }
            body { display: flex; justify-content: center; align-items: center; height: 100vh; width: 100vw; }
            canvas { width: 100%; height: 100%; }
          </style>
        </head>
        <body>
          <canvas id="c"></canvas>
          <script>
            const canvas = document.getElementById('c');
            const gl = canvas.getContext('webgl');
            if (!gl) { document.body.innerHTML = ''; }

            function resize() {
              canvas.width = window.innerWidth * window.devicePixelRatio;
              canvas.height = window.innerHeight * window.devicePixelRatio;
              gl.viewport(0, 0, canvas.width, canvas.height);
            }
            window.addEventListener('resize', resize);
            resize();

            const vs = \`
              attribute vec3 position;
              uniform float time;
              uniform float amp;
              varying float vDepth;
              void main() {
                vec3 p = position;
                float displacement = sin(p.x * 3.0 + time) * cos(p.y * 3.0 + time) * sin(p.z * 3.0 + time);
                p += normalize(p) * displacement * (0.14 + amp * 0.30);
                gl_Position = vec4(p * 0.5, 1.0);
                // NDC z: negative = near the camera, positive = on the far side.
                vDepth = gl_Position.z;
                // Fixed, modest point size. Scaling it by depth made the far
                // rim particles enormous, which (combined with additive
                // blending) saturated the whole orb into a white blob.
                gl_PointSize = 1.0 + amp * 2.0;
              }
            \`;

            const fs = \`
              precision mediump float;
              uniform vec3 uColor;
              varying float vDepth;
              void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float glow = 1.0 - (dist * 2.0);
                glow = pow(glow, 1.6);
                // Depth cue: particles on the far side are dimmer and less
                // white, so the sphere reads as a 3D mesh instead of a disc.
                float depthFade = mix(1.0, 0.35, clamp((vDepth + 0.7) / 1.4, 0.0, 1.0));
                vec3 finalCol = mix(uColor, vec3(1.0, 1.0, 1.0), glow * 0.30);
                // Low per-particle alpha is what keeps 1200 additive-blended
                // points from clipping to pure white at the dense rim.
                gl_FragColor = vec4(finalCol, glow * 0.14 * depthFade);
              }
            \`;

            function createShader(type, src) {
              const s = gl.createShader(type);
              gl.shaderSource(s, src);
              gl.compileShader(s);
              return s;
            }

            const prog = gl.createProgram();
            gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));
            gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));
            gl.linkProgram(prog);
            gl.useProgram(prog);

            // Generate Fibonacci sphere points
            const count = 1200;
            const points = [];
            const phi = Math.PI * (3.0 - Math.sqrt(5.0));
            for (let i = 0; i < count; i++) {
              const y = 1.0 - (i / (count - 1.0)) * 2.0;
              const radius = Math.sqrt(1.0 - y * y);
              const theta = phi * i;
              const x = Math.cos(theta) * radius;
              const z = Math.sin(theta) * radius;
              points.push(x, y, z);
            }

            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);

            const posLoc = gl.getAttribLocation(prog, 'position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

            const timeLoc = gl.getUniformLocation(prog, 'time');
            const ampLoc = gl.getUniformLocation(prog, 'amp');
            const colorLoc = gl.getUniformLocation(prog, 'uColor');

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

            let t = 0;
            const speed = ${speed};
            const targetAmp = ${amp};
            const col = [${rgbColor.join(', ')}];

            function render() {
              t += 0.02 * speed;
              gl.clearColor(0.0, 0.0, 0.0, 0.0);
              gl.clear(gl.COLOR_BUFFER_BIT);

              gl.uniform1f(timeLoc, t);
              gl.uniform1f(ampLoc, targetAmp);
              gl.uniform3fv(colorLoc, col);

              gl.drawArrays(gl.POINTS, 0, count);
              requestAnimationFrame(render);
            }
            render();
          </script>
        </body>
      </html>
    `;
  }, [status, amplitude]);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {Platform.OS === 'web' ? (
        // react-native-webview has no web implementation (renders the red
        // "does not support this platform" banner) — use a real iframe with
        // the exact same WebGL page instead.
        <iframe
          title="SEVEN Orb Shader"
          srcDoc={htmlContent}
          sandbox="allow-scripts"
          style={{ ...styles.webview, border: 'none' } as any}
        />
      ) : (
        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          style={styles.webview}
          scrollEnabled={false}
          pointerEvents="none"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  webview: {
    backgroundColor: 'transparent',
    width: '100%',
    height: '100%',
  },
});
