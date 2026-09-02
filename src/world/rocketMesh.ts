import * as THREE from 'three';
import type { Rocket } from '../sim/types';

export function buildRocketMesh(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  const L = rocket.look;
  // True scale: 1 world unit = 1 meter. The reference lineup beside the pad
  // (and the sim) both read real dimensions, so no minimums here.
  const radius = rocket.diameterM / 2;
  const bodyLen = L.bodyLengthM;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, bodyLen, 12),
    new THREE.MeshLambertMaterial({ color: L.bodyColor }),
  );
  body.position.y = bodyLen / 2;
  g.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(radius, radius * 3, 12),
    new THREE.MeshLambertMaterial({ color: L.noseColor }),
  );
  nose.position.y = bodyLen + radius * 1.5;
  g.add(nose);

  const finMat = new THREE.MeshLambertMaterial({ color: L.finColor, side: THREE.DoubleSide });
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(radius * 2, 0);
  finShape.lineTo(radius * 2, radius * 1.5); finShape.lineTo(0, radius * 3); finShape.lineTo(0, 0);
  const finGeo = new THREE.ShapeGeometry(finShape);
  for (let i = 0; i < L.finCount; i++) {
    const fin = new THREE.Mesh(finGeo, finMat);
    const angle = (i / L.finCount) * Math.PI * 2;
    fin.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    fin.rotation.y = -angle;
    g.add(fin);
  }
  // Local Y of the nose tip, plus the dims recovery/effect visuals need.
  g.userData.topY = bodyLen + radius * 3;
  g.userData.radius = radius;
  g.userData.bodyLen = bodyLen;
  return g;
}

export function buildParachute(color = 0xff5533, chuteDiameterM = 1): THREE.Mesh {
  // Tumble/streamer-only rockets have chuteDiameterM 0; keep the geometry valid
  // (the canopy stays hidden because visibility keys on the resolved device
  // list, not on this builder's diameter).
  const radiusM = Math.max(0.05, chuteDiameterM / 2);
  const geo = new THREE.SphereGeometry(radiusM, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  mesh.userData.radiusM = radiusM;
  return mesh;
}

export function buildFlame(rocket: Rocket): THREE.Mesh {
  const radius = Math.max(0.012, (rocket.diameterM / 2) * 1.2);
  const len = Math.max(0.1, rocket.look.bodyLengthM * 0.9);
  const geo = new THREE.ConeGeometry(radius, len, 8);
  geo.rotateX(Math.PI); // point downward
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffa500 }));
  // Bake the nozzle position: base flush with y=0, tip hanging at -len.
  mesh.position.y = -len / 2;
  return mesh;
}

/** Cloth-strip streamer: a chain of small hinged blocks standing above the
 * nose, true-scale, waving like a crepe ribbon in the descent airflow. */
export function buildStreamer(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  g.userData.isStreamer = true;
  const len = Math.max(0.5, rocket.look.bodyLengthM * 1.5);
  const width = Math.max(0.025, rocket.diameterM * 0.9);
  const segments = 10;
  const segLen = len / segments;
  const mat = new THREE.MeshLambertMaterial({ color: 0xff8c1a, side: THREE.DoubleSide });
  let parent: THREE.Object3D = g;
  for (let i = 0; i < segments; i++) {
    const pivot = new THREE.Group();
    pivot.userData.isStreamerSegment = i; // tag pivots only, never the blocks
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, segLen, 0.004), mat);
    // Each block climbs up from its hinge so the chain stands off the nose.
    block.geometry.translate(0, segLen / 2, 0);
    pivot.add(block);
    // The next hinge sits at this block's tip, so rotations compound.
    if (i > 0) pivot.position.y = segLen;
    parent.add(pivot);
    parent = pivot;
  }
  g.userData.segmentCount = segments;
  return g;
}

/** Helicopter recovery rotor: two crossed blades on a hub at the nose tip. */
export function buildRotor(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  g.userData.isRotor = true;
  const bladeLen = Math.min(1.4, Math.max(0.5, rocket.look.bodyLengthM * 1.5));
  const bladeW = Math.max(0.02, rocket.diameterM * 0.5);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0xd0d4da, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeLen, 0.004, bladeW), bladeMat);
    blade.rotation.y = (i * Math.PI) / 2; // crossed pair
    // A touch of pitch so the spin reads as autorotation.
    blade.rotation.z = 0.08;
    g.add(blade);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(Math.max(0.006, rocket.diameterM * 0.18), Math.max(0.006, rocket.diameterM * 0.18), 0.012, 8),
    new THREE.MeshLambertMaterial({ color: 0x3d3d42 }),
  );
  g.add(hub);
  return g;
}

/** Pop-out glider wings: a main wing at mid-body plus a small canard near the nose. */
export function buildGliderWings(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  g.userData.isGliderWings = true;
  const span = Math.min(1.8, Math.max(0.7, rocket.look.bodyLengthM * 2));
  const chord = Math.max(0.06, rocket.diameterM * 1.2);
  const mat = new THREE.MeshLambertMaterial({ color: 0xf5f5dc, side: THREE.DoubleSide });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(span, 0.004, chord), mat);
  wing.position.y = rocket.look.bodyLengthM * 0.55;
  g.add(wing);
  const canard = new THREE.Mesh(new THREE.BoxGeometry(span * 0.5, 0.003, chord * 0.6), mat);
  canard.position.y = rocket.look.bodyLengthM * 0.85;
  g.add(canard);
  return g;
}
