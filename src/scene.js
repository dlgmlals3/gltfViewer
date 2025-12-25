/**
 * resources: bbox/cubemap/brdfLut/defaultSampler + setupScene 함수 포함
 * - Utils / Shaders / MinimalGLTFLoader는 기존 글로벌로 있다고 가정
 */
function createSceneResources(gl) {
  // ---------- Default sampler ----------
  const defaultSampler = gl.createSampler();
  gl.samplerParameteri(defaultSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  gl.samplerParameteri(defaultSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.samplerParameteri(defaultSampler, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.samplerParameteri(defaultSampler, gl.TEXTURE_WRAP_T, gl.REPEAT);

  // ---------- BBOX ----------
  const bbox = createBoundingBox(gl);

  // ---------- BRDF LUT ----------
  const brdfLut = {
    texture: null,
    textureIndex: 29,
    createTexture(img) {
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, gl.RG, gl.FLOAT, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
  };

  // ---------- CubeMap ----------
  const cubemap = createCubeMap(gl, brdfLut);

  // ---------- Shader system (원래 코드의 Shader_Static/Shader) ----------
  const Shader_Static = {
    shaderVersionLine: "#version 300 es\n",
    bitMasks: {
      HAS_SKIN: 1,
      SKIN_VEC8: 2,
      HAS_BASECOLORMAP: 4,
      HAS_NORMALMAP: 8,
      HAS_METALROUGHNESSMAP: 16,
      HAS_OCCLUSIONMAP: 32,
      HAS_EMISSIVEMAP: 64,
    },
    vsMasterCode: Shaders.pbrVert,
    fsMasterCode: Shaders.pbrFrag,
    programObjects: {},
  };

  function Shader() {
    this.flags = 0;
    this.programObject = null;
  }

  Shader.prototype.defineMacro = function (macro) {
    if (Shader_Static.bitMasks[macro] !== undefined) {
      this.flags = Shader_Static.bitMasks[macro] | this.flags;
    } else {
      console.log("WARNING: invalid macro " + macro);
    }
  };

  Shader.prototype.hasSkin = function () { return this.flags & Shader_Static.bitMasks.HAS_SKIN; };
  Shader.prototype.hasBaseColorMap = function () { return this.flags & Shader_Static.bitMasks.HAS_BASECOLORMAP; };
  Shader.prototype.hasNormalMap = function () { return this.flags & Shader_Static.bitMasks.HAS_NORMALMAP; };
  Shader.prototype.hasMetalRoughnessMap = function () { return this.flags & Shader_Static.bitMasks.HAS_METALROUGHNESSMAP; };
  Shader.prototype.hasOcclusionMap = function () { return this.flags & Shader_Static.bitMasks.HAS_OCCLUSIONMAP; };
  Shader.prototype.hasEmissiveMap = function () { return this.flags & Shader_Static.bitMasks.HAS_EMISSIVEMAP; };

  Shader.prototype.compile = function () {
    const existing = Shader_Static.programObjects[this.flags];
    if (existing) {
      this.programObject = existing;
      return;
    }

    let vsDefine = "";
    let fsDefine = "";

    if (this.flags & Shader_Static.bitMasks.HAS_SKIN) vsDefine += "#define HAS_SKIN\n";
    if (this.flags & Shader_Static.bitMasks.SKIN_VEC8) vsDefine += "#define SKIN_VEC8\n";

    if (this.flags & Shader_Static.bitMasks.HAS_BASECOLORMAP) fsDefine += "#define HAS_BASECOLORMAP\n";
    if (this.flags & Shader_Static.bitMasks.HAS_NORMALMAP) fsDefine += "#define HAS_NORMALMAP\n";
    if (this.flags & Shader_Static.bitMasks.HAS_METALROUGHNESSMAP) fsDefine += "#define HAS_METALROUGHNESSMAP\n";
    if (this.flags & Shader_Static.bitMasks.HAS_OCCLUSIONMAP) fsDefine += "#define HAS_OCCLUSIONMAP\n";
    if (this.flags & Shader_Static.bitMasks.HAS_EMISSIVEMAP) fsDefine += "#define HAS_EMISSIVEMAP\n";

    const vertexShaderSource = Shader_Static.shaderVersionLine + vsDefine + Shader_Static.vsMasterCode;
    const fragmentShaderSource = Shader_Static.shaderVersionLine + fsDefine + Shader_Static.fsMasterCode;

    const program = Utils.createProgram(gl, vertexShaderSource, fragmentShaderSource);

    const programObject = {
      program,
      uniformLocations: {},
      uniformBlockIndices: {},
    };

    if (this.flags & Shader_Static.bitMasks.HAS_SKIN) {
      programObject.uniformBlockIndices.JointMatrix = gl.getUniformBlockIndex(program, "JointMatrix");
    }

    const us = programObject.uniformLocations;
    us.MVP = gl.getUniformLocation(program, "u_MVP");
    us.MVNormal = gl.getUniformLocation(program, "u_MVNormal");
    us.MV = gl.getUniformLocation(program, "u_MV");
    us.baseColorFactor = gl.getUniformLocation(program, "u_baseColorFactor");
    us.metallicFactor = gl.getUniformLocation(program, "u_metallicFactor");
    us.roughnessFactor = gl.getUniformLocation(program, "u_roughnessFactor");

    if (this.flags & Shader_Static.bitMasks.HAS_BASECOLORMAP) us.baseColorTexture = gl.getUniformLocation(program, "u_baseColorTexture");
    if (this.flags & Shader_Static.bitMasks.HAS_NORMALMAP) {
      us.normalTexture = gl.getUniformLocation(program, "u_normalTexture");
      us.normalTextureScale = gl.getUniformLocation(program, "u_normalTextureScale");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_METALROUGHNESSMAP) us.metallicRoughnessTexture = gl.getUniformLocation(program, "u_metallicRoughnessTexture");
    if (this.flags & Shader_Static.bitMasks.HAS_OCCLUSIONMAP) {
      us.occlusionTexture = gl.getUniformLocation(program, "u_occlusionTexture");
      us.occlusionStrength = gl.getUniformLocation(program, "u_occlusionStrength");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_EMISSIVEMAP) {
      us.emissiveTexture = gl.getUniformLocation(program, "u_emissiveTexture");
      us.emissiveFactor = gl.getUniformLocation(program, "u_emissiveFactor");
    }

    us.diffuseEnvSampler = gl.getUniformLocation(program, "u_DiffuseEnvSampler");
    us.specularEnvSampler = gl.getUniformLocation(program, "u_SpecularEnvSampler");
    us.brdfLUT = gl.getUniformLocation(program, "u_brdfLUT");

    // static samplers
    gl.useProgram(program);
    gl.uniform1i(us.brdfLUT, brdfLut.textureIndex);
    gl.uniform1i(us.specularEnvSampler, cubemap.textureIndex);
    gl.uniform1i(us.diffuseEnvSampler, cubemap.textureIBLDiffuseIndex);
    gl.useProgram(null);

    Shader_Static.programObjects[this.flags] = programObject;
    this.programObject = programObject;
  };

  // ---------- SceneRuntime ----------
  function SceneRuntime(glTFScene, glTF, id) {
    this.glTFScene = glTFScene;
    this.glTF = glTF;
    this.id = id;

    this.rootTransform = mat4.create();
    this.nodeMatrix = new Array(glTF.nodes.length);
    for (let i = 0; i < this.nodeMatrix.length; i++) this.nodeMatrix[i] = mat4.create();
  }

  // ---------- setupScene (원래 setupScene의 핵심만 유지) ----------
  function setupScene(gl, glTF, scenes, opts) {
    const replaceScene = opts?.replaceScene || null;
    const curGltfScene = glTF.scenes[glTF.defaultScene];

    let runtimeScene;
    if (!replaceScene) {
      runtimeScene = new SceneRuntime(curGltfScene, glTF, scenes.length);
      scenes.push(runtimeScene);
    } else {
      runtimeScene = scenes[replaceScene.id] = new SceneRuntime(curGltfScene, glTF, replaceScene.id);
    }

    // first model camera fit (너 코드 로직 유지)
    if (scenes.length === 1 && opts?.modelMatrix && opts?.translate && opts?.setScale) {
      mat4.identity(opts.modelMatrix);

      let scale = 1.0 / Math.max(
        curGltfScene.boundingBox.transform[0],
        Math.max(curGltfScene.boundingBox.transform[5], curGltfScene.boundingBox.transform[10])
      );

      const t = opts.translate;
      mat4.getTranslation(t, curGltfScene.boundingBox.transform);
      vec3.scale(t, t, -1);
      t[0] += -0.5 * curGltfScene.boundingBox.transform[0];
      t[1] += -0.5 * curGltfScene.boundingBox.transform[5];
      t[2] += -0.5 * curGltfScene.boundingBox.transform[10];

      scale *= 0.5;

      opts.modelMatrix[0] = scale;
      opts.modelMatrix[5] = scale;
      opts.modelMatrix[10] = scale;
      mat4.translate(opts.modelMatrix, opts.modelMatrix, t);

      vec3.set(t, 0, 0, -1.5);
      opts.setScale(1);
    }

    // buffers
    for (const bv of glTF.bufferViews) {
      bv.createBuffer(gl);
      bv.bindData(gl);
    }

    // textures
    if (glTF.textures) for (const tex of glTF.textures) tex.createTexture(gl);

    // samplers
    if (glTF.samplers) for (const s of glTF.samplers) s.createSampler(gl);

    // skins UBO
    if (glTF.skins) {
      for (const skin of glTF.skins) {
        skin.jointMatrixUniformBuffer = gl.createBuffer();
        gl.bindBufferBase(gl.UNIFORM_BUFFER, skin.uniformBlockID, skin.jointMatrixUniformBuffer);
        gl.bindBuffer(gl.UNIFORM_BUFFER, skin.jointMatrixUniformBuffer);
        gl.bufferData(gl.UNIFORM_BUFFER, skin.jointMatrixUnidormBufferData, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, skin.jointMatrixUnidormBufferData);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);
      }
    }

    // VAO + shader flags
    const POSITION_LOCATION = 0;
    const NORMAL_LOCATION = 1;
    const TEXCOORD_0_LOCATION = 2;
    const JOINTS_0_LOCATION = 3;
    const WEIGHTS_0_LOCATION = 4;
    const JOINTS_1_LOCATION = 5;
    const WEIGHTS_1_LOCATION = 6;

    function setupAttribute(accessorOrNull, location) {
      if (accessorOrNull === undefined) return false;
      const accessor = accessorOrNull;
      const bufferView = accessor.bufferView;

      if (bufferView.target === null) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferView.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, bufferView.data, gl.STATIC_DRAW);
      } else {
        gl.bindBuffer(bufferView.target, bufferView.buffer);
      }

      accessor.prepareVertexAttrib(location, gl);
      return true;
    }

    for (const mesh of glTF.meshes) {
      for (const prim of mesh.primitives) {
        prim.shader = new Shader();

        prim.vertexArray = gl.createVertexArray();
        gl.bindVertexArray(prim.vertexArray);

        setupAttribute(prim.attributes.POSITION, POSITION_LOCATION);
        setupAttribute(prim.attributes.NORMAL, NORMAL_LOCATION);
        setupAttribute(prim.attributes.TEXCOORD_0, TEXCOORD_0_LOCATION);

        if (setupAttribute(prim.attributes.JOINTS_0, JOINTS_0_LOCATION) &&
            setupAttribute(prim.attributes.WEIGHTS_0, WEIGHTS_0_LOCATION)) {
          prim.shader.defineMacro("HAS_SKIN");
        }

        if (setupAttribute(prim.attributes.JOINTS_1, JOINTS_1_LOCATION) &&
            setupAttribute(prim.attributes.WEIGHTS_1, WEIGHTS_1_LOCATION)) {
          prim.shader.defineMacro("SKIN_VEC8");
        }

        if (prim.indices !== null) {
          const accessor = glTF.accessors[prim.indices];
          const bufferView = accessor.bufferView;
          if (bufferView.target === null) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferView.buffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bufferView.data, gl.STATIC_DRAW);
          } else {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferView.buffer);
          }
        }

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // material flags
        const material = prim.material;
        if (material) {
          const pbr = material.pbrMetallicRoughness;
          if (pbr?.baseColorTexture) prim.shader.defineMacro("HAS_BASECOLORMAP");
          if (pbr?.metallicRoughnessTexture) prim.shader.defineMacro("HAS_METALROUGHNESSMAP");
          if (material.normalTexture) prim.shader.defineMacro("HAS_NORMALMAP");
          if (material.occlusionTexture) prim.shader.defineMacro("HAS_OCCLUSIONMAP");
          if (material.emissiveTexture) prim.shader.defineMacro("HAS_EMISSIVEMAP");
        }

        prim.shader.compile();
      }
    }

    return runtimeScene;
  }

  return {
    defaultSampler,
    bbox,
    brdfLut,
    cubemap,
    setupScene,
  };
}

