import * as THREE from 'three';
import { aimDirection, normalizeAngle, AIM_DEFAULT, type AimAngles, type Axis } from '../sim/aim';

export const GIMBAL_AXES: readonly Axis[] = ['x', 'y', 'z'] as const;

const RING_COLORS: Record<Axis, number> = { x: 0xff5252, y: 0x66ff8c, z: 0x5aa2ff };
const RING_SEGMENTS = 64;
const HIT_TUBE = 0.06;

// Orthonormal (u, v) basis per axis such that u × v = axis (right-hand angle
// growth: sweeping the pointer from u toward v is a positive rotation).
const RING_BASIS: Record<Axis, [THREE.Vector3, THREE.Vector3]> = {
  x: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  y: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
  z: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
};

const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function ringPoints(radius: number, axis: Axis): THREE.Vector3[] {
  const [u, v] = RING_BASIS[axis];
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    pts.push(new THREE.Vector3().addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius));
  }
  return pts;
}

/**
 * Attitude gizmo: three coloured rings around the rocket. Rings stay
 * world-aligned (they show the rotation axes); the rocket itself rotates.
 * Each ring group carries a fat invisible torus for pointer hit-testing and a
 * label anchor sitting on the ring.
 */
export function buildGimbal(rocketHeightM: number): THREE.Group {
  const root = new THREE.Group();
  root.userData.isGimbal = true;
  const radius = Math.max(0.35, Math.min(rocketHeightM * 0.45, 0.8));
  for (const axis of GIMBAL_AXES) {
    const grp = new THREE.Group();
    grp.userData = { axis, isGimbalRing: true };

    const geo = new THREE.BufferGeometry().setFromPoints(ringPoints(radius, axis));
    const mat = new THREE.LineBasicMaterial({ color: RING_COLORS[axis], depthTest: false, transparent: true, opacity: 0.95 });
    const ring = new THREE.LineLoop(geo, mat);
    ring.renderOrder = 999;
    grp.add(ring);

    // Fat invisible hit proxy sharing the ring's path.
    const hitGeo = new THREE.TorusGeometry(radius, HIT_TUBE, 8, 48);
    const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.userData = { axis, isGimbalHit: true };
    hit.renderOrder = 998;
    if (axis === 'x') hit.rotation.y = Math.PI / 2;      // torus axis (local +Z) → +X
    else if (axis === 'y') hit.rotation.x = Math.PI / 2; // → +Y
    grp.add(hit);

    // Label anchor at a distinct clock position per ring.
    const [u, v] = RING_BASIS[axis];
    const anchor = new THREE.Object3D();
    anchor.position.copy(u).multiplyScalar(radius).addScaledVector(v, radius * (axis === 'x' ? 0 : 0));
    anchor.userData = { axis, isGimbalAnchor: true };
    grp.add(anchor);

    root.add(grp);
  }
  // Compose matrices now so hit-testing works before the first render frame
  // (detached groups are never auto-updated).
  root.updateMatrixWorld(true);
  return root;
}

