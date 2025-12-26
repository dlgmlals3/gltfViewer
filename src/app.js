(function () {
  "use strict";

  // ---------- UI state ----------
  let drawBoundingBox = false;
  let boundingBoxType = "obb";
  let curAnimationId = 0;
  let playAllAnimationTogether = false;

  const animationSelectionList = document.getElementById("animations");
  animationSelectionList.addEventListener("change", function () {
	curAnimationId = this.selectedIndex;
  });

  document.getElementById("bbox-toggle").addEventListener("change", function () {
	drawBoundingBox = this.checked;
  });

  document.getElementById("play-all-animations").addEventListener("change", function () {
	playAllAnimationTogether = this.checked;
  });

  document.getElementById("bbox-type").addEventListener("change", function () {
	boundingBoxType = this.value;
  });

  // ---------- Canvas + GL ----------
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);

  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) {
	alert("WebGL2 not available");
	return;
  }

  canvas.oncontextmenu = (e) => e.preventDefault();

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CCW);
  let isFaceCulling = true;

  // ---------- Mouse/Camera state ----------
  let isDisplayRotation = false;
  let s = 1;
  let eulerX = 0;
  let eulerY = 0;
  let r = 0;
  const rotationSpeedY = 0.01;

  const translate = vec3.create();
  const modelMatrix = mat4.create();
  const identityQ = quat.create();

  let mouseDown = false;
  let mouseButtonId = 0;
  let lastMouseY = 0;
  let lastMouseX = 0;

  window.onmousedown = function (event) {
	mouseDown = true;
	mouseButtonId = event.which;
	lastMouseY = event.clientY;
	lastMouseX = event.clientX;
  };

  window.onmouseup = function () {
	mouseDown = false;    
  };

  window.onmousemove = function (event) {
	if (!mouseDown) return;
	const newY = event.clientY;
	const newX = event.clientX;
	const deltaY = newY - lastMouseY;
	const deltaX = newX - lastMouseX;

	switch (mouseButtonId) {
	  case 1: // left
		eulerX += -deltaY * 0.01;
		eulerY += deltaX * 0.01;
		break;
	  case 3: // right
		translate[0] += deltaX * 0.001;
		translate[1] += -deltaY * 0.001;
		break;
	}

	lastMouseY = newY;
	lastMouseX = newX;
  };

  window.onwheel = function (event) {
	translate[2] += -event.deltaY * 0.001;
  };

  window.onresize = function () {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
	renderer.setPerspective(canvas.width / canvas.height);
  };

  // ---------- GLTF loader ----------
  const glTFLoader = new MinimalGLTFLoader.glTFLoader(gl);

  // runtime scenes
  const scenes = [];

  // ---------- Create shared resources (bbox, cubemap, brdf, samplers) ----------
  const resources = createSceneResources(gl, { mat4, vec3 });

  // ---------- Renderer: pass-based ----------
  const renderer = createRenderer(gl, resources, { mat4, vec3 });
  gl.viewport(0, 0, canvas.width, canvas.height);
  renderer.setPerspective(canvas.width / canvas.height);

  // ---------- setupScene (kept in scene.js) ----------
  async function loadAndSetup(uri, replaceScene = null) {

	return new Promise((resolve) => {
	  glTFLoader.loadGLTF(uri, function (glTF) {
		// update animation list UI
		while (animationSelectionList.options.length) animationSelectionList.remove(0);
		if (glTF.animations) {
		  for (let i = 0; i < glTF.animations.length; i++) {
			const option = document.createElement("option");
			option.text = glTF.animations[i].name || String(i);
			animationSelectionList.add(option);
		  }
		}
		curAnimationId = 0;

		const sceneRuntime = resources.setupScene(gl, glTF, scenes, {
		  replaceScene,
		  // camera fitting state passed in:
		  modelMatrix,
		  translate,
		  setScale: (v) => (s = v),
		});

		resolve(sceneRuntime);
	  });
	});
  }

  // ---------- model select ----------
  document.getElementById("gltf-model").addEventListener("change", async function () {
    const uri = this.value;
    scenes.length = 0;
    await loadAndSetup(uri);
  });

  // ---------- render loop ----------
  const timeStampZero = performance.now();
  let timeParameter = 0;

  function frame(ts) {
	timeParameter = (ts - timeStampZero) * 0.001;

	// camera modelView
	const scale = vec3.fromValues(s, s, s);

	const modelView = mat4.create();
	mat4.identity(modelView);
	mat4.translate(modelView, modelView, translate);

	if (isDisplayRotation) r += rotationSpeedY;

	mat4.rotateX(modelView, modelView, eulerX);
	mat4.rotateY(modelView, modelView, r);
	mat4.scale(modelView, modelView, scale);
	mat4.mul(modelView, modelView, modelMatrix);
	mat4.rotateY(modelView, modelView, eulerY);

	renderer.render({
	  scenes,
	  width: canvas.width,
	  height: canvas.height,
	  modelView,
	  drawBoundingBox,
	  boundingBoxType,
	  curAnimationId,
	  playAllAnimationTogether,
	  timeParameter,
	  isFaceCullingState: {
		get: () => isFaceCulling,
		set: (v) => {
		  isFaceCulling = v;
		  if (isFaceCulling) gl.enable(gl.CULL_FACE);
		  else gl.disable(gl.CULL_FACE);
		},
	  },
	});

	  requestAnimationFrame(frame);
  }

  // ---------- startup: load env -> load model -> start loop ----------
  resources.cubemap.finishLoadingCallback = async function () {
	const defaultUri =
	  document.getElementById("gltf-model").value ||
	  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/TransmissionTest/glTF/TransmissionTest.gltf";

	await loadAndSetup(defaultUri);
	requestAnimationFrame(frame);
  };

  resources.cubemap.loadAll();
})();
