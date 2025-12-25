export const Utils = {
    getShaderSource: function(id) {
        return document.getElementById(id).textContent.replace(/^\s+|\s+$/g, '');
    },

    createProgram: function(gl, vertexShaderSource, fragmentShaderSource) {
        const program = gl.createProgram();
        
        const vshader = this.createShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
        const fshader = this.createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
        
        gl.attachShader(program, vshader);
        gl.deleteShader(vshader);
        gl.attachShader(program, fshader);
        gl.deleteShader(fshader);
        gl.linkProgram(program);

        const log = gl.getProgramInfoLog(program);
        if (log) {
            console.log(log);
        }

        return program;
    },

    createShader: function(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        const log = gl.getShaderInfoLog(shader);
        if (log) {
            console.log(log);
        }
        
        return shader;
    },

    loadImage: function(url, onload) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        img.onload = onload;
        return img;
    },

    loadImages: function(urls, onload) {
        const imgs = [];
        let imgsToLoad = urls.length;

        function onImgLoad() {
            if (--imgsToLoad <= 0) {
                onload(imgs);
            }
        }

        for (let i = 0; i < imgsToLoad; ++i) {
            imgs.push(this.loadImage(urls[i], onImgLoad));
        }
    }
};