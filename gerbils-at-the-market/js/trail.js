// trail.js — the arrows on the ground. A row of flat chevrons that pulse in a wave toward the far end so a five-year-old can
// see which way to go. One InstancedMesh.
//   set(x0, x1, z = 0)         lays the row along the road (z fixed), pointing from x0 toward x1
//   setPath(ax, az, bx, bz)    lays it along any segment, each chevron pointing from a toward b
//   show(v), update(now), dispose()
import * as THREE from 'three';
import { artMode, arrowTrailParts } from './art/paper-props.js';
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function chevronGeometry() {
  const sh = new THREE.Shape(); sh.moveTo(-.45, -.5); sh.lineTo(.15, 0); sh.lineTo(-.45, .5); sh.lineTo(-.2, .5); sh.lineTo(.45, 0); sh.lineTo(-.2, -.5); sh.closePath();
  // the shape's tip is at +x; rotateX(-90°) lays it flat in the xz plane and keeps the tip at +x (a yaw of 0 points up the road)
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); return g;
}
export function createTrail(scene, { max = 40, color = 0xf2c230, pitch = 2.2, size = 1 } = {}) {
  // paper mode: the painted arrow (art/sprites/arrow.svg, shared geometry and material); old mode: the flat chevron
  const pp = artMode() === 'paper' ? arrowTrailParts() : null;
  const mesh = pp ? new THREE.InstancedMesh(pp.geometry, pp.material, max)
    : new THREE.InstancedMesh(chevronGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), max);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false; scene.add(mesh);
  let n = 0, x0 = 0, z0 = 0, ux = 1, uz = 0, yaw = 0; const base = new THREE.Color(color), dim = base.clone().multiplyScalar(.45);
  const api = {
    mesh,
    set(xa, xb, z = 0) { return api.setPath(xa, z, xb, z); },
    setPath(ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      x0 = ax; z0 = az; if (len > 1e-6) { ux = dx / len; uz = dz / len; } yaw = Math.atan2(-uz, ux);   // a yaw θ about +y turns +x into (cos θ, 0, -sin θ)
      n = Math.min(max, Math.max(1, Math.floor(len / pitch)));
      for (let i = n; i < max; i++) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); } api.update(0); mesh.count = max; return api;
    },
    show(v) { mesh.visible = !!v; return api; },
    update(now) {
      if (!mesh.visible) return; const T = now / 1000; _q.setFromAxisAngle(UP, yaw);
      for (let i = 0; i < n; i++) { const w = Math.sin(T * 4 - i * .9) * .5 + .5; const k = size * (.8 + .3 * w); _p.set(x0 + ux * (i + .5) * pitch, .04, z0 + uz * (i + .5) * pitch); _s.set(k, 1, k); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.copy(dim).lerp(base, w)); }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); if (!pp) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
  return api;
}
