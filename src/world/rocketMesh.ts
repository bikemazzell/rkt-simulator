import * as THREE from 'three';
import type { Rocket } from '../sim/types';

export function buildRocketMesh(rocket: Rocket): THREE.Group {
  const g = new THREE.Group();
  const L = rocket.look;
  // Exaggerate diameter for visibility (rockets are thin at real scale).
  const radius = Math.max(0.4, rocket.diameterM * 12);
  const bodyLen = Math.max(3, L.bodyLengthM * 8);

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
  // Local Y of the nose tip, so recovery visuals can sit above any-size rocket.
  g.userData.topY = bodyLen + radius * 3;
  return g;
}

export function buildParachute(color = 0xff5533): THREE.Mesh {
  const geo = new THREE.SphereGeometry(4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
}

export function buildFlame(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.5, 3, 8);
  geo.rotateX(Math.PI); // point downward
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffa500 }));
  return mesh;
}
