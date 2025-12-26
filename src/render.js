function createRenderer(gl, resources) {
  const perspective = mat4.create();
  const VP = mat4.create();

  // scratch
  const localMV = mat4.create();
  const localMVP = mat4.create();
  const localMVNormal = mat4.create();
  const tmpMat4 = mat4.create();
  const inverseTransformMat4 = mat4.create();

  let programObj = null; // cached current programObject

  function setPerspective(aspect) {
    mat4.perspective(perspective, 0.785, aspect, 0.01, 100);
  }

  function activeAndBindTexture(curScene, uniformLocation, textureInfo) {
    gl.uniform1i(uniformLocation, textureInfo.index);
    gl.activeTexture(gl.TEXTURE0 + textureInfo.index);

    const texture = curScene.glTF.textures[textureInfo.index];
    gl.bindTexture(gl.TEXTURE_2D, texture.texture);

    const sampler = texture.sampler ? texture.sampler.sampler : resources.defaultSampler;
    gl.bindSampler(textureInfo.index, sampler);
  }

  function applyAnimation(timeParameter, animation, glTF) {
    for (const s of animation.samplers) s.getValue(timeParameter);

    for (const ch of animation.channels) {
      const samp = ch.sampler;
      const node = glTF.nodes[ch.target.nodeID];

      switch (ch.target.path) {
        case "rotation": node.rotation.set(samp.curValue); break;
        case "translation": node.translation.set(samp.curValue); break;
        case "scale": node.scale.set(samp.curValue); break;
      }
      node.updateMatrixFromTRS();
    }
  }
  
  function drawPrimitive(ctx, curScene, primitive, matrix, skinOrNull) {
    const { modelView, isFaceCullingState } = ctx;

    mat4.multiply(localMV, modelView, matrix);
    mat4.multiply(localMVP, perspective, localMV);

    mat4.invert(localMVNormal, localMV);
    mat4.transpose(localMVNormal, localMVNormal);

    const shader = primitive.shader;
    const material = primitive.material;

    // doubleSided 처리 (원래 로직 유지)
    if (material) {
      const wantCulling = !material.doubleSided;
      if (wantCulling !== isFaceCullingState.get()) {
        isFaceCullingState.set(wantCulling);
      }
    }

    // program switch
    const nextProgramObj = primitive.shader.programObject;
    if (programObj !== nextProgramObj) {
      programObj = nextProgramObj;
      gl.useProgram(programObj.program);
    }
    
    // material bind
    const defaultColor = [1, 1, 1, 1];
    let baseColor = defaultColor;
    
    if (material) {
      const pbr = material.pbrMetallicRoughness;
      baseColor = pbr.baseColorFactor;
      
      if (shader.hasBaseColorMap()) {
        activeAndBindTexture(curScene, programObj.uniformLocations.baseColorTexture, pbr.baseColorTexture);        
      }

      if (shader.hasNormalMap()) {
        activeAndBindTexture(curScene, programObj.uniformLocations.normalTexture, material.normalTexture);
        gl.uniform1f(programObj.uniformLocations.normalTextureScale, material.normalTexture.scale);        
      }

      if (shader.hasMetalRoughnessMap()) {
        activeAndBindTexture(curScene, programObj.uniformLocations.metallicRoughnessTexture, pbr.metallicRoughnessTexture);        
      }

      gl.uniform1f(programObj.uniformLocations.metallicFactor, pbr.metallicFactor);
      gl.uniform1f(programObj.uniformLocations.roughnessFactor, pbr.roughnessFactor);      

      if (shader.hasOcclusionMap()) {
        activeAndBindTexture(curScene, programObj.uniformLocations.occlusionTexture, material.occlusionTexture);
        gl.uniform1f(programObj.uniformLocations.occlusionStrength, material.occlusionTexture.strength);
      }

      if (shader.hasEmissiveMap()) {
        activeAndBindTexture(curScene, programObj.uniformLocations.emissiveTexture, material.emissiveTexture);
        gl.uniform3fv(programObj.uniformLocations.emissiveFactor, material.emissiveFactor);
      }
    }

    // skin UBO bind
    if (shader.hasSkin() && skinOrNull) {
      gl.uniformBlockBinding(programObj.program, programObj.uniformBlockIndices.JointMatrix, skinOrNull.uniformBlockID);
    }

    // env textures
    gl.activeTexture(gl.TEXTURE0 + resources.brdfLut.textureIndex);
    gl.bindTexture(gl.TEXTURE_2D, resources.brdfLut.texture);

    gl.activeTexture(gl.TEXTURE0 + resources.cubemap.textureIndex);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, resources.cubemap.texture);

    gl.activeTexture(gl.TEXTURE0 + resources.cubemap.textureIBLDiffuseIndex);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, resources.cubemap.textureIBLDiffuse);

    gl.uniform4fv(programObj.uniformLocations.baseColorFactor, baseColor);
    gl.uniformMatrix4fv(programObj.uniformLocations.MV, false, localMV);
    gl.uniformMatrix4fv(programObj.uniformLocations.MVP, false, localMVP);
    gl.uniformMatrix4fv(programObj.uniformLocations.MVNormal, false, localMVNormal);

    gl.bindVertexArray(primitive.vertexArray);
    if (primitive.indices !== null) {
      gl.drawElements(primitive.mode, primitive.indicesLength, primitive.indicesComponentType, primitive.indicesOffset);
    } else {
      gl.drawArrays(primitive.mode, primitive.drawArraysOffset, primitive.drawArraysCount);
    }
    gl.bindVertexArray(null);
  }

  function updateSkinUBO(node, nodeMatrix, matrix) {
    const skin = node.skin;
    const joints = skin.joints;

    mat4.invert(inverseTransformMat4, matrix);

    for (let i = 0; i < joints.length; i++) {
      const jointNode = joints[i];
      mat4.mul(tmpMat4, nodeMatrix[jointNode.nodeID], skin.inverseBindMatrix[i]);
      mat4.mul(tmpMat4, inverseTransformMat4, tmpMat4);
      skin.jointMatrixUnidormBufferData.set(tmpMat4, i * 16);
    }

    gl.bindBuffer(gl.UNIFORM_BUFFER, skin.jointMatrixUniformBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, skin.jointMatrixUnidormBufferData, 0, skin.jointMatrixUnidormBufferData.length);
  }

  function getTransmissionFactor(prim) {
    const m = prim.material;
    if (!m) return { factor: 0.0, texture: null };
    
    //console.log("dlgmlals4 " + JSON.stringify(m));
    
    const t = m.extensions?.KHR_materials_transmission;
    if (t && (t.transmissionFactor ?? 0) > 0) {
      return {
        factor: t.transmissionFactor, texture: t.transmissionTexture,
      };
    }
    return { factor: 0.0, texture: null };    
  }

  function drawNode(pass, ctx, scene, node, nodeID, nodeMatrix, parentModelMatrix) {
    const matrix = nodeMatrix[nodeID];

    if (parentModelMatrix) {
      mat4.mul(matrix, parentModelMatrix, node.matrix);
    } else {
      mat4.copy(matrix, node.matrix);
    } 

    // skin
    if (node.skin) {
      updateSkinUBO(node, nodeMatrix, matrix);
    }

    if (node.mesh) {
      for (const prim of node.mesh.primitives) {
        const tf = getTransmissionFactor(prim);
        
        const isTrans = tf.factor > 0.0001;                
        if (pass === "opaque" && isTrans) continue;
        if (pass === "transmission" && !isTrans) continue;

        drawPrimitive(ctx, scene, prim, matrix, node.skin || null);
      }
    }

    if (node.skin) {
      gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    } 

    for (const child of node.children) {
      drawNode(pass, ctx, scene, child, child.nodeID, nodeMatrix, matrix);
    }
  }
  
  function drawScene(pass, ctx, scene) {
    const { timeParameter, curAnimationId, playAllAnimationTogether } = ctx;
    const glTF = scene.glTF;

    if (glTF.animations) {
      if (playAllAnimationTogether) {
        for (const anim of glTF.animations) {
          applyAnimation(timeParameter, anim, glTF);
        }
      } else {
        const anim = glTF.animations[curAnimationId];
        if (anim) {
          applyAnimation(timeParameter, anim, glTF);
        }
      }
    }

    for (const root of scene.glTFScene.nodes) {
      drawNode(pass, ctx, scene, root, root.nodeID, scene.nodeMatrix, scene.rootTransform);
    }
  }

  function drawSceneBBox(ctx, scene) {
    const { boundingBoxType } = ctx;
    const glTF = scene.glTF;

    gl.useProgram(resources.bbox.program);
    gl.bindVertexArray(resources.bbox.vertexArray);

    for (let i = 0; i < scene.nodeMatrix.length; i++) {
      const node = glTF.nodes[i];

      if (boundingBoxType === "bvh") {
        if (!node.bvh) continue;
        mat4.mul(localMVP, scene.rootTransform, node.bvh.transform);
        mat4.mul(localMVP, VP, localMVP);
        gl.uniformMatrix4fv(resources.bbox.uniformMvpLocation, false, localMVP);
        gl.drawArrays(gl.LINES, 0, 24);
      } else if (node.mesh) {
        const mesh = node.mesh;

        if (boundingBoxType === "aabb") {
          if (!node.aabb) continue;
          mat4.mul(localMVP, scene.rootTransform, node.aabb.transform);
          mat4.mul(localMVP, VP, localMVP);
        } else {
          mat4.mul(localMVP, scene.nodeMatrix[i], mesh.boundingBox.transform);
          mat4.mul(localMVP, VP, localMVP);
        }

        gl.uniformMatrix4fv(resources.bbox.uniformMvpLocation, false, localMVP);
        gl.drawArrays(gl.LINES, 0, 24);
      }
    }

    gl.bindVertexArray(null);
  }

  let opaqueFBO = null;
  let opaqueColorTex = null;
  let opaqueDepthRb = null;
  let fboW = 0, fboH = 0;  

  function generateFBO(width, height) {
      if (opaqueFBO && fboW === width && fboH === height) return;

      if (opaqueColorTex) gl.deleteTexture(opaqueColorTex);
      if (opaqueDepthRb) gl.deleteRenderbuffer(opaqueDepthRb);
      if (opaqueFBO) gl.deleteFramebuffer(opaqueFBO);

      fboW = width; fboH = height;

      opaqueFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, opaqueFBO);

      opaqueColorTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, opaqueColorTex);
      // 수정: sized format 대신 unsized format 사용
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); // LINEAR → NEAREST
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, opaqueColorTex, 0);

      opaqueDepthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, opaqueDepthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, opaqueDepthRb);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Opaque FBO incomplete:", status.toString(16));
        return; // 실패 시 중단
      } else {
        console.log("generate FBO complete");
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function render(ctx) {
    mat4.mul(VP, perspective, ctx.modelView);  
    const width = ctx.width | 0;
    const height = ctx.height | 0;    

    generateFBO(width, height);

    gl.viewport(0, 0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, opaqueFBO);

    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);    
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    // 1. opaque rendering
    // opaque에서는 transmission 프리미티브는 skip 되어있어야 함.
    resources.cubemap.draw(ctx.modelView, perspective);
    for (const scene of ctx.scenes) {
      drawScene("opaque", ctx, scene);
    }
    
    // 2. opaque texture to main
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    resources.quadScreen.draw(opaqueColorTex);      

    
    gl.viewport(0, 0, width, height);
    if (ctx.drawBoundingBox) {
      for (const scene of ctx.scenes) {
        drawSceneBBox(ctx, scene);
      }
    }

    programObj = null;
    
  }

  return { render, setPerspective };
}
