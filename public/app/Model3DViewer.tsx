// Model3DViewer — extracted from app.jsx (an interactive GLB/STL 3D viewer).
// Loaded via APP_MODULES in index.html: CONCATenated with app.jsx BEFORE Babel,
// so it shares one global scope (React/hooks from app.jsx plus
// window.WOLFSPACE3D). A function declaration, so it hoists and is safe to append.

/* ----------------------------- Viewer 3D (GLB/STL) ----------------------------- */
// An interactive three.js viewer (vendored offline via window.WOLFSPACE3D).
// Orbit, zoom, and auto-frame to the model's bounding box. It disposes every
// WebGL resource (renderer, geometry, material, RAF, ResizeObserver) on unmount —
// without that, opening and closing a few models leaks WebGL contexts until the
// browser refuses to create another ("Too many active WebGL contexts").
function Model3DViewer({ url, name }: { url?: string; name?: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [errMsg, setErrMsg] = useState("");
  // glTF animation: the mixer and actions live inside the effect (they need three
  // objects), while the UI controls (play/pause, clip picker) sit in the JSX
  // outside — bridged through a ref.
  const mixerRef = useRef<any>(null);
  const actionsRef = useRef<any[]>([]);
  // Animation clip names; empty means a static model.
  const [clips, setClips] = useState<string[]>([]);
  const [playing, setPlaying] = useState(true);
  const [activeClip, setActiveClip] = useState(0);

  useEffect(() => {
    const lib = typeof window !== "undefined" && window.WOLFSPACE3D;
    const mount = mountRef.current;
    if (!mount) return;
    if (!lib || !lib.THREE) {
      setStatus("error");
      setErrMsg("3D library (three.js) is not loaded.");
      return;
    }
    const { THREE, GLTFLoader, STLLoader, OrbitControls, RoomEnvironment } =
      lib;
    let raf = 0;
    let disposed = false;
    const disposables: any[] = [];
    // Reset animation state for each new model (the effect re-runs when url/name
    // changes).
    mixerRef.current = null;
    actionsRef.current = [];
    setClips([]);
    setPlaying(true);
    setActiveClip(0);

    const w = mount.clientWidth || 600;
    const h = mount.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14181f);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    // three r160: default output sudah sRGB; set eksplisit untuk konsistensi warna GLB.
    if ("outputColorSpace" in renderer)
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    // ACES filmic tone mapping — kunci look "filmic" Blender (EEVEE/Cycles default);
    // tanpa ini warna PBR terlihat datar & mudah over-bright.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    // Bayangan lembut (PCF) untuk contact shadow di bawah model.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // IBL: environment studio prosedural (RoomEnvironment) -> PMREM. Inilah sumber
    // cahaya & refleksi utama untuk material PBR (GLB) yang memberi kesan "render
    // studio Blender". Dibangkitkan di runtime — tanpa file HDR eksternal, tetap offline.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    disposables.push(envTex, pmrem);

    // Satu key light directional untuk highlight + PENCETAK bayangan (IBL tak mencetak
    // bayangan tajam). Ambient tipis hanya mengangkat area paling gelap sedikit.
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    scene.add(key);
    scene.add(key.target);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Bingkai kamera ke bounding box objek + pasang contact-shadow ground + atur
    // frustum shadow camera. Auto-frame agar model pas di layar berapa pun skala
    // aslinya (mm vs meter, dll).
    const frameObject = (obj: any) => {
      obj.traverse((o: any) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center); // pusatkan model ke origin
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const minY = -size.y / 2; // dasar model setelah dipusatkan

      // Contact shadow: lantai netral halus (sedikit lebih terang dari background)
      // yang menerima bayangan — memberi kesan model "menapak", bukan melayang.
      const gmat = new THREE.MeshStandardMaterial({
        color: 0x1c222b,
        roughness: 0.95,
        metalness: 0,
      });
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(maxDim * 14, maxDim * 14),
        gmat,
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = minY - maxDim * 0.002;
      ground.receiveShadow = true;
      scene.add(ground);

      // Frustum shadow camera key light harus menutupi model.
      const sh = maxDim * 1.3;
      key.shadow.camera.left = -sh;
      key.shadow.camera.right = sh;
      key.shadow.camera.top = sh;
      key.shadow.camera.bottom = -sh;
      key.shadow.camera.near = 0.01;
      key.shadow.camera.far = maxDim * 20;
      key.position.set(maxDim * 0.6, maxDim * 1.5, maxDim * 0.9);
      key.target.position.set(0, 0, 0);
      key.shadow.camera.updateProjectionMatrix();

      const fov = (camera.fov * Math.PI) / 180;
      const dist = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;
      camera.position.set(0, maxDim * 0.15, dist);
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      controls.update();
    };

    const onReady = (obj: any) => {
      if (disposed) return;
      scene.add(obj);
      frameObject(obj);
      setStatus("ready");
    };
    const onErr = (e: any) => {
      if (disposed) return;
      setStatus("error");
      setErrMsg((e && e.message) || "Failed to load the 3D model.");
    };

    try {
      // Both props are optional; the effect returned earlier when neither was
      // usable, but that narrowing does not reach this far.
      if (/\.stl$/i.test(name || url || "")) {
        new STLLoader().load(
          url,
          (geometry: any) => {
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
              color: 0x9aa4b2,
              metalness: 0.1,
              roughness: 0.75,
            });
            const mesh = new THREE.Mesh(geometry, material);
            disposables.push(geometry, material);
            onReady(mesh);
          },
          undefined,
          onErr,
        );
      } else {
        new GLTFLoader().load(
          url,
          (gltf: any) => {
            onReady(gltf.scene);
            // Animasi glTF (skeletal/morph/keyframe) — inilah "animasi ala Unity":
            // GLB bisa membawa beberapa klip, diputar native lewat AnimationMixer.
            if (!disposed && gltf.animations && gltf.animations.length) {
              const mixer = new THREE.AnimationMixer(gltf.scene);
              const actions = gltf.animations.map((clip: any) =>
                mixer.clipAction(clip),
              );
              actions[0].play(); // auto-play klip pertama
              mixerRef.current = mixer;
              actionsRef.current = actions;
              setClips(
                gltf.animations.map(
                  (c: any, i: number) => c.name || "Klip " + (i + 1),
                ),
              );
            }
          },
          undefined,
          onErr,
        );
      }
    } catch (e) {
      onErr(e);
    }

    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (mixerRef.current) mixerRef.current.update(dt); // majukan animasi
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      const nw = mount.clientWidth || w;
      const nh = mount.clientHeight || h;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (mixerRef.current) {
        try {
          mixerRef.current.stopAllAction();
        } catch (_) {}
        mixerRef.current = null;
      }
      actionsRef.current = [];
      ro.disconnect();
      controls.dispose();
      disposables.forEach((d) => {
        try {
          d.dispose && d.dispose();
        } catch (_) {}
      });
      // Buang geometry/material sisa di scene (mis. GLB multi-mesh) lalu konteks WebGL.
      scene.traverse((o: any) => {
        if (o.geometry) {
          try {
            o.geometry.dispose();
          } catch (_) {}
        }
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m: any) => {
            try {
              m.dispose && m.dispose();
            } catch (_) {}
          });
        }
      });
      try {
        renderer.dispose();
      } catch (_) {}
      try {
        renderer.forceContextLoss && renderer.forceContextLoss();
      } catch (_) {}
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [url, name]);

  // Jeda/putar dengan membekukan timeScale mixer (0 = beku, 1 = normal).
  const togglePlay = () => {
    const m = mixerRef.current;
    if (!m) return;
    const nx = !playing;
    m.timeScale = nx ? 1 : 0;
    setPlaying(nx);
  };
  // Switch the active clip: play the chosen one, stop the rest.
  const selectClip = (i: number) => {
    const acts = actionsRef.current;
    if (!acts[i]) return;
    acts.forEach((a, idx) => (idx === i ? a.reset().play() : a.stop()));
    if (mixerRef.current) mixerRef.current.timeScale = 1;
    setActiveClip(i);
    setPlaying(true);
  };

  return (
    <div
      style={{
        position: "relative",
        width: "70vw",
        maxWidth: "900px",
        height: "calc(85vh - 80px)",
        background: "#0d1117",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {status !== "ready" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#8b98a9",
            fontSize: "13px",
            pointerEvents: "none",
            gap: "8px",
          }}
        >
          {status === "loading" ? (
            <>
              <div style={{ fontSize: "32px" }}>🧊</div>
              <div>Loading 3D model…</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "32px" }}>⚠️</div>
              <div>{errMsg}</div>
            </>
          )}
        </div>
      )}
      {status === "ready" && clips.length > 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "rgba(0,0,0,0.62)",
            padding: "5px 10px 5px 6px",
            borderRadius: "20px",
          }}
        >
          <button
            className="btn-reset"
            onClick={togglePlay}
            title={playing ? "Jeda animasi" : "Putar animasi"}
            style={{
              color: "#e2e8f0",
              fontSize: "14px",
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e: any) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.12)")
            }
            onMouseLeave={(e: any) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {playing ? "⏸" : "▶"}
          </button>
          {clips.length > 1 ? (
            <select
              value={activeClip}
              onChange={(e: any) => selectClip(Number(e.target.value))}
              style={{
                background: "#1c222b",
                color: "#c9d1d9",
                border: "1px solid #30363d",
                borderRadius: "6px",
                fontSize: "11px",
                padding: "3px 6px",
                fontFamily: "inherit",
                cursor: "pointer",
                maxWidth: "180px",
              }}
            >
              {clips.map((c, i) => (
                <option key={i} value={i}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <span
              style={{
                color: "#c9d1d9",
                fontSize: "11px",
                paddingRight: "4px",
                maxWidth: "180px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              🎞 {clips[0]}
            </span>
          )}
        </div>
      ) : status === "ready" ? (
        <div
          style={{
            position: "absolute",
            bottom: "10px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.55)",
            color: "#c9d1d9",
            fontSize: "11px",
            padding: "4px 12px",
            borderRadius: "12px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          Drag to rotate · scroll to zoom
        </div>
      ) : null}
    </div>
  );
}
