import * as vm from 'vm';
import { buildGideonHeadScene } from '../src/core/gideonHeadScene';

/**
 * These tests exist because the scene failed silently, three times, in ways
 * neither TypeScript nor the app could report:
 *   1. a newline escape written with a single backslash in the enclosing
 *      template literal became a REAL newline inside the page's JS, so the
 *      whole script failed to parse and nothing rendered, logged or fell back;
 *   2. the derivatives extension was wrapped in #ifdef, which never enables it,
 *      so dFdx/dFdy failed to compile;
 *   3. the depth mapping grew the wrong way, so the smooth back of the skull
 *      won the depth test and hid the sculpted face.
 */
const html = buildGideonHeadScene();
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? '';

describe('Gideon head scene', () => {
  it('generates a self-contained page with an inline script', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<canvas id="c">');
    expect(script.length).toBeGreaterThan(1000);
  });

  it('parses as valid JavaScript', () => {
    expect(() => new vm.Script(script, { filename: 'scene.js' })).not.toThrow();
  });

  it('renders something and reports readiness', () => {
    expect(script).toContain("post({ type: 'ready' })");
    expect(script).toContain('drawElements');
    expect(script).toContain('requestAnimationFrame(frame)');
  });

  it('enables the derivatives extension unconditionally', () => {
    expect(html).not.toMatch(/#ifdef\s+GL_OES_standard_derivatives/);
    expect(html).toContain('#extension GL_OES_standard_derivatives : enable');
  });

  it('maps depth so nearer surfaces win the depth test', () => {
    expect(script).toContain('float depth = -vp.z;');
    // Clip z must be handed over as (ndc.z * depth) so the hardware divides
    // exactly once and farther fragments never land in front of the face.
    expect(script).toContain('gl_Position = vec4(screen * depth, zNdc * depth, depth);');
  });

  it('keeps the hologram scanlines coarse', () => {
    // A dense grid (tens of cycles per unit) aliases into moire noise that
    // hides the very anatomy it is drawn over.
    expect(script).not.toMatch(/sin\(vPos\.y \* 2\d\d\.0\)/);
  });

  it('frames the head from its own bounding box and self-calibrates', () => {
    expect(script).toContain('HEAD_BOX');
    expect(script).toContain('calibrateFraming()');
    expect(script).toContain('readPixels');
  });
});
