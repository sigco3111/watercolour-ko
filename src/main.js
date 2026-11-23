// Watercolour: a glade drawn in pencil on a sheet of paper, and a small wanderer who brings the paint with them.
//   ?painted       the whole page is painted from the start
//   ?capture       no clock: window.lab.step(dt, n) advances it (for stills and films)
//   ?px=5          how far apart the pencil's strokes are, in pixels at 1080
import * as THREE from 'three';
import { patchBlock } from 'patch-block';
import recipe from '../recipe.json';
import RAPIER from './figure/rapier/rapier.mjs';
import { createWash } from './wash.js';
import { createFigure } from './hood.js';
import { createWorld } from './glade/world.js';
import { createPage } from './page.js';
import { Animator } from './figure/animator.js';
import { Player } from './figure/player.js';
import { Input } from './figure/input.js';
import { Follow } from './figure/camera.js';

const q = new URLSearchParams(location.search);
const capture = q.has('capture');
const timings = {};
let mark = performance.now();
const lap = (name) => { const now = performance.now(); timings[name] = Math.round(now - mark); mark = now; };
const loading = document.getElementById('loading');
// Patch's page talks to the demo through this. There are no controls; it carries loading, ready and hiding.
let shown = true, loaded = false, told = 0.02;
const block = patchBlock({ ...recipe.block, onSet() {}, onTrigger() {}, onVisible(visible) { shown = visible; if (loaded) run(); } });
const say = (text) => { told = Math.min(0.95, told + 0.11); if (loading) loading.textContent = text; block.progress(told, text); };
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(capture ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('view').appendChild(renderer.domElement);
// Listened for from the start, not once loaded: the page may go fullscreen while the drawing is still being made.
// The camera and the finishing passes join in once they exist.
const fitting = [];
let fitW = 0, fitH = 0;
function fitView() {
  fitW = innerWidth; fitH = innerHeight;
  const now = renderer.getSize(new THREE.Vector2());
  if (now.x !== innerWidth || now.y !== innerHeight) renderer.setSize(innerWidth, innerHeight);
  for (const fit of fitting) fit();
}
addEventListener('resize', fitView);

const scene = new THREE.Scene();
lap('start');

say('연필을 깎는 중');
await turn();
const pencil = createWash();
const PX = q.has('px') ? +q.get('px') : 4.6;
const fitInk = () => { pencil.px.value = (PX * renderer.getDrawingBufferSize(new THREE.Vector2()).y) / 1080; };
fitInk();
fitting.push(fitInk);
lap('ink');
const dollComing = createFigure({ line: pencil.always, both: pencil.alwaysBoth }, () => {});
const world = await createWorld({ pencil, renderer, scene, say, turn });
const ground = world.ground;
if (q.has('painted')) world.paintAll();
const camera = new THREE.PerspectiveCamera(world.fov, innerWidth / innerHeight, 0.3, world.far);
fitting.push(() => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
lap('world');

await RAPIER.init();
const physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
{
  const { cells, size, centre: [cx, cz] } = world.field, heights = new Float32Array((cells + 1) * (cells + 1));
  for (let col = 0; col <= cells; col++) for (let row = 0; row <= cells; row++) heights[row + col * (cells + 1)] = ground(cx - size / 2 + (col / cells) * size, cz - size / 2 + (row / cells) * size);
  physics.createCollider(RAPIER.ColliderDesc.heightfield(cells, cells, heights, { x: size, y: 1, z: size }).setTranslation(cx, 0, cz));
  for (const c of world.colliders) physics.createCollider(RAPIER.ColliderDesc.cylinder(c.h / 2, c.r).setTranslation(c.x, ground(c.x, c.z) + c.h / 2, c.z));
  for (const b of world.boxes) physics.createCollider(RAPIER.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z).setRotation({ x: 0, y: Math.sin(b.turn / 2), z: 0, w: Math.cos(b.turn / 2) }));
}
lap('physics');

say('붓을 적시는 중');
const doll = await dollComing;
const { man } = doll;
scene.add(doll.group);
doll.follow();
const animator = new Animator(man);
const START = world.start;
const spawn = new THREE.Vector3(START.x, ground(START.x, START.z), START.z);
const player = new Player({ RAPIER, world: physics, man, animator, spawn, yaw: START.yaw });
const follow = new Follow(camera);
Object.assign(follow, { yaw: START.yaw, ...world.follow, distance: world.follow.want });
const input = new Input(renderer.domElement, { pads: !capture && !q.has('nopad') });
physics.step();
lap('doll');

const post = createPage(renderer);
if (q.has('wet')) post.wet.value = +q.get('wet'); // ?wet=0: every edge crisp
fitting.push(() => post.resize());

// the air: a light wind off the sea, never quite steady
const air = (x, y, z, out) => out.set(0.7 + 0.5 * Math.sin(time * 0.7 + z), 0, 0.35 * Math.cos(time * 0.5 + x));
let time = 0;

function place(x, z, yaw) {
  const y = ground(x, z), half = player.halfHeight();
  player.body.setTranslation({ x, y: y + player.t.radius + half + 0.05, z }, true);
  physics.propagateModifiedBodyPositionsToColliders();
  player.feet.set(x, y, z); player.prevFeet.copy(player.feet); player.visualY = y;
  player.vel.set(0, 0, 0); player.speed = 0; player.mode = 'move'; player.grounded = true;
  player.yaw = player.lastYaw = yaw;
  animator.lock = null; animator.lockOff = null;
  animator.enter(animator.locoState({ strafe: false }), 0.05);
}

const lab = { focus: null };
const chest = new THREE.Vector3();
function tick(dt) {
  dt = Math.min(dt, 1 / 20);
  time += dt;
  const inp = input.read(dt);
  player.update(dt, inp, follow.yaw);
  if (player.feet.y < -6) place(spawn.x, spawn.z, START.yaw); // off the edge of the table
  const root = player.visualRoot(dt);
  man.object.position.copy(root);
  man.object.rotation.set(0, player.yaw, 0);
  man.object.updateMatrixWorld(true);
  const local = player.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -player.yaw);
  animator.update(dt, { speed: player.mode === 'move' ? player.speed : Math.hypot(local.x, local.z), moveAngle: player.moveAngle, grounded: player.grounded });
  animator.relaxHands(player.speed);
  animator.uprightTrunk(dt, player.speed, player.grounded && player.mode !== 'jump' && player.mode !== 'air' ? 1 : 0.3);
  const lookW = player.mode === 'move' || player.mode === 'idleExtra' ? THREE.MathUtils.clamp(1 - (player.speed - 1.5) / 2, 0, 1) : 0;
  animator.lookToward(dt, camera.getWorldDirection(new THREE.Vector3()), lookW);
  animator.armClearance(dt);
  if (player.mode === 'move' && !player.strafe) animator.leanInto(dt, player.turnRate, player.speed, player.accelF);
  else animator.leanInto(dt, 0, 0, 0);
  const onGround = player.grounded && player.mode !== 'jump' && player.mode !== 'air';
  animator.placeFeet(dt, (x, z, from) => player.ground(x, z, from, 1.4), root.y, onGround ? 1 : 0);
  man.object.updateMatrixWorld(true);
  // (the cape asks where the ground is thousands of times a frame: it is told the slope he is standing on, once)
  const g0 = ground(root.x, root.z), gx = (ground(root.x + 0.7, root.z) - ground(root.x - 0.7, root.z)) / 1.4, gz = (ground(root.x, root.z + 0.7) - ground(root.x, root.z - 0.7)) / 1.4;
  doll.simulate(dt, air, (x, z) => g0 + gx * (x - root.x) + gz * (z - root.z));

  doll.follow();
  doll.pose();

  follow.update(dt, root, inp.look, inp.zoom, (o, d, max) => {
    const hit = player.castRay(o, d, max);
    // (the wall he can't see at the cliff's edge is nothing to the eye)
    return hit != null && o.y + d.y * hit - ground(o.x + d.x * hit, o.z + d.z * hit) > 0.5 && !world.open?.(o.x + d.x * hit, o.z + d.z * hit) ? hit : null;
  }, (x, z) => ground(x, z) + 0.15);
  camera.updateMatrixWorld(true);
  world.update(dt, root, camera);
  post.render(scene, camera);
}

