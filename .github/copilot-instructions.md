# Copilot / AI Agent Instructions — gltfViewer

Purpose: make an automated coding assistant immediately productive in this repository. Keep advice short and concrete; reference real files and patterns.

## Quick start (how to run locally)
- The easiest way to run examples is to serve the repo over HTTP (shader sources are loaded via synchronous XHR):
  - python: `python -m http.server 8000` (run from repo root)
  - node: `npx http-server -p 8000` or use VS Code Live Server
- Open `index.html` (or `examples/webgl2-renderer.html`) in a browser and check DevTools console and Network tab for shader XHRs and shader compile logs.

## Big-picture architecture
- Loader: `src/loader/minimal-gltf-loader.js` parses glTF JSON into runtime objects (Scene, Node, Mesh, Skin, Accessor, BufferView, etc.). Many runtime fields are added by the loader (e.g., `uniformBlockID` for skins).
- Scene & resources: `src/scene.js` creates shared GPU resources (BRDF LUT, samplers, cubemap, bbox, fullscreen quad) and contains the shader macro system and `setupScene` (VAOs, material flags).
- Renderer: `src/render.js` is pass-based: OPAQUE pass renders non-transmission geometry into an FBO, then a TRANSMISSION pass composites transmission materials using the opaque texture (texture unit 15 is used for the opaque texture).
- App: `src/app.js` wires UI, loads resources, and drives the render loop.
- Shaders: GLSL sources live under `src/shaders/*.glsl`. `src/shaders/shader.js` synchronously XHRs shader sources into a `Shaders` global.

## Key project conventions and patterns
- Global singletons are used widely: `MinimalGLTFLoader`, `Shaders`, `Utils`. Do not convert code to ES modules without verifying boot order and index.html script tags.
- Shader feature macros are defined via `Shader.prototype.defineMacro` and compile into variants. Look at `Shader_Static.bitMasks` and `compile()` in `src/scene.js` for the canonical pattern.
- Fixed attribute locations are used (so add new attributes at existing locations or extend carefully):
  - POSITION = 0, NORMAL = 1, TEXCOORD_0 = 2, JOINTS_0 = 3, WEIGHTS_0 = 4, JOINTS_1 = 5, WEIGHTS_1 = 6
- Texture unit conventions: `quad` uses textureIndex 28; `brdfLut` uses 29; cube maps and others use indices set in `createSceneResources`. Pick unused texture units conservatively.
- Skin UBO binding IDs are assigned by the loader via `globalUniformBlockID` (see `src/loader/minimal-gltf-loader.js`) and bound in `setupScene` with `gl.bindBufferBase`.

## How to add or change rendering features (example workflow)
- To add a new glTF extension or material parameter (example: KHR_materials_transmission or anisotropy):
  1. Ensure the extension fields are parsed and stored in `src/loader/minimal-gltf-loader.js` (extensions are typically placed into `material.extensions`).
  2. In `src/scene.js` set shader macros based on the material (e.g., `prim.shader.defineMacro("HAS_TRANSMISSION")`) and add uniform locations in `Shader.prototype.compile`.
  3. In `src/shaders/pbr.frag.glsl`/`pbr.vert.glsl` implement GLSL code that is gated by `#ifdef HAS_TRANSMISSION` (follow the pattern used for other HAS_* macros).
  4. Hook up runtime texture/uniform updates in `src/render.js` (see how baseColor, normal map, occlusion and transmission are bound and set).

## Debugging hints
- Shader compile/link logs are printed by `Utils.createProgram` (check DevTools console).
- If a shader source XHR returns an error, check the Network tab; the project must be served over HTTP (file:// won't work for synchronous XHR in many browsers).
- Rendering artifacts: use the bounding box UI toggle (`Draw Bounding Box`) in `index.html` to validate node/mesh transforms.

## Build / packaging notes
- No `package.json` or CI workflows are present. There is an example `examples/webpack.config.js` if you want to add a webpack-based workflow; built artifacts are checked in under `build/`.
- When adding a build pipeline, keep the same runtime assumptions (global objects, shader loading pathing) or update `index.html` to load bundled assets.

## Tests / CI
- There are currently no automated tests or GitHub Actions workflows. Add lightweight smoke tests or a headless renderer test if you plan CI changes.

## Pull request guidance
- Keep changes small and demoable in `index.html` (show a working example and a before/after screenshot if visual).
- Preserve existing global-based loading order or clearly document bootstrap changes if you refactor into modules.

---
If you want, I can (a) expand the short examples with line references, (b) add a small checklist for PR reviewers, or (c) propose a minimal `package.json` + build script to enable reproducible builds—tell me which you'd prefer.