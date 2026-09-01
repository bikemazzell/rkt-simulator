import * as THREE from 'three';

/**
 * Amber altitude marker for the "hit target altitude" challenge: a flat ring
 * at the target height plus a faint disc and a beacon line from the pad, so
 * the player can see the rocket pass through and above the target.
 *
 * The group is positioned at `baseY + altitudeM`; the beacon's local points
 * span from the ring down to the pad.
 */
export function buildTargetAltitudeRing(altitudeM: number, baseY: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = baseY + altitudeM;
  g.userData.isTargetRing = true;
  g.userData.altitudeM = altitudeM;

  const amber = 0xffb300;

  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(9, 0.18, 8, 48),
    new THREE.MeshBasicMaterial({ color: amber, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  torus.rotation.x = Math.PI / 2; // lay flat (XZ plane)
  torus.userData.isTargetRingTorus = true;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshBasicMaterial({
      color: amber, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.userData.isTargetRingDisc = true;

  const beaconGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -altitudeM, 0),
    new THREE.Vector3(0, 0, 0),
  ]);
  const beacon = new THREE.Line(
    beaconGeo,
    new THREE.LineBasicMaterial({ color: amber, transparent: true, opacity: 0.3 }),
  );
  beacon.userData.isTargetRingBeacon = true;

  g.add(torus, disc, beacon);
  return g;
}
