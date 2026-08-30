import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SkySystem } from '../../src/world/sky';
import { DAY_LENGTH_SEC, moonDirection, phaseAt } from '../../src/world/daynight';

const findMoonGroup = (root: THREE.Group): THREE.Group => {
  const groups = root.children.filter((c): c is THREE.Group => c instanceof THREE.Group);
  expect(groups.length).toBe(1); // the moon is the only Group
  return groups[0];
};

describe('SkySystem scene graph', () => {
  it('moon group is visible, positioned, and front-facing when the moon is up', () => {
    const root = new THREE.Group();
    const startPhase = 0.62; // moon high at this phase
    const sys = new SkySystem(root, startPhase, 7);
    const elapsed = DAY_LENGTH_SEC * 0.01;
    sys.update(0, elapsed);

    const phase = phaseAt(startPhase, elapsed);
    const md = moonDirection(phase);
    expect(md.y).toBeGreaterThan(0);

    const moon = findMoonGroup(root);
    expect(moon.visible).toBe(true);
    expect(moon.position.x).toBeCloseTo(md.x * 3400, 0);
    expect(moon.position.y).toBeCloseTo(md.y * 3400, 0);
    expect(moon.position.z).toBeCloseTo(md.z * 3400, 0);

    // The disc plane's +Z (its face normal) must point back towards the world
    // origin (where the camera lives) after lookAt.
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(moon.quaternion);
    const toOrigin = moon.position.clone().negate().normalize();
    expect(normal.dot(toOrigin)).toBeGreaterThan(0.99);
  });

  it('dome vertex colors carry the horizon->zenith gradient after update', () => {
    const root = new THREE.Group();
    const sys = new SkySystem(root, 0.25, 7); // noon
    sys.update(0, 0);

    const dome = root.children.find((c) => c instanceof THREE.Mesh && (c as THREE.Mesh).geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
    expect(dome).toBeTruthy();
    const col = dome.geometry.getAttribute('color');
    const pos = dome.geometry.getAttribute('position');
    // The top-most vertex must differ from a bottom (below-horizon) vertex.
    let topI = -1, botI = -1, topY = -Infinity, botY = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > topY) { topY = y; topI = i; }
      if (y < botY) { botY = y; botI = i; }
    }
    const top = new THREE.Vector3().fromBufferAttribute(col, topI);
    const bot = new THREE.Vector3().fromBufferAttribute(col, botI);
    expect(top.distanceTo(bot)).toBeGreaterThan(0.05);
  });

  it('stars fade in at night and out by day', () => {
    const root = new THREE.Group();
    const sys = new SkySystem(root, 0.75, 7); // midnight
    sys.update(0, 0);
    const stars = root.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((stars.material as THREE.PointsMaterial).opacity).toBeGreaterThan(0.5);

    const dayRoot = new THREE.Group();
    const sys2 = new SkySystem(dayRoot, 0.25, 7);
    sys2.update(0, 0);
    const s2 = dayRoot.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((s2.material as THREE.PointsMaterial).opacity).toBeLessThan(0.05);
    expect(s2.visible).toBe(false);
  });

  it('moon hides below the horizon at noon', () => {
    const root = new THREE.Group();
    const sys = new SkySystem(root, 0.25, 7); // noon -> moon below
    sys.update(0, 0);
    expect(findMoonGroup(root).visible).toBe(false);
  });

  it('moon group must not carry renderOrder (groupOrder sorts before dome)', () => {
    // A Group's renderOrder becomes its children's groupOrder, which the opaque
    // sort compares BEFORE renderOrder. A group order above the dome's would
    // hoist the moon behind the dome draw and the dome would paint over it.
    const root = new THREE.Group();
    const sys = new SkySystem(root, 0.62, 7);
    sys.update(0, 0);
    const moon = findMoonGroup(root);
    expect(moon.renderOrder).toBe(0);
    const dome = root.children.find((c) => c instanceof THREE.Mesh && (c as THREE.Mesh).geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
    const disc = moon.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    // Effective sort key of the disc must come after the dome's.
    expect(disc.renderOrder).toBeGreaterThan(dome.renderOrder);
  });
});
