import { mat4 } from 'gl-matrix';
import { Utils } from '../utils/Utils.js';
import bboxVertShader from '../shaders/bbox.vert';
import bboxFragShader from '../shaders/bbox.frag';

export class BoundingBox {
    constructor(gl) {
        this.gl = gl;
        
        this.vertexData = new Float32Array([
            0.0, 0.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 1.0,

            0.0, 1.0, 1.0,
            1.0, 1.0, 1.0,
            0.0, 1.0, 1.0,
            0.0, 1.0, 0.0,
            0.0, 1.0, 1.0,
            0.0, 0.0, 1.0,

            1.0, 1.0, 0.0,
            1.0, 1.0, 1.0,
            1.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            1.0, 1.0, 0.0,
            1.0, 0.0, 0.0,

            1.0, 0.0, 1.0,
            1.0, 0.0, 0.0,
            1.0, 0.0, 1.0,
            1.0, 1.0, 1.0,
            1.0, 0.0, 1.0,
            0.0, 0.0, 1.0
        ]);

        this.init();
    }

    init() {
        const gl = this.gl;
        
        this.vertexArray = gl.createVertexArray();
        this.vertexBuffer = gl.createBuffer();
        this.program = Utils.createProgram(gl, bboxVertShader, bboxFragShader);
        
        this.positionLocation = 0;
        this.uniformMvpLocation = gl.getUniformLocation(this.program, "u_MVP");

        gl.bindVertexArray(this.vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.STATIC_DRAW);
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.bindVertexArray(null);
    }

    draw(bbox, nodeTransform, V, P) {
        const gl = this.gl;
        const MVP = mat4.create();
        
        mat4.mul(MVP, nodeTransform, bbox.transform);
        mat4.mul(MVP, V, MVP);
        mat4.mul(MVP, P, MVP);

        gl.uniformMatrix4fv(this.uniformMvpLocation, false, MVP);
        gl.drawArrays(gl.LINES, 0, 24);
    }
}