// ------- Helpers: bbox / cubemap -------

function createBoundingBox(gl) {
  const obj = {
    vertexData: new Float32Array([
      0,0,0,  1,0,0,  0,0,0,  0,1,0,  0,0,0,  0,0,1,
      0,1,1,  1,1,1,  0,1,1,  0,1,0,  0,1,1,  0,0,1,
      1,1,0,  1,1,1,  1,1,0,  0,1,0,  1,1,0,  1,0,0,
      1,0,1,  1,0,0,  1,0,1,  1,1,1,  1,0,1,  0,0,1
    ]),
    vertexArray: gl.createVertexArray(),
    vertexBuffer: gl.createBuffer(),
    program: Utils.createProgram(gl, Shaders.bboxVert, Shaders.bboxFrag),
    positionLocation: 0,
    uniformMvpLocation: null,
  };

  obj.uniformMvpLocation = gl.getUniformLocation(obj.program, "u_MVP");

  gl.bindVertexArray(obj.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, obj.vertexData, gl.STATIC_DRAW);
  gl.vertexAttribPointer(obj.positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(obj.positionLocation);
  gl.bindVertexArray(null);

  return obj;
}

function createCubeMap(gl, brdfLut) {
  const cubemap = {
    textureIndex: 31,
    texture: null,

    textureIBLDiffuseIndex: 30,
    textureIBLDiffuse: null,

    uris: [
      "../textures/environment/px.jpg",
      "../textures/environment/nx.jpg",
      "../textures/environment/py.jpg",
      "../textures/environment/ny.jpg",
      "../textures/environment/pz.jpg",
      "../textures/environment/nz.jpg",

      "../textures/environment/diffuse/bakedDiffuse_01.jpg",
      "../textures/environment/diffuse/bakedDiffuse_02.jpg",
      "../textures/environment/diffuse/bakedDiffuse_03.jpg",
      "../textures/environment/diffuse/bakedDiffuse_04.jpg",
      "../textures/environment/diffuse/bakedDiffuse_05.jpg",
      "../textures/environment/diffuse/bakedDiffuse_06.jpg",

      "../textures/brdfLUT.png",
    ],
    images: null,

    vertexData: new Float32Array([
      -1,  1, -1,  -1, -1, -1,   1, -1, -1,   1, -1, -1,   1,  1, -1,  -1,  1, -1,
      -1, -1,  1,  -1, -1, -1,  -1,  1, -1,  -1,  1, -1,  -1,  1,  1,  -1, -1,  1,
       1, -1, -1,   1, -1,  1,   1,  1,  1,   1,  1,  1,   1,  1, -1,   1, -1, -1,
      -1, -1,  1,  -1,  1,  1,   1,  1,  1,   1,  1,  1,   1, -1,  1,  -1, -1,  1,
      -1,  1, -1,   1,  1, -1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1,  1, -1,
      -1, -1, -1,  -1, -1,  1,   1, -1, -1,   1, -1, -1,  -1, -1,  1,   1, -1,  1,
    ]),
    vertexArray: gl.createVertexArray(),
    vertexBuffer: gl.createBuffer(),
    program: Utils.createProgram(gl, Shaders.cubemapVert, Shaders.cubemapFrag),
    positionLocation: 0,
    uniformMvpLocation: null,
    uniformEnvironmentLocation: null,

    finishLoadingCallback: null,

    loadAll() {
      Utils.loadImages(this.uris, this.onloadAll.bind(this));
    },

    onloadAll(imgs) {
      this.images = imgs;

      // specular cube
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

      for (let i = 0; i < 6; i++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.images[i]);
      }
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

      // diffuse cube
      this.textureIBLDiffuse = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.textureIBLDiffuse);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

      for (let i = 0; i < 6; i++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.images[i + 6]);
      }
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

      // brdf lut (last)
      brdfLut.createTexture(this.images[this.images.length - 1]);

      if (this.finishLoadingCallback) this.finishLoadingCallback();
    },

    draw(V, P) {
      // MVP = P * (V without translation)
      const MVP = mat4.create();
      mat4.copy(MVP, V);
      MVP[12] = MVP[13] = MVP[14] = 0.0;
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
    },
  };

  cubemap.uniformMvpLocation = gl.getUniformLocation(cubemap.program, "u_MVP");
  cubemap.uniformEnvironmentLocation = gl.getUniformLocation(cubemap.program, "u_environment");

  gl.bindVertexArray(cubemap.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubemap.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubemap.vertexData, gl.STATIC_DRAW);
  gl.vertexAttribPointer(cubemap.positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(cubemap.positionLocation);
  gl.bindVertexArray(null);

  return cubemap;
}
