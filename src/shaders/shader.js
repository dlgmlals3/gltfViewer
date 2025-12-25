'use strict';

// Shader source code storage
var Shaders = Shaders || {};

// Fetch shader source from file
function loadShaderSource(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false); // synchronous request for simplicity
    xhr.send(null);
    
    if (xhr.status === 200) {
        return xhr.responseText;
    } else {
        console.error('Failed to load shader:', url);
        return '';
    }
}

// Load all shaders
Shaders.bboxVert = loadShaderSource('src/shaders/bbox.vert.glsl');
Shaders.bboxFrag = loadShaderSource('src/shaders/bbox.frag.glsl');
Shaders.cubemapVert = loadShaderSource('src/shaders/cubemap.vert.glsl');
Shaders.cubemapFrag = loadShaderSource('src/shaders/cubemap.frag.glsl');
Shaders.pbrVert = loadShaderSource('src/shaders/pbr.vert.glsl');
Shaders.pbrFrag = loadShaderSource('src/shaders/pbr.frag.glsl');
