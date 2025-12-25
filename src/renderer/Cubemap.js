import { mat4 } from 'gl-matrix';
import { Utils } from '../utils/Utils.js';
import cubemapVertShader from '../shaders/cubemap.vert';
import cubemapFragShader from '../shaders/cubemap.frag';

export class CubeMap {
    constructor(gl) {
        this.gl = gl;
        this.textureIndex = 31;
        this.textureIBLDiffuseIndex = 30;
        this.texture = null;
        this.textureIBLDiffuse = null;

        this.uris = [
            '../textures/environment/px.jpg',
            '../textures/environment/nx.jpg',
            '../textures/environment/py.jpg',
            '../textures/environment/ny.jpg',
            '../textures/environment/pz.jpg',
            '../textures/environment/nz.jpg',
            '../textures/environment/diffuse/bakedDiffuse_01.jpg',
            '../textures/environment/diffuse/bakedDiffuse_02.jpg',
            '../textures/environment/diffuse/bakedDiffuse_03.jpg',
            '../textures/environment/diffuse/bakedDiffuse_04.jpg',
            '../textures/environment/diffuse/bakedDiffuse_05.jpg',
            '../textures/environment/diffuse/bakedDiffuse_06.jpg',
            '../textures/brdfLUT.png'
        ];

        this.images = null;
        this.finishLoadingCallback = null;

        this.init();
    }

    init() {
        const gl = this.gl;
        
        this.vertexData = new Float32Array([         
            -1.0,  1.0, -1.0,
            -1.0, -1.0, -1.0,
             1.0, -1.0, -1.0,
             1.0, -1.0, -1.0,
             1.0,  1.0, -1.0,
            -1.0,  1.0, -1.0,

            -1.0, -1.0,  1.0,
            -1.0, -1.0, -1.0,
            -1.0,  1.0, -1.0,
            -1.0,  1.0, -1.0,
            -1.0,  1.0,  1.0,
            -1.0, -1.0,  1.0,

             1.0, -1.0, -1.0,
             1.0, -1.0,  1.0,
             1.0,  1.0,  1.0,
             1.0,  1.0,  1.0,
             1.0,  1.0, -1.0,
             1.0, -1.0, -1.0,

            -1.0, -1.0,  1.0,
            -1.0,  1.0,  1.0,
             1.0,  1.0,  1.0,
             1.0,  1.0,  1.0,
             1.0, -1.0,  1.0,
            -1.0, -1.0,  1.0,

            -1.0,  1.0, -1.0,
             1.0,  1.0, -1.0,
             1.0,  1.0,  1.0,
             1.0,  1.0,  1.0,
            -1.0,  1.0,  1.0,
            -1.0,  1.0, -1.0,

            -1.0, -1.0, -1.0,
            -1.0, -1.0,  1.0,
             1.0, -1.0, -1.0,
             1.0, -1.0, -1.0,
            -1.0, -1.0,  1.0,
             1.0, -1.0,  1.0
        ]);

        this.vertexArray = gl.createVertexArray();
        this.vertexBuffer = gl.createBuffer();
        this.program = Utils.createProgram(gl, cubemapVertShader, cubemapFragShader);
        
        this.positionLocation = 0;
        this.uniformMvpLocation = gl.getUniformLocation(this.program, "u_MVP");
        this.uniformEnvironmentLocation = gl.getUniformLocation(this.program, "u_environment");

        gl.bindVertexArray(this.vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.STATIC_DRAW);
        gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.bindVertexArray(null);
    }

    loadAll() {
        Utils.loadImages(this.uris, this.onloadAll.bind(this));
    }

    onloadAll(imgs) {
        const gl = this.gl;
        this.images = imgs;
        console.log('All cube maps loaded');

        // Create main cubemap
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        for (let i = 0; i < 6; i++) {
            gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
                0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
                this.images[i]
            );
        }
        gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

        // Create IBL diffuse cubemap
        this.textureIBLDiffuse = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.textureIBLDiffuse);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        for (let i = 0; i < 6; i++) {
            gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
                0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
                this.images[i + 6]
            );
        }
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

        if (this.finishLoadingCallback) {
            this.finishLoadingCallback();
        }
    }

    draw(V, P) {
        const gl = this.gl;
        const MVP = mat4.create();
        
        mat4.copy(MVP, V);
        MVP[12] = 0.0;
        MVP[13] = 0.0;
        MVP[14] = 0.0;
        MVP[15] = 1.0;
        mat4.mul(MVP, P, MVP);

        gl.useProgram(this.program);
        gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
        gl.uniformMatrix4fv(this.uniformMvpLocation, false, MVP);
        gl.uniform1i(this.uniformEnvironmentLocation, this.textureIndex);
        gl.bindVertexArray(this.vertexArray);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
        gl.bindVertexArray(null);
    }
}