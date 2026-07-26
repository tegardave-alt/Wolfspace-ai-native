import { NodeIO } from "@gltf-transform/core";
import {
  EXTTextureWebP,
  KHRMeshQuantization,
} from "@gltf-transform/extensions";
import { execFileSync } from "child_process";
import fs from "fs";
const BLENDER = "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const io = new NodeIO().registerExtensions([
  EXTTextureWebP,
  KHRMeshQuantization,
]);
const doc = await io.read("C:/Users/dave/Downloads/zero-split.glb");
const texs = doc.getRoot().listTextures();
const jobs = [];
texs.forEach((t, i) => {
  if (t.getMimeType() === "image/webp") {
    const wp = `C:/Users/dave/Downloads/_tex${i}.webp`,
      png = `C:/Users/dave/Downloads/_tex${i}.png`;
    fs.writeFileSync(wp, Buffer.from(t.getImage()));
    jobs.push({ i, wp, png });
  }
});
console.log("job webp->png:", jobs.length);
const lines = jobs.map(
  (j) =>
    `img=bpy.data.images.load(r'${j.wp}'); img.file_format='PNG'; img.filepath_raw=r'${j.png}'; img.save(); print('CONV ${j.i}', __import__('os').path.exists(r'${j.png}'))`,
);
const tmp = "C:/Users/dave/Downloads/_conv.py";
fs.writeFileSync(tmp, "import bpy\n" + lines.join("\n") + "\n");
const out = execFileSync(
  BLENDER,
  ["--background", "--factory-startup", "--python", tmp],
  { encoding: "utf8", timeout: 120000 },
);
console.log(
  out
    .split(/\r?\n/)
    .filter((l) => /^CONV/.test(l))
    .join("\n"),
);
for (const j of jobs) {
  if (!fs.existsSync(j.png)) throw new Error("PNG hilang: " + j.png);
  const png = fs.readFileSync(j.png);
  texs[j.i].setImage(new Uint8Array(png)).setMimeType("image/png");
  console.log(`tex${j.i}: PNG ${(png.length / 1024).toFixed(0)}KB ter-swap`);
  fs.unlinkSync(j.wp);
  fs.unlinkSync(j.png);
}
fs.unlinkSync(tmp);
doc
  .getRoot()
  .listExtensionsUsed()
  .forEach((e) => {
    if (e.extensionName === "EXT_texture_webp") e.dispose();
  });
await io.write("C:/Users/dave/Downloads/zero-split-png.glb", doc);
console.log(
  "HASIL mime:",
  doc
    .getRoot()
    .listTextures()
    .map((t) => t.getMimeType())
    .join(", "),
);
console.log(
  "ext:",
  doc
    .getRoot()
    .listExtensionsUsed()
    .map((e) => e.extensionName)
    .join(", ") || "(none)",
);
console.log(
  "ukuran:",
  (
    fs.statSync("C:/Users/dave/Downloads/zero-split-png.glb").size /
    1024 /
    1024
  ).toFixed(1),
  "MB",
);
