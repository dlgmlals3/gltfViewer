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

  // ---------- QUAD ----------
  const quadScreen = createFullscreenQuad(gl);

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
  // dlgmlals3
  //const cubemap = createCubeMap(gl, brdfLut);
  const cubemap = createCubeMapForHdr(gl, brdfLut);

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
      HAS_TRANSMISSION: 128,
      HAS_TRANSMISSION_TEXTURE: 256,
      HAS_ANISOTROPY: 512,
      HAS_ANISOTROPY_TEXTURE: 1024,
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
  Shader.prototype.hasTransmission = function () { return this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION; };
  Shader.prototype.hasTransmissionTexture = function () { return this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION_TEXTURE; };
  Shader.prototype.hasAnisotropy = function () { return this.flags & Shader_Static.bitMasks.HAS_ANISOTROPY; };
  Shader.prototype.hasAnisotropyTexture = function () { return this.flags & Shader_Static.bitMasks.HAS_ANISOTROPY_TEXTURE; };
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
    if (this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION) fsDefine += "#define HAS_TRANSMISSION\n";
    if (this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION_TEXTURE) fsDefine += "#define HAS_TRANSMISSION_TEXTURE\n";

    if (this.flags & Shader_Static.bitMasks.HAS_ANISOTROPY) fsDefine += "#define HAS_ANISOTROPY\n";
    if (this.flags & Shader_Static.bitMasks.HAS_TEXTURE_ANISOTROPY) fsDefine += "#define HAS_TEXTURE_ANISOTROPY\n";
    

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
    us.Model = gl.getUniformLocation(program, "u_Model");

    us.baseColorFactor = gl.getUniformLocation(program, "u_baseColorFactor");
    us.metallicFactor = gl.getUniformLocation(program, "u_metallicFactor");
    us.roughnessFactor = gl.getUniformLocation(program, "u_roughnessFactor");

    if (this.flags & Shader_Static.bitMasks.HAS_BASECOLORMAP) {
      us.baseColorTexture = gl.getUniformLocation(program, "u_baseColorTexture");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_NORMALMAP) {
      us.normalTexture = gl.getUniformLocation(program, "u_normalTexture");
      us.normalTextureScale = gl.getUniformLocation(program, "u_normalTextureScale");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_METALROUGHNESSMAP) {
      us.metallicRoughnessTexture = gl.getUniformLocation(program, "u_metallicRoughnessTexture");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_OCCLUSIONMAP) {
      us.occlusionTexture = gl.getUniformLocation(program, "u_occlusionTexture");
      us.occlusionStrength = gl.getUniformLocation(program, "u_occlusionStrength");
    }
    if (this.flags & Shader_Static.bitMasks.HAS_EMISSIVEMAP) {
      us.emissiveTexture = gl.getUniformLocation(program, "u_emissiveTexture");
      us.emissiveFactor = gl.getUniformLocation(program, "u_emissiveFactor");
    }

    if (this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION) {
      us.transmissionFramebuffer = gl.getUniformLocation(program, "u_transmissionFramebuffer");
      us.transmissionFactor = gl.getUniformLocation(program, "u_transmissionFactor");
      us.viewportSize = gl.getUniformLocation(program, "u_viewportSize");
      us.ViewMatrix = gl.getUniformLocation(program, "u_ViewMatrix");
      us.ProjectionMatrix = gl.getUniformLocation(program, "u_ProjectionMatrix");
      us.ModelMatrix = gl.getUniformLocation(program, "u_ModelMatrix");     
    }

    if (this.flags & Shader_Static.bitMasks.HAS_TRANSMISSION_TEXTURE) {
      us.transmissionTexture = gl.getUniformLocation(program, "u_transmissionTexture");      
    }
    
    if (this.flags & Shader_Static.bitMasks.HAS_ANISOTROPY) {      
      us.anisotropyStrength = gl.getUniformLocation(program, "u_anisotropyStrength");
    }

    if (this.flags & Shader_Static.bitMasks.HAS_ANISOTROPY_TEXTURE) {
      us.anisotropyTexture = gl.getUniformLocation(program, "u_anisotropyTexture");
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
          if (material.extensions?.KHR_materials_transmission) prim.shader.defineMacro("HAS_TRANSMISSION"); 
          if (material.extensions?.KHR_materials_transmission?.transmissionTexture) prim.shader.defineMacro("HAS_TRANSMISSION_TEXTURE");
          if (material.extensions?.KHR_materials_anisotropy) {            
            prim.shader.defineMacro("HAS_ANISOTROPY"); 
          }
          if (material.extensions?.KHR_materials_transmission?.transmissionTexture) prim.shader.defineMacro("HAS_ANISOTROPY_TEXTURE");
        }
        prim.shader.compile();
      }
    }

    return runtimeScene;
  }

  return {
    defaultSampler,
    quadScreen,
    bbox,
    brdfLut,
    cubemap,
    setupScene,
  };
}

