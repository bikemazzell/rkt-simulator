import * as THREE from 'three';
import type { Rocket } from '../sim/types';
import { pickReferences, SCALE_REFERENCES, totalHeightM, type ScaleRef } from './scaleRefs';

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

/**
 * Blocky stand-in meshes for the reference ladder. Each builder returns a
 * group whose bounding box spans roughly (±lengthM/2, 0..heightM, small z).
 */
function buildRefMesh(ref: ScaleRef): THREE.Group {
  const g = new THREE.Group();
  switch (ref.id) {
    case 'soda-can': {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 10), mat(0xc0c0c0));
      can.position.y = 0.061;
      g.add(can);
      break;
    }
    case 'wine-bottle': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.22, 10), mat(0x2e6b34));
      body.position.y = 0.11;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 8), mat(0x2e6b34));
      neck.position.y = 0.26;
      g.add(body, neck);
      break;
    }
    case 'dog': {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.5), mat(0x8a6642));
      torso.position.y = 0.48;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.2), mat(0x8a6642));
      head.position.set(0, 0.52, 0.32);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), mat(0x8a6642));
      tail.position.set(0, 0.56, -0.32);
      for (const [lx, lz] of [[-0.07, 0.18], [0.07, 0.18], [-0.07, -0.18], [0.07, -0.18]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.36, 0.06), mat(0x74522f));
        leg.position.set(lx, 0.18, lz);
        g.add(leg);
      }
      g.add(torso, head, tail);
      break;
    }
    case 'child': {
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.12), mat(0x3a4a8a));
      legs.position.y = 0.25;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.16), mat(0xd24d57));
      torso.position.y = 0.71;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), mat(0xe8b88a));
      head.position.y = 1.03;
      g.add(legs, torso, head);
      break;
    }
    case 'cow': {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.2), mat(0xf2f2f2));
      torso.position.y = 1.2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.34), mat(0xf2f2f2));
      head.position.set(0, 1.32, 0.74);
      for (const [lx, lz] of [[-0.16, 0.42], [0.16, 0.42], [-0.16, -0.42], [0.16, -0.42]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.1), mat(0x404040));
        leg.position.set(lx, 0.475, lz);
        g.add(leg);
      }
      g.add(torso, head);
      break;
    }
    case 'car': {
      const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 4.2), mat(0x2266aa));
      bodyMesh.position.y = 0.75;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.0), mat(0x2266aa));
      cabin.position.set(0, 1.25, -0.2);
      for (const [wx, wz] of [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10), mat(0x1a1a1a));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.32, wz);
        g.add(wheel);
      }
      g.add(bodyMesh, cabin);
      break;
    }
    case 'pickup-truck': {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 5.4), mat(0x777777));
      bed.position.set(0, 1.05, -0.15);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.6), mat(0x777777));
      cab.position.set(0, 1.55, 0.9);
      for (const [wx, wz] of [[-0.85, 1.8], [0.85, 1.8], [-0.85, -1.6], [0.85, -1.6]]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 10), mat(0x1a1a1a));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.4, wz);
        g.add(wheel);
      }
      g.add(bed, cab);
      break;
    }
    case 'person':
    case 'tall-person': {
      const s = ref.heightM / 1.75;
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.8 * s, 0.2 * s), mat(0x2b4a6f));
      legs.position.y = 0.4 * s;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44 * s, 0.6 * s, 0.24 * s), mat(0xc94d4d));
      torso.position.y = 1.1 * s;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.28 * s, 0.24 * s), mat(0xe8b88a));
      head.position.y = 1.6 * s;
      g.add(legs, torso, head);
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, ref.heightM, 0.3), mat(0x888888)));
  }
  return g;
}

/**
 * Build the comparison lineup: 3–5 everyday objects in a row beside the pad,
 * plus a 1 m launch rod + blast plate next to the rocket (a real pad fixture
 * and a strong size cue). Deterministic; no rng.
 *
 * @param maxX optional row budget (+x extent, e.g. a raft edge); references
 *        whose row end would exceed it are dropped.
 */
export function buildScaleLineup(rocket: Rocket, groundY: number, maxX?: number): THREE.Group {
  const group = new THREE.Group();
  group.position.y = groundY;

  // 1 m launch rod + blast plate hugging the rocket body.
  const bodyRadius = rocket.diameterM / 2;
  const rodX = bodyRadius + 0.04;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 6), mat(0xb0b0b0));
  rod.position.set(rodX, 0.5, 0);
  rod.userData.isRod = true;
  const blastPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.18), mat(0x555555));
  blastPlate.position.set(rodX, 0.006, 0);
  blastPlate.userData.isBlastPlate = true;
  group.add(rod, blastPlate);

  const total = totalHeightM(rocket);
  const gap = 0.3;
  const x0 = 1.4; // row starts beside the pad, clear of the rocket

  const layoutEnd = (refs: ScaleRef[]) => {
    let cursor = x0;
    for (const ref of refs) cursor += ref.lengthM + gap;
    return cursor - gap;
  };

  // Under a row budget, keep the most relevant references (nearest in
  // log-height to the rocket) that fit — brackets survive, distant fills go.
  const candidates = pickReferences(total).slice().sort(
    (a, b) => Math.abs(Math.log(total / a.heightM)) - Math.abs(Math.log(total / b.heightM)),
  );
  const selected: ScaleRef[] = [];
  for (const ref of candidates) {
    const attempt = [...selected, ref].sort((a, b) => a.heightM - b.heightM);
    if (maxX === undefined || layoutEnd(attempt) <= maxX) selected.push(ref);
  }
  selected.sort((a, b) => a.heightM - b.heightM);

  let cursor = x0;
  for (const ref of selected) {
    const mesh = buildRefMesh(ref);
    mesh.userData.refId = ref.id;
    mesh.position.x = cursor + ref.lengthM / 2;
    group.add(mesh);
    cursor += ref.lengthM + gap;
  }

  return group;
}

/** Exposed for tests/UI. */
export { SCALE_REFERENCES };
