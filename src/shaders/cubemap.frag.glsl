#version 300 es
precision highp float;
precision highp int;

uniform samplerCube u_environment;

in vec3 texcoord;

out vec4 color;

void main()
{
    // 큐브맵 텍스처를 샘플링해서 직접 출력
    color = texture(u_environment, texcoord);
}