function createFullscreenQuad(gl) {
  const obj = {
    vertexData: new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1
    ]),
    vertexArray: gl.createVertexArray(),
    vertexBuffer: gl.createBuffer(),
    program: Utils.createProgram(gl, Shaders.quadVert, Shaders.quadFrag),
    positionLocation: 0,
    textureIndex: 28,
    uniformTextureLocation: null,
  };
  
  obj.uniformTextureLocation = gl.getUniformLocation(obj.program, "u_Texture");

  gl.bindVertexArray(obj.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, obj.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, obj.vertexData, gl.STATIC_DRAW);
  gl.vertexAttribPointer(obj.positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(obj.positionLocation);
  gl.bindVertexArray(null);

  // draw 함수 추가
  obj.draw = function(texture) {
    gl.useProgram(this.program);
    gl.clearColor(0, 0, 0, 1);

    gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniformTextureLocation, this.textureIndex);
    
    gl.bindVertexArray(this.vertexArray);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  };

  return obj;
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
      console.log("Drawing cubemap with environment texture", this.texture);
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

function createCubeMapForHdr(gl, brdfLut) {
  const cubemap = {
    textureIndex: 31,
    texture: null,
    textureIBLDiffuseIndex: 30,
    textureIBLDiffuse: null,
    finishLoadingCallback: null,
    
    // draw를 위한 프로퍼티들
    vertexArray: null,
    vertexBuffer: null,
    program: null,
    uniformMvpLocation: null,
    uniformEnvironmentLocation: null,
    positionLocation: 0,
    
    vertexData: new Float32Array([
      -1,  1, -1,  -1, -1, -1,   1, -1, -1,   1, -1, -1,   1,  1, -1,  -1,  1, -1,
      -1, -1,  1,  -1, -1, -1,  -1,  1, -1,  -1,  1, -1,  -1,  1,  1,  -1, -1,  1,
       1, -1, -1,   1, -1,  1,   1,  1,  1,   1,  1,  1,   1,  1, -1,   1, -1, -1,
      -1, -1,  1,  -1,  1,  1,   1,  1,  1,   1,  1,  1,   1, -1,  1,  -1, -1,  1,
      -1,  1, -1,   1,  1, -1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1,  1, -1,
      -1, -1, -1,  -1, -1,  1,   1, -1, -1,   1, -1, -1,  -1, -1,  1,   1, -1,  1,
    ]),

    init() {
      console.log("Initializing cube map resources for HDR environment...");
      // 큐브맵 draw용 프로그램과 버퍼 초기화
      this.program = Utils.createProgram(gl, Shaders.cubemapVert, Shaders.cubemapFrag);
      this.uniformMvpLocation = gl.getUniformLocation(this.program, "u_MVP");
      this.uniformEnvironmentLocation = gl.getUniformLocation(this.program, "u_environment");
      
      this.vertexArray = gl.createVertexArray();
      this.vertexBuffer = gl.createBuffer();
      
      gl.bindVertexArray(this.vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.STATIC_DRAW);
      gl.vertexAttribPointer(this.positionLocation, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.positionLocation);
      gl.bindVertexArray(null);
    },

    loadAll() {
      console.log("Starting to load HDR environment texture...");
      this.init();
      Utils.loadHDR('../textures/environment/sample/doge2.hdr', this.onloadHDR.bind(this));
    },
    
    equirectTexture: null,
    
    
    onloadHDR(hdrData) {
      console.log("HDR environment texture loaded:", hdrData);    
      // Equirectangular 텍스처 생성 - RGBA8로 변경 (FLOAT 대신)
      // HDR 데이터를 0-255 범위로 변환
      const width = hdrData.shape[0];
      const height = hdrData.shape[1];
      const floatData = hdrData.data;
      const ubyteData = new Uint8Array(width * height * 4);

      // RGBA32 포맷을 그대로 사용이 안되서 Uint8 bit 어레이레 넣음.
      // 그대로 사용하려면 hdrData를 넣어 주면됌..
      // 
      for (let i = 0; i < floatData.length; i++) {
        // HDR 값을 노출(exposure)과 감마 보정 적용 후 0-255로 변환
        let value = floatData[i];
        value *= hdrData.exposure; // 노출 보정
        hdrData.gamma = 2.2;
        value = Math.pow(value, 1.0 / hdrData.gamma); // 감마 보정
        ubyteData[i] = Math.min(255, Math.max(0, Math.floor(value * 255)));
      }
      
      this.equirectTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.equirectTexture);
      gl.texImage2D(
        gl.TEXTURE_2D, 0,
        gl.RGBA,
        width, height, 0,
        gl.RGBA, 
        gl.UNSIGNED_BYTE,
        ubyteData
      );

      
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
      
      // dlgmlals3
      // Equirectangular → CubeMap 변환 // 해상도
      this.convertEquirectToCubemap(4096);
      
      if (this.finishLoadingCallback) {
        this.finishLoadingCallback();
      }
    },
    
    convertEquirectToCubemap(cubeSize) {
      console.log("Converting equirectangular HDR to cubemap with size:", cubeSize);
      const size = cubeSize;
      
      // EXT_color_buffer_float 확장 확인
      const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
      if (!extColorBufferFloat) {
        console.warn('dlgmlals3 EXT_color_buffer_float not supported, trying fallback...');
      }
      
      // 변환 프로그램 생성
      const program = Utils.createProgram(
        gl, 
        Shaders.equirect2cubeVert,
        Shaders.equirect2cubeFrag
      );
      
      // 큐브 버퍼 생성
      const vertexData = new Float32Array([
        -1,  1, -1,  -1, -1, -1,   1, -1, -1,   1, -1, -1,   1,  1, -1,  -1,  1, -1,
        -1, -1,  1,  -1, -1, -1,  -1,  1, -1,  -1,  1, -1,  -1,  1,  1,  -1, -1,  1,
         1, -1, -1,   1, -1,  1,   1,  1,  1,   1,  1,  1,   1,  1, -1,   1, -1, -1,
        -1, -1,  1,  -1,  1,  1,   1,  1,  1,   1,  1,  1,   1, -1,  1,  -1, -1,  1,
        -1,  1, -1,   1,  1, -1,   1,  1,  1,   1,  1,  1,  -1,  1,  1,  -1,  1, -1,
        -1, -1, -1,  -1, -1,  1,   1, -1, -1,   1, -1, -1,  -1, -1,  1,   1, -1,  1,
      ]);
      
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindVertexArray(null);
      
      // 큐브맵 텍스처 생성 - RGBA8 사용 (より一般的)
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
      
      for (let i = 0; i < 6; i++) {
        gl.texImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0,
          gl.RGBA, size, size, 0,
          gl.RGBA, gl.UNSIGNED_BYTE, null
        );
      }
      
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      // 프레임버퍼 생성
      const fbo = gl.createFramebuffer();
      
      // 투영 행렬 (90도 FOV)
      const projection = mat4.create();
      mat4.perspective(projection, Math.PI / 2, 1.0, 0.1, 10.0);
      
      // 6개 면을 위한 뷰 행렬
      const views = [
        mat4.lookAt(mat4.create(), [0,0,0], [ 1, 0, 0], [0,-1, 0]),
        mat4.lookAt(mat4.create(), [0,0,0], [-1, 0, 0], [0,-1, 0]),
        mat4.lookAt(mat4.create(), [0,0,0], [ 0, 1, 0], [0, 0, 1]),
        mat4.lookAt(mat4.create(), [0,0,0], [ 0,-1, 0], [0, 0,-1]),
        mat4.lookAt(mat4.create(), [0,0,0], [ 0, 0, 1], [0,-1, 0]),
        mat4.lookAt(mat4.create(), [0,0,0], [ 0, 0,-1], [0,-1, 0]),
      ];
      
      gl.useProgram(program);
      const vpLoc = gl.getUniformLocation(program, 'u_viewProjection');
      const texLoc = gl.getUniformLocation(program, 'u_equirectangularMap');
      
      console.log("Program:", program, "VP location:", vpLoc, "Tex location:", texLoc);
      console.log("Equirect texture:", this.equirectTexture);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.equirectTexture);
      gl.uniform1i(texLoc, 0);
      
      // GLSL optimizer가 uniform을 제거하지 않도록 force
      const forceLoc = gl.getUniformLocation(program, 'u_forceUse');
      if (forceLoc) {
        gl.uniform1f(forceLoc, 1.0);
      }
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, size, size);
      
      // 렌더 상태 설정
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0.0, 1.0, 0.0, 1.0); // 초록색으로 설정해서 clear가 되는지 확인
      
      // 각 큐브맵 면 렌더링
      for (let i = 0; i < 6; i++) {
        const vp = mat4.create();
        mat4.multiply(vp, projection, views[i]);
        gl.uniformMatrix4fv(vpLoc, false, vp);
        
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
          this.texture,
          0
        );
        
        // 프레임버퍼 상태 체크
        const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        console.log(`Face ${i}: Framebuffer status check - ${fbStatus} (COMPLETE=${gl.FRAMEBUFFER_COMPLETE})`);
        
        if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
          const statusMap = {
            [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: "INCOMPLETE_ATTACHMENT",
            [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: "INCOMPLETE_MISSING_ATTACHMENT",
            [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: "INCOMPLETE_DIMENSIONS",
            [gl.FRAMEBUFFER_UNSUPPORTED]: "UNSUPPORTED"
          };
          console.error(`Face ${i}: Framebuffer NOT complete! Status: ${fbStatus} - ${statusMap[fbStatus] || 'UNKNOWN'}`);
          continue; // Skip this face if framebuffer is incomplete
        }
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
        gl.bindVertexArray(null);
        
        // WebGL 에러 체크
        const err = gl.getError();
        if (err !== gl.NO_ERROR) {
          console.error(`Face ${i}: WebGL error after draw: ${err}`);
        } else {
          console.log(`Face ${i}: Draw successful!`);
        }
        
        // 프레임버퍼에서 픽셀 읽기 (디버깅)
        //const pixels = new Float32Array(4);
        //gl.readPixels(size/2, size/2, 1, 1, gl.RGBA, gl.FLOAT, pixels);
        //console.log(`Face ${i}: Center pixel =`, pixels[0], pixels[1], pixels[2], pixels[3]);
      }
      
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      
      // 밉맵 생성 건너뛰기 - FLOAT 텍스처에서 mipmap 문제 가능성
      // gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
      // console.log("Generating mipmaps for cubemap texture...");
      // gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      // gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      
      // 디버깅: 텍스처를 다시 읽어서 확인
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, this.texture, 0);
      const testPixels = new Float32Array(4);
      gl.readPixels(size/2, size/2, 1, 1, gl.RGBA, gl.FLOAT, testPixels);
      console.log("After mipmap - Face 0 center pixel:", testPixels[0], testPixels[1], testPixels[2], testPixels[3]);
      console.log("After mipmap - Face 0 center pixel:", testPixels[0], testPixels[1], testPixels[2], testPixels[3]);
      console.log("After mipmap - Face 0 center pixel:", testPixels[0], testPixels[1], testPixels[2], testPixels[3]);
      console.log("After mipmap - Face 0 center pixel:", testPixels[0], testPixels[1], testPixels[2], testPixels[3]);
      console.log("After mipmap - Face 0 center pixel:", testPixels[0], testPixels[1], testPixels[2], testPixels[3]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      
      gl.deleteFramebuffer(fbo);
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(program);
      
      console.log('Equirectangular → CubeMap 변환 완료. Texture:', this.texture);
    },
    
    draw(V, P) {
      // console.log("DRAW - texture:", this.texture, "program:", this.program, "VAO:", this.vertexArray, "textureIndex:", this.textureIndex);
      
      if (!this.texture || !this.program || !this.vertexArray) {
        console.error("Missing resources for cubemap draw!", {
          texture: this.texture,
          program: this.program,
          vertexArray: this.vertexArray
        });
        return;
      }
      
      // MVP = P * (V without translation)  
      const MVP = mat4.create();
      mat4.copy(MVP, V);
      MVP[12] = MVP[13] = MVP[14] = 0.0;
      MVP[15] = 1.0;
      mat4.mul(MVP, P, MVP);

      // Depth 함수를 LEQUAL로 변경 (큐브맵은 depth = 1.0이므로)
      gl.depthFunc(gl.LEQUAL);

      gl.useProgram(this.program);
      
      // 텍스처 바인딩 디버깅
      // console.log("Binding texture to unit:", this.textureIndex);
      gl.activeTexture(gl.TEXTURE0 + this.textureIndex);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);
      // console.log("After bindTexture - bound texture:", gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP));

      gl.uniformMatrix4fv(this.uniformMvpLocation, false, MVP);
      gl.uniform1i(this.uniformEnvironmentLocation, this.textureIndex);
      // console.log("Set uniform environment to index:", this.textureIndex);

      gl.bindVertexArray(this.vertexArray);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
      gl.bindVertexArray(null);
      
      // Depth 함수를 원래대로 복구
      gl.depthFunc(gl.LESS);
      
      const err = gl.getError();
      if (err !== gl.NO_ERROR) {
        console.error("WebGL error during cubemap draw:", err);
      }
    }
  };
  
  return cubemap;
}

