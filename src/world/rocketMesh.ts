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
  // Tumble-recovery rockets have chuteDiameterM 0; keep the geometry valid
  // (the canopy stays hidden for them — chuteDeployed never flips).
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