/** Screen position + visibility for a label anchor (pure helper, DOM-free). */
export function computeLabelScreen(
  worldPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { x: number; y: number; visible: boolean } {
  const view = worldPos.clone().applyMatrix4(camera.matrixWorldInverse);
  if (view.z > -camera.near * 0.5) return { x: 0, y: 0, visible: false }; // behind the camera
  const ndc = worldPos.clone().project(camera);
  const x = (ndc.x * 0.5 + 0.5) * width;
  const y = (0.5 - ndc.y * 0.5) * height;
  const visible = ndc.x >= -1.05 && ndc.x <= 1.05 && ndc.y >= -1.05 && ndc.y <= 1.05;
  return { x, y, visible };
}

interface DragState {
  axis: Axis;
  lastAngleDeg: number;
}

/**
 * Owns the aim angles, applies them to the preview rocket (and launch rod),
 * and provides pointer-drag + exact-angle input mechanics.
 */
export class GimbalController {
  readonly angles: AimAngles = { ...AIM_DEFAULT };
  private readonly gizmo: THREE.Group;
  private readonly hitProxies: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane();
  private readonly tmpPoint = new THREE.Vector3();
  private readonly tmpCenter = new THREE.Vector3();
  private drag: DragState | null = null;
  private target: THREE.Object3D | null = null;
  private rod: THREE.Object3D | null = null;
  private changeCb: (() => void) | null = null;

  constructor(gizmo: THREE.Group) {
    this.gizmo = gizmo;
    gizmo.traverse((o) => { if (o.userData?.isGimbalHit) this.hitProxies.push(o as THREE.Mesh); });
  }

  onChange(cb: () => void): void { this.changeCb = cb; }

  private changed(): void {
    this.apply();
    this.changeCb?.();
  }

  set(axis: Axis, deg: number): void {
    this.angles[axis] = normalizeAngle(deg);
    this.changed();
  }

  nudge(axis: Axis, deltaDeg: number): void {
    this.angles[axis] = normalizeAngle(this.angles[axis] + deltaDeg);
    this.changed();
  }

  reset(): void {
    this.angles.x = AIM_DEFAULT.x;
    this.angles.y = AIM_DEFAULT.y;
    this.angles.z = AIM_DEFAULT.z;
    this.changed();
  }

  normalize(): void {
    this.angles.x = normalizeAngle(this.angles.x);
    this.angles.y = normalizeAngle(this.angles.y);
    this.angles.z = normalizeAngle(this.angles.z);
    this.changed();
  }

  /** Unit launch direction (same math as the sim — single source of truth). */
  direction(): { x: number; y: number; z: number } {
    return aimDirection(this.angles);
  }

  /** Rocket (or any object) whose orientation mirrors the aim. */
  applyTo(obj: THREE.Object3D): void {
    this.target = obj;
    this.apply();
  }

  /** Launch rod tilts with the rocket (it is the aim rail). */
  attachRod(rodGroup: THREE.Object3D): void {
    this.rod = rodGroup;
    this.apply();
  }

  private apply(): void {
    const d = THREE.MathUtils.degToRad;
    for (const obj of [this.target, this.rod]) {
      if (!obj) continue;
      obj.rotation.order = 'XYZ';
      obj.rotation.set(d(this.angles.x), d(this.angles.y), d(this.angles.z));
    }
  }

  /** Which ring (if any) does this ray touch? Nearest hit wins. */
  hitTest(ray: THREE.Ray): Axis | null {
    this.raycaster.ray.copy(ray);
    const hits = this.raycaster.intersectObjects(this.hitProxies, false);
    return hits.length > 0 ? (hits[0].object.userData.axis as Axis) : null;
  }

  private currentAngleDeg(axis: Axis, ray: THREE.Ray, fallbackNormal?: THREE.Vector3): number | null {
    this.gizmo.getWorldPosition(this.tmpCenter);
    const normal = AXIS_VEC[axis];
    this.plane.setFromNormalAndCoplanarPoint(normal, this.tmpCenter);
    let point: THREE.Vector3 | null = ray.intersectPlane(this.plane, this.tmpPoint);
    if (!point && fallbackNormal && Math.abs(ray.direction.dot(normal)) > 0.99) {
      // Looking down the axis: the ring plane is edge-on. Use a plane facing
      // the camera through the same center so the drag still tracks.
      this.plane.setFromNormalAndCoplanarPoint(fallbackNormal.clone().normalize(), this.tmpCenter);
      point = ray.intersectPlane(this.plane, this.tmpPoint);
    }
    if (!point) return null;
    const rel = point.clone().sub(this.tmpCenter);
    const [u, v] = RING_BASIS[axis];
    return Math.atan2(rel.dot(v), rel.dot(u)) * 180 / Math.PI;
  }

  /** Start (or try to start) a drag; false if the ray cannot seed an angle. */
  beginDrag(axis: Axis, ray: THREE.Ray, fallbackNormal?: THREE.Vector3): boolean {
    const a = this.currentAngleDeg(axis, ray, fallbackNormal);
    if (a === null) { this.drag = null; return false; }
    this.drag = { axis, lastAngleDeg: a };
    return true;
  }

  /** Move the drag; returns the applied delta in degrees (0 when not dragging). */
  dragTo(ray: THREE.Ray, fallbackNormal?: THREE.Vector3): number {
    if (!this.drag) return 0;
    const a = this.currentAngleDeg(this.drag.axis, ray, fallbackNormal);
    if (a === null) return 0; // keep the last angle; wait for a usable ray
    const delta = normalizeAngle(a - this.drag.lastAngleDeg);
    this.drag.lastAngleDeg = a;
    if (delta !== 0) this.nudge(this.drag.axis, delta);
    return delta;
  }

  endDrag(): void { this.drag = null; }
  get dragging(): boolean { return this.drag !== null; }
}

/** Browser-side wiring: pointer drags, HTML labels, exact-angle input. */
export interface GimbalDomOptions {
  camera: THREE.PerspectiveCamera;
  /** Canvas owning pointer events (OrbitControls' element). */
  dom: HTMLElement;
  /** Where label divs and the angle input live (UI layer). */
  labelContainer: HTMLElement;
  lockControls(): void;
  unlockControls(): void;
}

const DRAG_THRESHOLD_PX = 3;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST_PX = 30;

interface PendingDrag {
  axis: Axis;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  began: boolean;
}

export function attachGimbalControls(
  controller: GimbalController,
  gizmo: THREE.Group,
  opts: GimbalDomOptions,
): { updateLabels(): void; dispose(): void } {
  const { camera, dom, labelContainer } = opts;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const camDir = new THREE.Vector3();
  const worldPos = new THREE.Vector3();

  const labels = new Map<Axis, HTMLDivElement>();
  for (const axis of GIMBAL_AXES) {
    const el = document.createElement('div');
    el.className = 'rkt-gizmo-label';
    el.style.color = `#${RING_COLORS[axis].toString(16).padStart(6, '0')}`;
    labelContainer.appendChild(el);
    labels.set(axis, el);
  }

  const inputWrap = document.createElement('div');
  inputWrap.className = 'rkt-gizmo-input';
  inputWrap.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'off';
  inputWrap.appendChild(input);
  labelContainer.appendChild(inputWrap);
  let inputAxis: Axis | null = null;

  const anchors = new Map<Axis, THREE.Object3D>();
  gizmo.traverse((o) => { if (o.userData?.isGimbalAnchor) anchors.set(o.userData.axis as Axis, o); });

  function rayFromEvent(e: PointerEvent): THREE.Ray | null {
    const rect = dom.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray;
  }

  let pending: PendingDrag | null = null;
  let lastTap = { time: 0, x: 0, y: 0 };
  let hoverAxis: Axis | null = null;

  // Hover-lock: while the pointer rests on a ring, OrbitControls stays
  // disabled. Its own pointerdown listener registers earlier (it is built
  // with the scene), so disabling only at drag-start would lose the race.
  function updateHover(e: PointerEvent): void {
    if (inputAxis) return;
    const ray = rayFromEvent(e);
    const axis = ray ? controller.hitTest(ray) : null;
    if (axis === hoverAxis) return;
    hoverAxis = axis;
    if (axis) opts.lockControls();
    else opts.unlockControls();
    dom.style.cursor = axis ? 'grab' : '';
  }

  function closeInput(): void {
    inputAxis = null;
    inputWrap.style.display = 'none';
  }

  function openInput(axis: Axis, x: number, y: number): void {
    inputAxis = axis;
    input.value = String(Math.round(controller.angles[axis]));
    inputWrap.style.display = 'block';
    inputWrap.style.left = `${x + 12}px`;
    inputWrap.style.top = `${Math.max(4, y - 28)}px`;
    input.focus();
    input.select();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = parseFloat(input.value);
      if (Number.isFinite(v) && inputAxis) controller.set(inputAxis, v);
      closeInput();
    } else if (e.key === 'Escape') {
      closeInput();
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', closeInput);

  function onPointerDown(e: PointerEvent): void {
    if (inputAxis) return; // typing an exact angle: ignore stray pointers
    const ray = rayFromEvent(e);
    if (!ray) return;
    const axis = controller.hitTest(ray);
    if (!axis) return;

    if (e.pointerType === 'touch') {
      const now = performance.now();
      const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_DIST_PX;
      if (now - lastTap.time < DOUBLE_TAP_MS && near) {
        lastTap.time = 0;
        openInput(axis, e.clientX, e.clientY);
        return;
      }
      lastTap = { time: now, x: e.clientX, y: e.clientY };
    }

    try { dom.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
    opts.lockControls();
    pending = { axis, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, began: false };
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pending || e.pointerId !== pending.pointerId) {
      if (!pending) updateHover(e);
      return;
    }
    if (!pending.moved) {
      if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < DRAG_THRESHOLD_PX) return;
      pending.moved = true;
    }
    const ray = rayFromEvent(e);
    if (!ray) return;
    camera.getWorldDirection(camDir);
    if (!pending.began) {
      pending.began = controller.beginDrag(pending.axis, ray, camDir);
      if (!pending.began) return;
    }
    controller.dragTo(ray, camDir);
  }

  function endPending(e: PointerEvent): void {
    if (!pending || e.pointerId !== pending.pointerId) return;
    try { dom.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    controller.endDrag();
    pending = null;
    hoverAxis = null;
    updateHover(e); // re-lock if the pointer still rests on a ring
  }

  function onDblClick(e: MouseEvent): void {
    const ray = rayFromEvent(e as unknown as PointerEvent);
    if (!ray) return;
    const axis = controller.hitTest(ray);
    if (axis) openInput(axis, e.clientX, e.clientY);
  }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', endPending);
  dom.addEventListener('pointercancel', endPending);
  dom.addEventListener('dblclick', onDblClick);

  function updateLabels(): void {
    if (inputAxis) return; // input popup owns the screen space
    const rect = dom.getBoundingClientRect();
    for (const axis of GIMBAL_AXES) {
      const el = labels.get(axis)!;
      const anchor = anchors.get(axis);
      if (!anchor) continue;
      anchor.getWorldPosition(worldPos);
      const s = computeLabelScreen(worldPos, camera, rect.width, rect.height);
      if (!s.visible) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = `${rect.left + s.x}px`;
      el.style.top = `${rect.top + s.y}px`;
      el.textContent = `${axis.toUpperCase()} ${Math.round(controller.angles[axis])}°`;
    }
  }

  function dispose(): void {
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', endPending);
    dom.removeEventListener('pointercancel', endPending);
    dom.removeEventListener('dblclick', onDblClick);
    closeInput();
    for (const el of labels.values()) el.remove();
    inputWrap.remove();
    controller.endDrag();
    hoverAxis = null;
    dom.style.cursor = '';
    opts.unlockControls();
  }

  return { updateLabels, dispose };
}
