// .mjs, NOT .js. This file is ES modules inside a package whose
// package.json says "type": "commonjs", so `node --check` reads it as
// CommonJS and rejects `import` outright. The pre-commit hook runs exactly
// that check, so the extension is what lets this file be committed at all.
// esbuild never cared either way.
// entry.js — the 3D vendor entry point, bundled by esbuild into
// public/vendor/three3d.bundle.js as an IIFE named WOLFSPACE3D. It exposes
// three plus the loaders and controls the interactive GLB/STL viewer needs. The
// runtime stays bundler-free:
// index.html/app.jsx cukup baca window.WOLFSPACE3D.*.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
// RoomEnvironment: procedural studio lighting, generated at run time with NO
// external HDR file — the IBL source for a studio look that stays entirely
// offline.
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export { THREE, GLTFLoader, STLLoader, OrbitControls, RoomEnvironment };
