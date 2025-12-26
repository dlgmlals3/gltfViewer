#version 300 es
#define POSITION_LOCATION 0

precision highp float;
precision highp int;

layout(location = 0) in vec2 position;
out vec2 vUV;

void main()
{
    vUV = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
