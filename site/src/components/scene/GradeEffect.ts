/* Parametric film grade — the per-act "LUT". Temperature, saturation, and a
   filmic shadow lift, crossfaded by the Director as the camera moves between
   acts. Runs pre-tonemap so the AgX curve shapes the graded image. */

import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const frag = /* glsl */ `
  uniform float uTemp;
  uniform float uSat;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = inputColor.rgb;

    // white-balance shift along the warm-cool axis
    c.r *= 1.0 + uTemp * 0.11;
    c.g *= 1.0 + uTemp * 0.02;
    c.b *= 1.0 - uTemp * 0.12;

    // filmic milk: a whisper of cool lift in only the deepest blacks
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float shadow = 1.0 - smoothstep(0.0, 0.10, luma);
    c += shadow * vec3(0.0022, 0.0026, 0.0038);

    // saturation
    luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(luma), c, uSat);

    outputColor = vec4(c, inputColor.a);
  }
`;

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', frag, {
      uniforms: new Map<string, Uniform>([
        ['uTemp', new Uniform(0.14)],
        ['uSat', new Uniform(1.0)],
      ]),
    });
  }

  set temp(v: number) {
    this.uniforms.get('uTemp')!.value = v;
  }

  set sat(v: number) {
    this.uniforms.get('uSat')!.value = v;
  }
}
