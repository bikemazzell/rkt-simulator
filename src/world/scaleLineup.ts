import * as THREE from 'three';
import type { Rocket } from '../sim/types';
import type { Rng } from '../sim/rng';
import { pickReferences, SCALE_REFERENCES, totalHeightM, type ScaleRef } from './scaleRefs';

const mat = (color: number) => new THREE.MeshLambertMaterial({ color });

/**
 * Blocky stand-in meshes for the reference ladder. Each builder returns a
 * group whose bounding box spans roughly (±lengthM/2, 0..heightM, small z).
 */
export function buildRefMesh(ref: ScaleRef): THREE.Group {
  const g = new THREE.Group();
  switch (ref.id) {
    case 'eraser': {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), mat(0xf27ba5));
      pad.position.y = 0.015;
      g.add(pad);
      break;
    }
    case 'golf-ball': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0215, 10, 8), mat(0xffffff));
      ball.position.y = 0.0215;
      g.add(ball);
      break;
    }
    case 'baseball': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 10), mat(0xf2ede4));
      ball.position.y = 0.037;
      g.add(ball);
      break;
    }
    case 'coffee-mug': {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 12), mat(0xd94f4f));
      cup.position.y = 0.05;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.012), mat(0xd94f4f));
      handle.position.set(0.045, 0.05, 0);
      g.add(cup, handle);
      break;
    }
    case 'soda-can': {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.122, 10), mat(0xc0c0c0));
      can.position.y = 0.061;
      g.add(can);
      break;
    }
    case 'soccer-ball': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), mat(0xeeeeee));
      ball.position.y = 0.11;
      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.07), mat(0x222222));
      patch.position.y = 0.215;
      g.add(ball, patch);
      break;
    }
    case 'book': {
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.22), mat(0xb03a3a));
      bottom.position.y = 0.06;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.21), mat(0x3a5ab0));
      top.position.y = 0.18;
      g.add(bottom, top);
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
    case 'fire-hydrant': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.58, 10), mat(0xcc2222));
      body.position.y = 0.29;
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.11, 0.12, 10), mat(0xcc2222));
      dome.position.y = 0.64;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), mat(0xcc2222));
      cap.position.y = 0.7;
      const nub = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.06), mat(0xa11a1a));
      nub.position.set(0, 0.42, 0);
      g.add(body, dome, cap, nub);
      break;
    }
    case 'trash-can': {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.86, 12), mat(0x4a5560));
      bin.position.y = 0.43;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), mat(0x39424c));
      lid.position.y = 0.89;
      g.add(bin, lid);
      break;
    }
    case 'sheep': {
      const wool = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 1.05), mat(0xeeeeee));
      wool.position.y = 0.7;
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.3), mat(0x3a3a3a));
      face.position.set(0, 0.75, 0.62);
      for (const [lx, lz] of [[-0.16, 0.36], [0.16, 0.36], [-0.16, -0.36], [0.16, -0.36]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.09), mat(0x3a3a3a));
        leg.position.set(lx, 0.19, lz);
        g.add(leg);
      }
      g.add(wool, face);
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
    case 'horse': {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.5), mat(0x7a4a21));
      torso.position.y = 1.25;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.6, 0.26), mat(0x7a4a21));
      neck.position.set(0, 1.75, 0.72);
      neck.rotation.x = -0.5;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.48), mat(0x6a3f1c));
      head.position.set(0, 2.0, 0.92);
      for (const [lx, lz] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.95, 0.11), mat(0x5a3719));
        leg.position.set(lx, 0.475, lz);
        g.add(leg);
      }
      g.add(torso, neck, head);
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
    case 'door': {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.08), mat(0x8a5a33));
      panel.position.y = 1.05;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0xd9b64a));
      knob.position.set(0.32, 1.02, 0.06);
      g.add(panel, knob);
      break;
    }
    case 'house': {
      const walls = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 4.2), mat(0xd9c8a9));
      walls.position.y = 1.1;
      // Rotate the 4-sided cone so its flats (not corners) face the row.
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 0.9, 4), mat(0x8a4a32));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 2.65;
      g.add(walls, roof);
      break;
    }
    case 'elephant': {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 2.4), mat(0x9aa0a6));
      torso.position.y = 2.25;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.8), mat(0x9aa0a6));
      head.position.set(0, 2.7, 1.5);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), mat(0x8a9096));
      trunk.position.set(0, 2.1, 1.85);
      for (const ex of [-0.48, 0.48]) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.5), mat(0x8a9096));
        ear.position.set(ex, 2.75, 1.35);
        g.add(ear);
      }
      for (const [lx, lz] of [[-0.45, 0.8], [0.45, 0.8], [-0.45, -0.8], [0.45, -0.8]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.55, 0.3), mat(0x8a9096));
        leg.position.set(lx, 0.775, lz);
        g.add(leg);
      }
      g.add(torso, head, trunk);
      break;
    }
    default:
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, ref.heightM, 0.3), mat(0x888888)));
  }
  return g;
}

/**
 * Build the comparison lineup: 3–5 everyday objects in a row beside the pad,
 * plus a 1 m launch rod (orange safety tip, hex blast plate) next to the
 * rocket — a real pad fixture and a strong size cue.
 *
 * @param maxX optional row budget (+x extent, e.g. a raft edge); references
 *        whose row end would exceed it are dropped.
 * @param rng drives lineup variety; same seed → same row, new seed → new row.
 */
export function buildScaleLineup(
  rocket: Rocket,
  groundY: number,
  maxX?: number,
  rng: Rng = Math.random,
): THREE.Group {
  const group = new THREE.Group();
  group.position.y = groundY;

  // 1 m launch rod + blast plate hugging the rocket body.
  const bodyRadius = rocket.diameterM / 2;
  const rodX = bodyRadius + 0.06;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 8), mat(0xc8ccd0));
  rod.position.set(rodX, 0.5, 0);
  rod.userData.isRod = true;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.06, 8), mat(0xff6a00));
  tip.position.set(rodX, 0.97, 0);
  tip.userData.isRodTip = true;
  const blastPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 6), mat(0x3d3d42));
  blastPlate.position.set(rodX, 0.01, 0);
  blastPlate.userData.isBlastPlate = true;
  group.add(rod, tip, blastPlate);

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
  const candidates = pickReferences(total, rng).slice().sort(
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
