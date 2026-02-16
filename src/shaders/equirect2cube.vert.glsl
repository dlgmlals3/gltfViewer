#version 300 es
in vec3 a_position;
out vec3 v_position;

uniform mat4 u_viewProjection;

void main() {
    v_position = a_position;
    gl_Position = u_viewProjection * vec4(a_position, 1.0);
}
