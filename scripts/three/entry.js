// Entry vendor 3D — dibundel esbuild jadi public/vendor/three3d.bundle.js (IIFE,
// globalName WOLFSPACE3D). Mengekspos three + loader/kontrol yang WOLFSPACE butuhkan
// untuk viewer 3D interaktif attachment (GLB/STL). Runtime tetap tanpa-bundler:
// index.html/app.jsx cukup baca window.WOLFSPACE3D.*.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export { THREE, GLTFLoader, STLLoader, OrbitControls };
