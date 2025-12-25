import { Utils } from '../utils/Utils.js';
import pbrVertShader from '../shaders/pbr.vert';
import pbrFragShader from '../shaders/pbr.frag';

export class Shader {
    constructor() {
        this.flags = 0;
        this.programObject = null;
    }

    static bitMasks = {
        HAS_SKIN: 1,
        SKIN_VEC8: 2,
        HAS_BASECOLORMAP: 4,
        HAS_NORMALMAP: 8,
        HAS_METALROUGHNESSMAP: 16,
        HAS_OCCLUSIONMAP: 32,
        HAS_EMISSIVEMAP: 64
    };

    static shaderVersionLine = '#version 300 es\n';
    static vsMasterCode = pbrVertShader;
    static fsMasterCode = pbrFragShader;
    static programObjects = {};

    hasSkin() {
        return this.flags & Shader.bitMasks.HAS_SKIN;
    }

    hasBaseColorMap() {
        return this.flags & Shader.bitMasks.HAS_BASECOLORMAP;
    }

    hasNormalMap() {
        return this.flags & Shader.bitMasks.HAS_NORMALMAP;
    }

    hasMetalRoughnessMap() {
        return this.flags & Shader.bitMasks.HAS_METALROUGHNESSMAP;
    }

    hasOcclusionMap() {
        return this.flags & Shader.bitMasks.HAS_OCCLUSIONMAP;
    }

    hasEmissiveMap() {
        return this.flags & Shader.bitMasks.HAS_EMISSIVEMAP;
    }

    defineMacro(macro) {
        if (Shader.bitMasks[macro] !== undefined) {
            this.flags = Shader.bitMasks[macro] | this.flags;
        } else {
            console.log('WARNING: ' + macro + ' is not a valid macro');
        }
    }

    compile(gl) {
        const existingProgramObject = Shader.programObjects[this.flags];
        if (existingProgramObject) {
            this.programObject = existingProgramObject;
            return;
        }

        let vsDefine = '';
        let fsDefine = '';

        if (this.flags & Shader.bitMasks.HAS_SKIN) {
            vsDefine += '#define HAS_SKIN\n';
        }
        if (this.flags & Shader.bitMasks.SKIN_VEC8) {
            vsDefine += '#define SKIN_VEC8\n';
        }
        if (this.flags & Shader.bitMasks.HAS_BASECOLORMAP) {
            fsDefine += '#define HAS_BASECOLORMAP\n';
        }
        if (this.flags & Shader.bitMasks.HAS_NORMALMAP) {
            fsDefine += '#define HAS_NORMALMAP\n';
        }
        if (this.flags & Shader.bitMasks.HAS_METALROUGHNESSMAP) {
            fsDefine += '#define HAS_METALROUGHNESSMAP\n';
        }
        if (this.flags & Shader.bitMasks.HAS_OCCLUSIONMAP) {
            fsDefine += '#define HAS_OCCLUSIONMAP\n';
        }
        if (this.flags & Shader.bitMasks.HAS_EMISSIVEMAP) {
            fsDefine += '#define HAS_EMISSIVEMAP\n';
        }

        const vertexShaderSource = 
            Shader.shaderVersionLine + vsDefine + Shader.vsMasterCode;
        
        const fragmentShaderSource = 
            Shader.shaderVersionLine + fsDefine + Shader.fsMasterCode;

        const program = Utils.createProgram(gl, vertexShaderSource, fragmentShaderSource);
        
        this.programObject = {
            program: program,
            uniformLocations: {},
            uniformBlockIndices: {}
        };

        if (this.flags & Shader.bitMasks.HAS_SKIN) {
            this.programObject.uniformBlockIndices.JointMatrix = 
                gl.getUniformBlockIndex(program, "JointMatrix");
        }

        const us = this.programObject.uniformLocations;
        us.MVP = gl.getUniformLocation(program, 'u_MVP');
        us.MVNormal = gl.getUniformLocation(program, 'u_MVNormal');
        us.MV = gl.getUniformLocation(program, 'u_MV');
        us.baseColorFactor = gl.getUniformLocation(program, 'u_baseColorFactor');
        us.metallicFactor = gl.getUniformLocation(program, 'u_metallicFactor');
        us.roughnessFactor = gl.getUniformLocation(program, 'u_roughnessFactor');

        if (this.flags & Shader.bitMasks.HAS_BASECOLORMAP) {
            us.baseColorTexture = gl.getUniformLocation(program, 'u_baseColorTexture');
        }
        if (this.flags & Shader.bitMasks.HAS_NORMALMAP) {
            us.normalTexture = gl.getUniformLocation(program, 'u_normalTexture');
            us.normalTextureScale = gl.getUniformLocation(program, 'u_normalTextureScale');
        }
        if (this.flags & Shader.bitMasks.HAS_METALROUGHNESSMAP) {
            us.metallicRoughnessTexture = gl.getUniformLocation(program, 'u_metallicRoughnessTexture');
        }
        if (this.flags & Shader.bitMasks.HAS_OCCLUSIONMAP) {
            us.occlusionTexture = gl.getUniformLocation(program, 'u_occlusionTexture');
            us.occlusionStrength = gl.getUniformLocation(program, 'u_occlusionStrength');
        }
        if (this.flags & Shader.bitMasks.HAS_EMISSIVEMAP) {
            us.emissiveTexture = gl.getUniformLocation(program, 'u_emissiveTexture');
            us.emissiveFactor = gl.getUniformLocation(program, 'u_emissiveFactor');
        }

        us.diffuseEnvSampler = gl.getUniformLocation(program, 'u_DiffuseEnvSampler');
        us.specularEnvSampler = gl.getUniformLocation(program, 'u_SpecularEnvSampler');
        us.brdfLUT = gl.getUniformLocation(program, 'u_brdfLUT');

        Shader.programObjects[this.flags] = this.programObject;
    }
}