window.lab = Object.assign(lab, {
  THREE, player, follow, camera, input, animator, doll, post, renderer, scene, timings, ground, world,
  counts: world.counts, way: world.way, heightAt: ground,
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) tick(dt); },
  setInput(fn) { input.override = fn; },
  /** Puts him at (x, z) on the ground, facing (fx, fz), with the eye behind him. */
  teleport(x, z, fx, fz) {
    place(x, z, Math.atan2(fx - x, fz - z));
    follow.yaw = player.yaw; follow.pivot.set(0, 0, 0);
    tick(1 / 60);
  },
  /** A fixed view for stills: eye and what it looks at (and focuses on). Call with nothing to follow him again. */
  view(eye, target) { follow.free = eye ? { position: new THREE.Vector3(...eye), target: new THREE.Vector3(...target) } : null; },
});

say('먼지를 털어내는 중');
await turn();
if (!capture) await renderer.compileAsync(scene, camera);
lap('shaders');
// The first frames are drawn before Patch is told the demo is ready, and each is waited for: the card builds a
// good deal the first time it draws a thing, after JavaScript has gone on, and that must not land after ready.
function gpuDone() {
  const gl = renderer.getContext(), sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) return void setTimeout(poll, 4);
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
}
timings.warm = [];
for (let i = 0; i < (capture ? 3 : 6); i++) {
  const t = performance.now();
  tick(1 / 60);
  if (!capture) { await gpuDone(); say('먼지를 털어내는 중'); await turn(); }
  timings.warm.push(Math.round(performance.now() - t));
}
lap('first frames');

let last = performance.now();
function run() {
  last = performance.now();
  // (every frame also looks at the window's size itself, in case a resize was ever missed)
  renderer.setAnimationLoop(shown && !capture ? () => { if (innerWidth !== fitW || innerHeight !== fitH) fitView(); const now = performance.now(); tick((now - last) / 1000); last = now; if ((timings.live ??= []).length < 6) timings.live.push(Math.round(performance.now() - now)); } : null);
}
fitView();
loaded = true;
run();
if (!capture) {
  const hint = document.getElementById('hint');
  addEventListener('keydown', (e) => { if (e.code === 'KeyH') hint.classList.toggle('off'); });
  setTimeout(() => hint.classList.add('faded'), 9000);
} else document.getElementById('hint')?.remove();
loading?.remove();
document.getElementById('caption')?.classList.remove('off');
block.ready();
lab.ready = true;
// for the measuring tools
window.__block = { ready: true, block, timings, set() {} };
