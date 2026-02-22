#version 300 es
precision highp float;

in vec3 v_position;
out vec4 fragColor;

uniform sampler2D u_equirectangularMap;
uniform float u_forceUse; // GLSL optimizer가 uniform을 제거하지 않도록 force

const vec2 invAtan = vec2(0.1591, 0.3183);

vec2 sampleSphericalMap(vec3 v) {
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
    uv *= invAtan;
    uv += 0.5;
    uv.y = 1.0 - uv.y;
    return uv;
}

void main() {
    vec3 normal = normalize(v_position);
    vec2 uv = sampleSphericalMap(normal);
    vec3 color = texture(u_equirectangularMap, uv).rgb;
    color = color * (0.5 + 0.5); 
    fragColor = vec4(color, 1.0);
}
