#version 300 es
#define FRAG_COLOR_LOCATION 0

precision highp float;
precision highp int;

uniform sampler2D u_Texture;
in vec2 vUV;

out vec4 color;

void main()
{
    color = texture(u_Texture, vUV);
    //color = vec4(1.0, 0.0, 0.0, 1.0);
}
