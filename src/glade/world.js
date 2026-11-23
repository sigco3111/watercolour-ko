// The glade: the edge of a wood in the late afternoon, a stream through it with stepping stones, and beyond the
// stream a meadow going up to one tree in blossom. All of it is there from the first as a pencil drawing. The
// paint comes with whoever walks through it (see wash.js), and stays.
//
// It is small, and everything in it is put where it is by hand: the trees, the willow at the crossing, the beds
// of flowers. Only the grass and the far wood are scattered.
//
// It is painted the way a watercolour of such a place is: a tree is boughs of leaves, each bough a pale wash, a
// darker mass behind, and then some hundreds of touches of small leaves over them, darkest inside and underneath
// and lightest toward the sun, with leaves scattered singly round its edge so that the sky shows through; the
// grass is tufts of blades of many greens, straw where it has gone to seed, dark in drifts; and the flowers have
// their petals.
import * as THREE from 'three';
import { noise, rng } from '../noise.js';
import { ball, knead, put, roll, sstep } from '../shape.js';
import { hue } from '../pencil.js';
import { NOISE, createBatch, createDabs } from '../wash.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
// the sun: low, ahead and to the left of the way through, so that the wood is lit from behind
export const SUN = V(-0.45, 0.42, -0.78).normalize();
// what the light of a bough of leaves is judged by: the sun, and the sky above
const LT = SUN.clone().multiplyScalar(0.5).add(V(0.1, 1.0, 0.25)).normalize();
const AREA = { x0: -23, x1: 23, z0: -31, z1: 25 };
const STREAM = [[-46, 9], [-27, 7], [-13, 2.5], [-3, 4.6], [5, 2.2], [14, -2], [28, 0.5], [46, -4]];
const WAY = [[8, 21], [5, 14], [1, 8.6], [-0.9, 4.0], [-2.5, -3], [1, -11], [5, -18], [7.5, -23.5]];
const STONES = [[-0.35, 6.1], [-0.6, 5.3], [-0.85, 4.5], [-1.0, 3.7], [-1.25, 2.9], [-1.5, 2.1]];
const WATER = -0.26;

const C = (hex) => new THREE.Color(hex);
// a tree's greens, from the deepest dark inside it to where the sun is on it; and a warm touch here and there
const PAL = {
  oak: { ramp: ['#1f4232', '#2f5f34', '#5a8c36', '#a0bd44', '#e0d858'].map(C), gold: C('#eebf3a') },
  birch: { ramp: ['#2a5434', '#4a803e', '#82ad42', '#c2d252', '#f0e66c'].map(C), gold: C('#f6d648') },
  fir: { ramp: ['#0f2a28', '#1b4436', '#2c6446', '#558a4e', '#98b458'].map(C) },
  willow: { ramp: ['#35633a', '#5a8c40', '#92b748', '#cbd95e', '#edee86'].map(C), gold: C('#f4e468') },
  blossom: { ramp: ['#8a3f66', '#c8648e', '#ee98b6', '#fac8d6', '#fff1f1'].map(C) },
  far: { ramp: ['#285244', '#407458', '#6a9a60', '#a2bd6c', '#d4d67c'].map(C), gold: C('#e2c452') },
  bush: { ramp: ['#1b3c2e', '#326636', '#62983a', '#aec648', '#e4da5a'].map(C), gold: C('#e6c444') },
};
const BARK = { oak: '#5c4536', birch: '#f3efe6', fir: '#4c362e', willow: '#63503a', blossom: '#4c323a', far: '#5e4c42', bush: '#5c4a3a' };
const GRASS = ['#6f9e3a', '#6f9e3a', '#86b040', '#86b040', '#a8c548', '#a8c548', '#c9d456', '#4f8436', '#4f8436', '#3a6b34', '#d8c860'];
const DARK_GRASS = ['#3a6b34', '#2c5530', '#4f8436', '#24483a', '#5f9038'], SHADE_GRASS = ['#3f6e38', '#4f7f3c', '#2f5a34', '#6a9440', '#274c36'];
const STRAW = ['#d8c860', '#c9a84c', '#e2d478', '#b8904a', '#cdb85a'];
const FLOWERS = {
  poppy: { colours: ['#e8433a', '#f0553a', '#d9352f'], size: 0.1, tall: [0.2, 0.31], petals: 4 },
  buttercup: { colours: ['#f7cf2a', '#f9d94a', '#f2bd22'], size: 0.052, tall: [0.13, 0.22], petals: 5 },
  daisy: { colours: ['#fffaf0', '#fdf3df', '#fff6e6'], size: 0.068, tall: [0.12, 0.21], petals: 13 },
  cornflower: { colours: ['#4f78d8', '#5f8ae6', '#4466c8'], size: 0.068, tall: [0.2, 0.3], petals: 8 },
  bluebell: { colours: ['#7f7ae0', '#6f8ae8', '#9a8aea', '#7a74d8'], size: 0.03, tall: [0.11, 0.18], petals: 1 },
  foxglove: { colours: ['#e56aa8', '#ee84b6', '#d9569a'], size: 0.048, tall: [0.42, 0.62], petals: 1 },
};

/** How far (x, z) is from a line through points, and how far along it the nearest place is. */
function along(line) {
  const seg = line.slice(1).map(([x1, z1], i) => { const [x0, z0] = line[i], dx = x1 - x0, dz = z1 - z0; return { x0, z0, dx, dz, l2: dx * dx + dz * dz, len: Math.hypot(dx, dz) }; });
  const starts = []; let run = 0;
  for (const s of seg) { starts.push(run); run += s.len; }
  return (x, z) => {
    let best = 1e9, at = 0;
    for (let i = 0; i < seg.length; i++) {
      const s = seg[i], t = Math.min(1, Math.max(0, ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.l2)), d = Math.hypot(x - s.x0 - s.dx * t, z - s.z0 - s.dz * t);
      if (d < best) { best = d; at = starts[i] + t * s.len; }
    }
    return [best, at];
  };
}
const streamLine = new THREE.CatmullRomCurve3(STREAM.map(([x, z]) => V(x, 0, z))).getPoints(110).map((p) => [p.x, p.z]);
const wayLine = new THREE.CatmullRomCurve3(WAY.map(([x, z]) => V(x, 0, z))).getPoints(48).map((p) => [p.x, p.z]);
const nearStream = along(streamLine), nearWay = along(wayLine);
/** 1 in the wood, 0 out on the meadow. */
const wood = (x, z) => sstep(-13.5, -6, z + 2.6 * noise(x * 0.12, 7.3) - 0.012 * x * x * 0.2);

function ground(x, z) {
  let h = 2.7 * sstep(18, 3, Math.hypot(x - 6.5, z + 25)) + 0.24 * noise(x * 0.085 + 3, z * 0.085) + 0.07 * noise(x * 0.3, z * 0.3 + 9);
  const bed = 1 - sstep(1.15, 3.5, nearStream(x, z)[0]);
  h = h * (1 - bed) - 0.64 * bed;
  for (const [sx, sz] of STONES) { const d = Math.hypot(x - sx, z - sz); if (d < 0.62) h = Math.max(h, -0.14 - 0.5 * sstep(0.34, 0.62, d)); }
  return h;
}

export async function createWorld({ pencil: wash, scene, say, turn }) {
  const group = new THREE.Group(), R = rng(2027), any = (list) => list[Math.floor(R() * list.length)];
  const solid = createBatch(wash.solid), dabs = createDabs(wash.dab, wash.dabDepth);
  const colliders = [], boxes = [], walls = [], crowns = [], a = new THREE.Color(), b = new THREE.Color(), tmp = new THREE.Color(), nrm = V(0, 1, 0), U = wash.uniforms, time = U.uNow;
  let seed = 10;
  const inside = (x, z, by = 0) => x > AREA.x0 + by && x < AREA.x1 - by && z > AREA.z0 + by && z < AREA.z1 - by;
  /** Where a far thing takes its paint from: the nearest ground that can be walked to, and slowly. */
  const farRoot = (x, z, slow = 0.1) => {
    // (the place on the edge of the walkable ground that lies toward it: so that along a far ridge the wash comes
    // round evenly, and not all at once from one corner)
    const cz = (AREA.z0 + AREA.z1) / 2, s = Math.min(1, (AREA.x1 - 2) / Math.max(1e-6, Math.abs(x)), ((AREA.z1 - AREA.z0) / 2 - 2) / Math.max(1e-6, Math.abs(z - cz))), rx = x * s, rz = cz + (z - cz) * s;
    return [rx, ground(rx, rz), rz, slow];
  };
  /** A tree's green for how much light is on it, 0 to 1 (into tmp). */
  const ramp = (pal, t) => { t = Math.min(0.999, Math.max(0, t)) * 4; const i = Math.floor(t); return tmp.copy(pal.ramp[i]).lerp(pal.ramp[i + 1], t - i); };

  // ============================================================================================================ the sky
  say('종이를 물에 적시는 중');
  await turn();
  const skyT = { value: wash.paint.NEVER }, skyF = { value: wash.paint.NEVER };
  {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: { uNow: time, uSkyT: skyT, uSkyF: skyF, uSun: { value: SUN } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vDir; uniform vec3 uSun; uniform float uNow; uniform float uSkyT; uniform float uSkyF;
        ${NOISE}
        float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * wcNoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float up = clamp(d.y, 0.0, 1.0), toSun = max(dot(d, uSun), 0.0);
          // gold where the sun is, rose above it, and overhead a clear blue, laid in wet so that each runs into the next
          vec3 pig = mix(vec3(1.0, 0.8, 0.42), vec3(0.99, 0.74, 0.62), smoothstep(0.0, 0.2, up));
          pig = mix(pig, vec3(0.3, 0.52, 0.86), smoothstep(0.1, 0.5, up + 0.1 * (wcNoise(d * 3.0) - 0.5)));
          pig = mix(pig, vec3(1.0, 0.86, 0.5), pow(toSun, 5.0) * 0.85);
          // clouds are paper left bare, soft-edged, with a little rose and violet laid in under them
          float m = fbm(vec3(d.xz / (d.y + 0.32) * 1.05 + vec2(uNow * 0.004, 0.0), 1.0));
          float cloud = smoothstep(0.47, 0.64, m) * smoothstep(0.02, 0.16, d.y);
          float grain = wcNoise(d * 140.0) * 0.5 + wcNoise(d * 330.0) * 0.5, bloom = wcNoise(d * 5.0 + 3.0);
          float density = (0.7 + 0.5 * bloom) * (0.8 + 0.4 * grain) * (1.0 - 0.92 * cloud) * (1.0 - 0.85 * pow(toSun, 60.0));
          float age = uNow - uSkyT - acos(clamp(dot(d, normalize(uSun * vec3(1.0, 0.0, 1.0) + vec3(0.0, 0.25, 0.0))), -1.0, 1.0)) * 2.4 - (wcNoise(d * 2.3) - 0.5) * 2.2 - (wcNoise(d * 9.0) - 0.5) * 0.6;
          // (the last wash takes what is left of the sky too, from overhead down to the hills)
          age = max(age, uNow - uSkyF - acos(clamp(d.y, -1.0, 1.0)) * 1.1 - (wcNoise(d * 2.3) - 0.5) * 1.2);
          float P = smoothstep(0.0, 0.3, age), wet = 1.0 - smoothstep(0.0, 5.0, age), rim = 1.0 - smoothstep(0.04, 1.0, age);
          vec3 left = pow(pig, vec3(density * (1.0 + 0.35 * wet + 0.8 * rim)));
          left *= mix(vec3(1.0), vec3(0.86, 0.72, 0.86), smoothstep(0.4, 0.5, m) * (1.0 - cloud) * smoothstep(0.02, 0.2, d.y) * 0.4);
          gl_FragColor = vec4(mix(vec3(1.0), left, P), 1.0);
        }`,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    group.add(sky);
    wash.sky = sky;
  }

  // ========================================================================================================= the ground
  say('풍경을 그리는 중');
  await turn();
  {
    const g = new THREE.PlaneGeometry(96, 96, 240, 240).rotateX(-Math.PI / 2).translate(0, 0, -4), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    solid.add(hue(g, (x, y, z) => soil(x, z)), null, [0.5, 1, 0.42], [-0.7, 1, 0.2]);
  }
  /** The colour of the ground's first wash at (x, z). */
  function soil(x, z) {
      const w = wood(x, z), n = noise(x * 0.16 + 4, z * 0.16), m = noise(x * 0.5, z * 0.5 + 3), dry = noise(x * 0.22 + 9, z * 0.22);
      // the meadow's first washes: a yellow green, with ochre where the grass is dry and a deeper green in drifts
      a.set('#8fbb44').lerp(b.set('#c2d04a'), sstep(-0.2, 0.7, n)).lerp(b.set('#5f9a3a'), sstep(0.15, 0.8, m) * 0.7).lerp(b.set('#d2b455'), sstep(0.15, 0.75, dry) * 0.6).lerp(b.set('#3f7436'), sstep(-0.3, -0.8, dry) * 0.6);
      // the wood's floor: deeper, with last year's leaves
      a.lerp(b.set('#6f9a3e').lerp(tmp.set('#a8873f'), sstep(0.1, 0.8, n) * 0.5).lerp(tmp.set('#3a683a'), sstep(0.2, 0.8, m) * 0.5), w);
      // the way through: trodden earth
      a.lerp(b.set('#e8d3a0'), sstep(1.35, 0.45, nearWay(x, z)[0] + 0.3 * m) * 0.92);
      // the banks and the stream's bed: gravel
      a.lerp(b.set('#b8a47c'), sstep(2.9, 1.7, nearStream(x, z)[0]));
      return a;
  }
  // the stream: a ribbon of water lying in its bed
  {
    const pos = [], hat = [], col = [], index = [];
    let s = 0;
    streamLine.forEach(([x, z], i) => {
      const [ax, az] = streamLine[Math.max(0, i - 1)], [bx, bz] = streamLine[Math.min(streamLine.length - 1, i + 1)], l = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / l, tz = (bz - az) / l;
      if (i) s += Math.hypot(x - streamLine[i - 1][0], z - streamLine[i - 1][1]);
      for (let k = 0; k <= 6; k++) { const u = k / 3 - 1, w = 2.6; pos.push(x - tz * u * w, WATER, z + tx * u * w); hat.push(s, u * w); col.push(0.4, 0.6, 0.7); }
      if (i) for (let k = 0; k < 6; k++) { const a = (i - 1) * 7 + k, b = i * 7 + k; index.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('hatch', new THREE.Float32BufferAttribute(hat, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(index);
    const water = createBatch(wash.water);
    // (it takes its paint from the stepping stones, and runs with it both ways)
    water.add(g, null, undefined, undefined, [-0.9, WATER, 4.1, 0.2]);
    const mesh = water.build();
    mesh.castShadow = false;
    group.add(mesh);
  }

  // ============================================================================================================= trees
  say('숲을 스케치하는 중');
  await turn();
  /** A bough of leaves. leaf: half the size of one touch of the brush (a touch leaves four to seven leaves). dens:
   *  touches to a square metre. turn: which way the leaves lie, if they all lie one way. stretch: how long they are. */
  function clump(c, r, pal, at, { leaf = 0.17, squash = 0.74, sway = 0.5, dens = 210, turn = null, stretch = 1, loop = true } = {}) {
    // the mass behind the leaves; in the sketch, its outline
    ramp(pal, 0.1 + 0.12 * R());
    dabs.add(c.x, c.y - r * 0.1, c.z, { w: r * 0.74, h: r * 0.7 * squash, turn: R() * TAU, seed: R(), kind: 0, colour: tmp, normal: LT, at, line: loop, sway });
    // the first pale wash, which is left showing along its sunward edge
    for (let i = 0; i < 1; i++) {
      ramp(pal, 0.6 + 0.18 * R());
      dabs.add(c.x + LT.x * r * 0.3 + (R() - 0.5) * r * 0.5, c.y + r * squash * (0.3 + 0.25 * R()), c.z + LT.z * r * 0.3 + (R() - 0.5) * r * 0.5, { w: r * (0.5 + 0.2 * R()), h: r * (0.34 + 0.14 * R()), turn: R() * TAU, seed: R(), kind: 6, colour: tmp, normal: LT, at, sway });
    }
    // the leaves: over all of it, and then singly round its edge, where the sky shows between them
    const n = Math.round(dens * r * r);
    for (let i = 0; i < n * 1.32; i++) {
      const edge = i >= n, u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), k = edge ? 0.96 + 0.34 * R() : 0.35 + 0.65 * Math.cbrt(R());
      const nx = Math.cos(a) * s, nz = Math.sin(a) * s;
      const t = ((nx * LT.x + u * LT.y + nz * LT.z) * 0.5 + 0.5) * (0.3 + 0.7 * Math.min(1, k)) * 1.12 + (R() - 0.5) * 0.46 + (edge ? 0.06 : 0);
      ramp(pal, t);
      if (pal.gold && t > 0.66 && R() < 0.3) tmp.lerp(pal.gold, 0.7);
      tmp.offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.05);
      const w = leaf * (0.75 + 0.6 * R()) * (edge ? 0.78 : 1);
      nrm.set(nx, u + 0.3, nz).addScaledVector(SUN, 0.5).normalize();
      dabs.add(c.x + nx * r * k, c.y + u * r * squash * k, c.z + nz * r * k, { w, h: w * stretch, turn: turn == null ? R() * TAU : turn + (R() - 0.5) * 0.5, seed: R(), kind: 5, colour: tmp, normal: nrm, at, line: edge && R() < 0.1, sway });
    }
    crowns.push({ x: c.x, y: c.y, z: c.z, r: r * 0.95 });
  }
  /** A broad-leaved tree: a trunk that forks, boughs out to the crown and twigs off them, and leaves on all of it. */
  function tree(x, z, { h = 9.5, spread = 3.6, kind = 'oak', lean = 0, girth = 1, far = false, at = null, leaf, dens } = {}) {
    const y0 = ground(x, z) - 0.2, pal = PAL[kind], bark = BARK[kind], r0 = (0.08 + h * 0.021) * girth * (far ? 1.2 : 1);
    at ??= [x, y0 + 0.2, z, 0.1];
    const opts = { leaf: leaf ?? (far ? 0.24 : 0.17), dens: dens ?? (far ? 85 : 210), loop: !far || R() < 0.5 };
    const fork = V(x + lean * 0.5 + (R() - 0.5) * 0.3, y0 + h * 0.48, z + (R() - 0.5) * 0.4), top = V(x + lean + (R() - 0.5) * 0.4, y0 + h * 0.8, z + (R() - 0.5) * 0.5);
    const trunk = knead(roll([V(x, y0, z), V(x + lean * 0.12 + (R() - 0.5) * 0.25, y0 + h * 0.22, z + (R() - 0.5) * 0.25), fork, top], (t) => r0 * (1.25 - 1.0 * t) * (1 + 0.5 * Math.max(0, 0.12 - t) / 0.12), { around: 10, every: 0.28 }), 0.018 * girth, 2.5, seed++);
    if (kind === 'birch') { const k = seed * 1.7; hue(trunk, (px, py, pz) => (noise(py * 2.6 + k, Math.atan2(pz - z, px - x) * 1.1) > 0.42 ? '#3f3a44' : '#f4f0e6')); }
    // (bark: streaked up and down it, darker in its furrows, with a little moss low on it)
    else { const k = seed * 1.3, dark = C(bark).multiplyScalar(0.55), moss = C('#6a7a3a'), base = C(bark), c = new THREE.Color(); hue(trunk, (px, py, pz) => c.copy(base).lerp(dark, sstep(-0.1, 0.5, noise(Math.atan2(pz - z, px - x) * 3.2 + k, py * 0.45))).lerp(moss, sstep(1.6, 0.2, py - y0) * sstep(0.0, 0.6, noise(px * 2 + k, pz * 2)) * 0.5)); }
    solid.add(trunk, bark, [0.92, 0.1, 0.4], [0.1, 1, 0.1], at);
    const crown = V(x + lean, y0 + h * 0.72, z), boughs = far ? 4 : 5 + Math.floor(R() * 2), tips = [top.clone().add(V(0, h * 0.07, 0))];
    for (let i = 0; i < boughs; i++) {
      const a = (i / boughs) * TAU + R() * 0.8, out = spread * (0.55 + 0.35 * R());
      const from = R() < 0.4 ? V(x, y0, z).lerp(fork, 0.72 + 0.28 * R()) : fork.clone().lerp(top, R() * 0.75);
      const end = V(crown.x + Math.cos(a) * out, crown.y + (R() - 0.4) * h * 0.2, crown.z + Math.sin(a) * out), mid = from.clone().lerp(end, 0.5).add(V(0, 0.16 * out, 0));
      if (!far) {
        solid.add(roll([from, mid, end], (t) => r0 * (0.44 - 0.37 * t), { around: 6, every: 0.4 }), bark, [0.6, 0.6, 0.4], undefined, at);
        // twigs: dark lines that show between the leaves
        for (let k = 0; k < 2; k++) solid.add(roll([mid.clone().lerp(end, 0.2 + 0.5 * R()), end.clone().add(V((R() - 0.5) * spread * 0.4, (R() - 0.3) * spread * 0.3, (R() - 0.5) * spread * 0.4))], (t) => r0 * (0.2 - 0.14 * t), { around: 5, every: 0.6 }), bark, undefined, undefined, at);
      }
      tips.push(end);
    }
    for (const tip of tips) {
      clump(tip, spread * (0.3 + 0.1 * R()), pal, at, opts);
      for (let j = 0; j < (far ? 2 : 3); j++) clump(V(tip.x + (R() - 0.5) * spread * 0.7, tip.y + (R() - 0.3) * spread * 0.42, tip.z + (R() - 0.5) * spread * 0.7), spread * (0.2 + 0.1 * R()), pal, at, opts);
    }
    for (let i = 0; i < (far ? 3 : 5); i++) clump(V(crown.x + (R() - 0.5) * spread * 1.1, crown.y + (R() - 0.2) * h * 0.16, crown.z + (R() - 0.5) * spread * 1.1), spread * (0.26 + 0.1 * R()), pal, at, opts);
    if (!far) colliders.push({ x, z, r: r0 + 0.14, h: 4 });
  }
  /** A fir: a straight stem and tier on tier of dark boughs that droop, lighter at their tips. */
  function fir(x, z, h = 12, at = null, far = false) {
    const y0 = ground(x, z) - 0.2, pal = PAL.fir;
    at ??= [x, y0 + 0.2, z, 0.1];
    solid.add(knead(roll([V(x, y0, z), V(x, y0 + h * 0.96, z)], (t) => 0.2 - 0.18 * t, { around: 9, every: 0.5 }), 0.012, 3, seed++), BARK.fir, [0.92, 0.1, 0.4], [0.1, 1, 0.1], at);
    const tiers = Math.round(h * 1.25);
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1), y = y0 + h * (0.14 + 0.86 * t), rad = (1 - t) * h * 0.25 + 0.2;
      ramp(pal, 0.06 + 0.1 * R());
      dabs.add(x, y - rad * 0.2, z, { w: rad * 0.7, h: rad * 0.22 + 0.08, turn: (R() - 0.5) * 0.2, seed: R(), kind: 0, colour: tmp, normal: LT, at, line: k % 2 === 0, sway: 0.2 });
      const n = Math.round((20 + rad * 95) * (far ? 0.4 : 1));
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, out = Math.sqrt(R()), rr = rad * (0.2 + 0.85 * out);
        nrm.set(Math.cos(a) * 0.55, 0.7, Math.sin(a) * 0.55).addScaledVector(SUN, 0.5).normalize();
        ramp(pal, (nrm.dot(LT) * 0.5 + 0.5) * (0.35 + 0.65 * out) + (R() - 0.5) * 0.3);
        const w = (far ? 0.3 : 0.15) * (0.8 + 0.5 * R());
        dabs.add(x + Math.cos(a) * rr, y - rr * 0.42 + (R() - 0.5) * 0.3, z + Math.sin(a) * rr, { w, h: w * 0.7, turn: Math.PI / 2 + (R() - 0.5) * 0.9, seed: R(), kind: 5, colour: tmp, normal: nrm, at, line: out > 0.9 && R() < 0.1, sway: 0.25 });
      }
    }
    if (!far) colliders.push({ x, z, r: 0.42, h: 4 });
    crowns.push({ x, y: y0 + h * 0.4, z, r: h * 0.2 }, { x, y: y0 + h * 0.7, z, r: h * 0.13 });
  }
  /** The willow: it leans out over the water and lets its hair down into it. */
  function willow(x, z, toX, toZ) {
    const y0 = ground(x, z) - 0.2, pal = PAL.willow, at = [x, y0 + 0.2, z, 0.12], l = Math.hypot(toX - x, toZ - z), dx = (toX - x) / l, dz = (toZ - z) / l;
    const head = V(x + dx * 2.3, y0 + 5.8, z + dz * 2.3);
    solid.add(knead(roll([V(x, y0, z), V(x + dx * 0.3, y0 + 2.0, z + dz * 0.3), V(x + dx * 1.3, y0 + 4.2, z + dz * 1.3), head], (t) => 0.46 - 0.3 * t, { around: 10, every: 0.3 }), 0.03, 2.2, seed++), BARK.willow, [0.92, 0.1, 0.4], [0.1, 1, 0.1], at);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + R() * 0.5, end = V(head.x + Math.cos(a) * 2.5, head.y + 0.7 + R() * 0.8, head.z + Math.sin(a) * 2.5);
      solid.add(roll([head.clone().add(V(0, -0.5, 0)), head.clone().lerp(end, 0.5).add(V(0, 0.6, 0)), end], (t) => 0.2 - 0.16 * t, { around: 6, every: 0.4 }), BARK.willow, undefined, undefined, at);
      clump(end, 1.25, pal, at, { leaf: 0.12, dens: 180, turn: 0, stretch: 1.5 });
    }
    clump(head.clone().add(V(0, 1.0, 0)), 1.9, pal, at, { leaf: 0.12, dens: 180, turn: 0, stretch: 1.5 });
    // its hair: long strands of narrow leaves hanging from the crown, longest over the water
    for (let i = 0; i < 150; i++) {
      const a = R() * TAU, rr = 1.2 + 2.7 * Math.sqrt(R()), sx = head.x + Math.cos(a) * rr, sz = head.z + Math.sin(a) * rr, top = head.y + 1.1 - rr * 0.32 + R() * 0.5;
      const foot = Math.max(ground(sx, sz), WATER) + 0.25 + R() * 0.9, n = Math.max(3, Math.round((top - foot) / 0.2));
      nrm.set(Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4).addScaledVector(SUN, 0.6).normalize();
      const base = nrm.dot(LT) * 0.5 + 0.5;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        ramp(pal, base * (1.05 - 0.5 * t) + (R() - 0.5) * 0.3);
        dabs.add(sx + (R() - 0.5) * 0.12 + dx * 0.25 * t, top - (top - foot) * t, sz + (R() - 0.5) * 0.12 + dz * 0.25 * t, { w: 0.085 + 0.04 * R(), h: 0.17 + 0.06 * R(), turn: (R() - 0.5) * 0.35, seed: R(), kind: 5, colour: tmp, normal: nrm, at, line: R() < 0.04, sway: 0.4 + 1.6 * t });
      }
    }
    colliders.push({ x, z, r: 0.6, h: 4 });
    crowns.push({ x: head.x, y: head.y, z: head.z, r: 3.4 });
  }
  /** A bush, a clump of fern: a low heap of leaves. */
  function bush(x, z, rad = 0.8, kind = 'bush') {
    const y = ground(x, z);
    if (y < WATER + 0.1) return;
    const at = [x, y, z, 0.3];
    clump(V(x, y + rad * 0.5, z), rad, PAL[kind], at, { leaf: 0.12, dens: 260, squash: 0.7 });
    for (let i = 0; i < 2; i++) clump(V(x + (R() - 0.5) * rad * 1.3, y + rad * 0.35, z + (R() - 0.5) * rad * 1.3), rad * 0.6, PAL[kind], at, { leaf: 0.12, dens: 260, squash: 0.7 });
  }

  // the wood, this side of the stream
  tree(13.2, 19.5, { h: 10.5, spread: 4.0 });
  tree(-4.4, 14.2, { h: 11, spread: 4.2, lean: -0.5 });
  tree(-11, 20.5, { h: 10, spread: 3.8 });
  tree(15.5, 7.2, { h: 10, spread: 3.8, lean: 0.4 });
  tree(-17, 3, { h: 10.5, spread: 4.0 });
  const BIRCH = { spread: 2.1, kind: 'birch', girth: 0.36, leaf: 0.12, dens: 300 };
  for (const [x, z, h] of [[3.4, 20.8, 9.5], [1.4, 16.6, 8.5], [10.4, 12.2, 9], [-7.8, 10.4, 8.5], [6.9, 8.4, 8], [18.5, 12.5, 9]]) tree(x, z, { ...BIRCH, h, lean: (R() - 0.5) * 0.8 });
  fir(-15.5, 13, 13); fir(19.5, 17, 12); fir(-19.5, 9.5, 11);
  willow(-6.6, 7.0, -5.6, 3.2);
  // across it, thinning out toward the meadow
  tree(-9.5, -3.4, { h: 10, spread: 4.0, lean: 0.3 });
  tree(-14.5, -10, { h: 9, spread: 3.6 });
  tree(17.5, -3, { h: 9.5, spread: 3.7 });
  for (const [x, z, h] of [[6.2, -2.6, 8.5], [8.8, -5.8, 9], [-5.6, -8.6, 8], [-19, -17, 8.5]]) tree(x, z, { ...BIRCH, h, lean: (R() - 0.5) * 0.8 });
  fir(14.8, -9.5, 12); fir(-20, -5, 11.5);
  // and on the rise, alone, the tree in blossom
  tree(11.4, -26.2, { h: 7.6, spread: 4.4, kind: 'blossom', lean: -0.7, leaf: 0.13, dens: 260 });
  for (const [x, z, r] of [[10.6, 16.5, 0.9], [-1.6, 19.5, 0.7], [-9, 15.5, 1.0], [12.5, 4.6, 0.8], [-12.5, 6.4, 0.9], [4.6, 6.9, 0.6], [-6.4, -1.2, 0.8], [10.6, -1.4, 0.9], [-12, -5.6, 1.0], [3.4, -6.8, 0.6], [-16, -13.5, 0.9], [16, -14, 1.0], [-3.2, 9.6, 0.6], [16.8, 1.2, 0.8]]) bush(x, z, r);

  // Where the low sun finds a way between the crowns, a shaft of it comes down to the floor of the wood.
  const shafts = { pos: [], axis: [], beam: [], root: [], index: [] };
  {
    const found = [];
    for (let i = 0; i < 6000 && found.length < 13; i++) {
      const x = AREA.x0 + 2 + (AREA.x1 - AREA.x0 - 4) * R(), z = AREA.z0 + 2 + (AREA.z1 - AREA.z0 - 4) * R(), y = ground(x, z);
      if (wood(x, z) < 0.45 || y < WATER + 0.15 || nearWay(x, z)[0] > 12 || found.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 4.5)) continue;
      // the ray from here to the sun must clear every bough, and pass close by one
      let clear = true, graze = false;
      for (const c of crowns) {
        const dx = c.x - x, dy = c.y - y, dz = c.z - z, s = dx * SUN.x + dy * SUN.y + dz * SUN.z;
        if (s < 0) continue;
        const d = Math.hypot(dx - SUN.x * s, dy - SUN.y * s, dz - SUN.z * s) / c.r;
        if (d < 1.0) { clear = false; break; }
        if (d < 1.9) graze = true;
      }
      if (!clear || !graze) continue;
      found.push([x, z]);
      const L = 16 + 7 * R(), n = shafts.pos.length / 3, w = 0.35 + 0.45 * R(), sd = R(), S = V(x, y, z).addScaledVector(SUN, L);
      for (const [p, t] of [[S, 0], [V(x, y - 0.1, z), 1]]) for (const side of [-1, 1]) { shafts.pos.push(p.x, p.y, p.z); shafts.axis.push(-SUN.x, -SUN.y, -SUN.z); shafts.beam.push(side, t, w, sd); shafts.root.push(x, y, z, 0); }
      shafts.index.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      // and in it, motes of dust, turned to gold
      for (let k = 0; k < 6; k++) { const m = V(x, y, z).addScaledVector(SUN, (0.04 + 0.45 * R()) * L); dabs.add(m.x + (R() - 0.5) * w, m.y + (R() - 0.5) * 0.4, m.z + (R() - 0.5) * w, { w: 0.009 + 0.01 * R(), seed: R(), kind: 7, colour: '#fff3c4', normal: SUN, at: [x, y, z, 0.2] }); }
    }
  }

  // the wood beyond where one can walk, and the hills beyond that
  say('먼 풍경을 넣는 중');
  await turn();
  {
    const toSun = Math.atan2(SUN.x, SUN.z);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU + (R() - 0.5) * 0.08, rad = 31 + 13 * R(), x = Math.sin(a) * rad * 1.05, z = -3 + Math.cos(a) * rad * 1.15;
      // (toward the sun the wood opens, and the eye goes out over the meadow to the hills)
      const open = Math.abs(((a - toSun + Math.PI * 3) % TAU) - Math.PI) < 1.15;
      if (inside(x, z, -3) || (open && R() < 0.8) || R() < 0.22 || nearStream(x, z)[0] < 3.5) continue;
      if (R() < 0.3) fir(x, z, 11 + 4 * R(), farRoot(x, z, 0.12), true);
      else tree(x, z, { h: 8 + 8 * R(), spread: 3.2 + 1.8 * R(), kind: 'far', far: true, at: farRoot(x, z, 0.12) });
    }
    // The hills: five ranges, one behind another, each a ridge all the way round. Each stands a little higher on
    // the page than the one in front, so its crest shows over it; and each is paler and bluer than the last.
    // lo, hi: how high its crest stands, in degrees above the level, at its saddles and at its summits.
    const RANGES = [
      { R: 95, lo: 1.0, hi: 5.0, f: 2.7, pig: '#7fb060', mist: 0.3, rag: 0.07, s: 3 },
      { R: 160, lo: 2.6, hi: 6.4, f: 2.3, pig: '#5f9c78', mist: 0.16, rag: 0.05, s: 11 },
      { R: 270, lo: 4.2, hi: 7.8, f: 1.9, pig: '#5f9498', mist: 0.1, rag: 0.03, s: 19 },
      { R: 450, lo: 5.8, hi: 9.2, f: 1.6, pig: '#7f96c8', mist: 0.07, rag: 0.015, s: 29 },
      { R: 750, lo: 7.2, hi: 10.4, f: 1.4, pig: '#b0b2e0', mist: 0.05, rag: 0, s: 41 },
    ];
    const SEG = 1440, ROWS = 8, pos = [], col = [], root = [], hill = [], hillB = [], index = [], pig = new THREE.Color();
    RANGES.forEach(({ R: far, lo, hi, f, pig: colour, mist, rag, s }, layer) => {
      const first = pos.length / 3;
      pig.set(colour);
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        // rolling: long swells, shorter ones on them, and along the near crests the raggedness of trees
        const swell = 0.5 + 0.55 * noise(ca * f + s, sa * f + s * 1.7) + 0.25 * noise(ca * f * 2.7 + s * 3, sa * f * 2.7) + 0.08 * noise(ca * f * 7 + 5, sa * f * 7 + s);
        const high = lo + (hi - lo) * Math.min(1, Math.max(0, swell)) + rag * noise(ca * 40 + s, sa * 40) + rag * 0.6 * noise(ca * 110, sa * 110 + s);
        const x = ca * far, z = -4 + sa * far, top = far * Math.tan((high * Math.PI) / 180), at = farRoot(x, z, (2 + 1.3 * layer) / far);
        for (let j = 0; j <= ROWS; j++) {
          const t = j / ROWS, y = top * (1 - t) - 0.17 * far * t;
          pos.push(x, y, z); col.push(pig.r, pig.g, pig.b); root.push(at[0], at[1], at[2], at[3]);
          // (how far below its crest, counted in the depth of the band over which the wash thins: about three degrees)
          hill.push(ca, sa, (top - y) / (far * 0.055), layer); hillB.push(mist, a * 300 + (y / far) * 220);
        }
        if (i) for (let j = 0; j < ROWS; j++) { const p = first + (i - 1) * (ROWS + 1) + j, q = p + ROWS + 1; index.push(p, q, p + 1, p + 1, q, q + 1); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('root', new THREE.Float32BufferAttribute(root, 4));
    g.setAttribute('hill', new THREE.Float32BufferAttribute(hill, 4));
    g.setAttribute('hillB', new THREE.Float32BufferAttribute(hillB, 2));
    g.setIndex(index);
    wash.hill.uniforms.uSun.value.copy(SUN);
    const ranges = new THREE.Mesh(g, wash.hill);
    ranges.frustumCulled = false;
    group.add(ranges);
  }

  // ====================================================================================== what grows low, and the stones
  say('목초지에 씨를 뿌리는 중');
  await turn();
  {
    // stones in and beside the stream, and the stepping stones
    for (const [sx, sz] of STONES) solid.add(put(knead(ball(1, 3).scale(0.5 + 0.1 * R(), 0.2, 0.44 + 0.1 * R()), 0.05, 2.5, seed++), sx, -0.26, sz, R() * 3), any(['#cfc6c9', '#c3bac4', '#d6cec8']), [0.3, 1, 0.2], undefined, [sx, -0.2, sz, 0.3]);
    for (let i = 0; i < 46; i++) {
      const [x, z] = streamLine[8 + Math.floor(R() * 94)], a = R() * TAU, d = 1.5 + 1.7 * R(), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, s = 0.22 + 0.5 * R() * R();
      if (nearWay(px, pz)[0] < 1.2) continue;
      solid.add(put(knead(ball(s, 2).scale(1, 0.65, 0.85), s * 0.16, 1.4 / s, seed++, 3, s * 0.5), px, ground(px, pz) + s * 0.12, pz, R() * 6), any(['#b9b0b6', '#a69dac', '#c6beb8', '#928fa0']), [0.25, 1, 0.15], [1, 0.3, 0.4], [px, ground(px, pz), pz, 0.3]);
    }
    // a fallen bough by the way, and toadstools at its foot
    const lx = 4.9, lz = 10.6, ly = ground(lx, lz);
    solid.add(knead(roll([V(lx - 1.3, ly + 0.2, lz + 0.5), V(lx, ly + 0.24, lz), V(lx + 1.5, ly + 0.2, lz - 0.3)], (t) => 0.24 - 0.06 * t, { around: 10, every: 0.25 }), 0.02, 3, seed++), '#6e5546', [0.1, 0.3, 1], undefined, [lx, ly, lz, 0.3]);
    colliders.push({ x: lx - 0.6, z: lz + 0.25, r: 0.4, h: 0.5 }, { x: lx + 0.7, z: lz - 0.15, r: 0.4, h: 0.5 });
    for (const [mx, mz, s] of [[4.2, 11.4, 1], [4.6, 11.7, 0.7], [5.9, 11.0, 0.85], [3.6, 11.2, 0.6], [-8.6, 12.0, 0.9], [-8.2, 12.4, 0.65], [12.0, 14.0, 0.8]]) {
      const my = ground(mx, mz), at = [mx, my, mz, 0.3];
      solid.add(roll([V(mx, my - 0.02, mz), V(mx + 0.01, my + 0.2 * s, mz)], 0.035 * s, { around: 7, every: 0.1 }), '#f6efe2', undefined, undefined, at);
      solid.add(put(knead(ball(1, 2).scale(0.14 * s, 0.085 * s, 0.14 * s), 0.008, 6, seed++), mx + 0.01, my + 0.2 * s, mz), '#e0483c', [0.3, 1, 0.3], undefined, at);
    }
  }
  const STEM = ['#5f8f3a', '#4f7f38', '#73a044'], HEADS = V(0.1, 0.6, 0.5).normalize();
  /** One flower: a stem and its head, or its heads. */
  function flower(x, z, type, at) {
    const y = ground(x, z);
    if (y < WATER + 0.12 || nearWay(x, z)[0] < 0.55) return;
    const F = FLOWERS[type], tall = F.tall[0] + (F.tall[1] - F.tall[0]) * R(), s = F.size * (0.8 + 0.4 * R()), bell = F.petals === 1;
    dabs.add(x, y - 0.03, z, { w: 0.007, h: tall, seed: R(), kind: 8, colour: any(STEM), at });
    const head = (hx, hy, hz, hs) => dabs.add(hx, hy, hz, { w: hs, h: hs * (bell ? 1.5 : 0.7 + 0.3 * R()), turn: bell ? (R() - 0.5) * 0.7 : R() * TAU, seed: R(), kind: 2, colour: any(F.colours), normal: HEADS, at, line: R() < 0.14, sway: F.petals });
    if (type === 'foxglove') for (let k = 0; k < 7; k++) head(x + (k % 2 ? 0.045 : -0.045), y + tall * (1.0 + 0.15 * k), z, s * (1 - 0.09 * k));
    else if (type === 'bluebell') { const lean = R() < 0.5 ? 1 : -1; for (let k = 0; k < 4; k++) head(x + lean * (0.015 + 0.03 * k), y + tall * 2 - 0.04 * k, z, s * (1 - 0.1 * k)); }
    else head(x, y + tall * 2, z, s);
  }
  /** A bed of one flower: thick in its middle. It takes its paint all at once, from its middle out. */
  function bed(cx, cz, rad, type, n) {
    const at = [cx, ground(cx, cz), cz, 0.12];
    for (let i = 0; i < n; i++) { const a = R() * TAU, d = rad * Math.sqrt(R()) * (0.35 + 0.65 * R()); flower(cx + Math.cos(a) * d * 1.3, cz + Math.sin(a) * d, type, at); }
  }
  // bluebells under the trees, in drifts
  for (const [x, z, r] of [[-1.5, 13.5, 4.2], [10.5, 17, 3.6], [-9.5, 17, 4.0], [12.5, 9.5, 3.4], [-12, 9.5, 3.6], [5, 18, 2.6], [-8, -5.5, 3.6], [11, -4.5, 3.2]]) bed(x, z, r, 'bluebell', Math.round(r * 80));
  for (const [x, z] of [[-4.2, -2.4], [9.2, -9.4], [13.2, 2.6], [-11.6, -1.2]]) bed(x, z, 1.5, 'foxglove', 15);
  // the meadow's flowers, each kind in its own beds, running into one another
  for (const [x, z, r] of [[-3, -14, 3.4], [9, -15.5, 3.0], [-9, -22, 3.6], [2.5, -26.5, 2.8], [16, -22, 3.0]]) bed(x, z, r, 'poppy', Math.round(r * 46));
  for (const [x, z, r] of [[1.5, -17.5, 3.6], [-6, -18, 3.2], [12, -19, 3.2], [-13, -26, 3.4], [6.5, -28.5, 3.0], [-15, -18.5, 3.0]]) bed(x, z, r, 'buttercup', Math.round(r * 70));
  for (const [x, z, r] of [[-1, -21.5, 3.2], [8.5, -12, 2.8], [-11, -15.5, 3.0], [15.5, -27, 3.0], [-4.5, -27.5, 2.8], [3.5, -9.5, 2.2]]) bed(x, z, r, 'daisy', Math.round(r * 62));
  for (const [x, z, r] of [[4.5, -13.5, 2.6], [-7.5, -25.5, 2.8], [14.5, -16.5, 2.4], [-16.5, -22.5, 2.6]]) bed(x, z, r, 'cornflower', Math.round(r * 44));
  // daisies and buttercups singly, all over the meadow
  for (let i = 0; i < 1500; i++) { const x = -22 + 44 * R(), z = -30 + 24 * R(); if (wood(x, z) < 0.5) flower(x, z, R() < 0.55 ? 'daisy' : 'buttercup', null); }
  // petals already down under the blossom tree
  for (let i = 0; i < 300; i++) { const a = R() * TAU, d = 5.2 * Math.sqrt(R()), x = 10.7 + Math.cos(a) * d, z = -26.2 + Math.sin(a) * d; dabs.add(x, ground(x, z) + 0.05, z, { w: 0.05 + 0.03 * R(), h: 0.035, turn: R() * TAU, seed: R(), kind: 0, colour: any(['#f9c3d2', '#fbd9e2', '#f4a9c0']), normal: HEADS, at: [11.4, ground(11.4, -26.2), -26.2, 0.25] }); }

  // what stirs once it is painted: petals coming down from the tree in blossom, and butterflies over the flower beds
  {
    const foot = [11.4, ground(11.4, -26.2), -26.2, 0.28], top = foot[1] + 5.4;
    for (let i = 0; i < 110; i++) { const a = R() * TAU, d = 3.6 * Math.sqrt(R()); dabs.add(10.7 + Math.cos(a) * d, top + R() * 1.2, -26.2 + Math.sin(a) * d, { w: 0.05 + 0.025 * R(), h: 0.034, turn: R() * TAU, seed: R(), kind: 3, colour: any(['#f9c3d2', '#fbd9e2', '#f4a9c0']), normal: HEADS, at: foot, sway: 5.6 + R() }); }
    for (const [x, z] of [[-3, -14], [9, -15.5], [1.5, -17.5], [-6, -18], [12, -19], [-1, -21.5], [4.5, -13.5], [-9, -22], [8.5, -12], [2.5, -26.5], [-1.5, 13.5], [10.5, 17], [-8, -5.5]]) {
      for (let k = 0; k < 2; k++) dabs.add(x, ground(x, z) + 0.75 + 0.5 * R(), z, { w: 0.06 + 0.02 * R(), h: 0.05, seed: R(), kind: 4, colour: any(['#fffaf0', '#f7cf2a', '#f9a23a', '#8fb0f0', '#fffaf0']), normal: HEADS, at: [x, ground(x, z), z, 0.12], sway: 1.1 + 1.3 * R() });
    }
  }

  // grass: tufts of blades, long and of many greens in the meadow, with straw where it has gone to seed and dark
  // in drifts; short and deep under the trees
  const grassTone = new THREE.Color();
  for (let i = 0; i < 520000; i++) {
    const near = i < 400000, x = near ? -25 + 50 * R() : -36 + 72 * R(), z = near ? -33 + 60 * R() : -44 + 76 * R(), w = wood(x, z);
    if (!near && (inside(x, z, -2) || R() < w * 0.3)) continue;
    const y = ground(x, z), way = nearWay(x, z)[0];
    if (y < WATER + 0.1 || way < 0.45 || (way < 1.0 && R() < 0.75)) continue;
    const inn = inside(x, z), dry = noise(x * 0.22 + 9, z * 0.22);
    const seedy = w < 0.4 && R() < 0.06 + 0.3 * sstep(0.1, 0.7, dry);
    const tall = (seedy ? 0.24 + 0.16 * R() : (0.07 + 0.17 * R() * R() + 0.05 * R()) * (1.25 - 0.45 * w)) * (inn ? 1 : 1.3);
    // (its colour is the ground's own, pushed a little toward one of the grass's greens, and lighter or darker)
    grassTone.copy(soil(x, z)).lerp(tmp.set(seedy ? any(STRAW) : dry < -0.3 ? any(DARK_GRASS) : w > 0.5 && R() < 0.5 ? any(SHADE_GRASS) : any(GRASS)), seedy ? 0.8 : 0.42).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.1);
    const colour = grassTone;
    dabs.add(x, y - 0.03, z, { w: seedy ? 0.1 + 0.04 * R() : 0.09 + 0.12 * R(), h: tall, turn: (R() - 0.5) * 0.9, seed: seedy ? 0.82 + 0.17 * R() : 0.79 * R(), kind: 1, colour, at: inn ? null : farRoot(x, z, 0.1), line: R() < 0.045, sway: 0.6 });
  }

  group.add(solid.build(), dabs.build());
  if (shafts.index.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(shafts.pos, 3));
    g.setAttribute('axis', new THREE.Float32BufferAttribute(shafts.axis, 3));
    g.setAttribute('beam', new THREE.Float32BufferAttribute(shafts.beam, 4));
    g.setAttribute('root', new THREE.Float32BufferAttribute(shafts.root, 4));
    g.setIndex(shafts.index);
    const mesh = new THREE.Mesh(g, wash.beam);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    group.add(mesh);
  }
  scene.add(group);

  // he can't leave the page: walls he doesn't see
  {
    const wall = (x0, z0, x1, z1) => { boxes.push({ x: (x0 + x1) / 2, y: 4, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2 + 0.1, hy: 8, hz: Math.abs(z1 - z0) / 2 + 0.1, turn: 0 }); walls.push([Math.min(x0, x1) - 0.4, Math.min(z0, z1) - 0.4, Math.max(x0, x1) + 0.4, Math.max(z0, z1) + 0.4]); };
    wall(AREA.x0, AREA.z0, AREA.x1, AREA.z0); wall(AREA.x0, AREA.z1, AREA.x1, AREA.z1); wall(AREA.x0, AREA.z0, AREA.x0, AREA.z1); wall(AREA.x1, AREA.z0, AREA.x1, AREA.z1);
  }

  // ============================================================================================================ the light
  // Late afternoon: the sun low and ahead, long shadows coming toward the eye.
  const light = new THREE.DirectionalLight('#ffffff', Math.PI * 1.25);
  light.position.copy(SUN).multiplyScalar(90).add(V(0, 0, -4));
  light.target.position.set(0, 0, -4);
  light.castShadow = true;
  light.shadow.mapSize.set(4096, 4096);
  Object.assign(light.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 5, far: 220 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.06;
  light.shadow.radius = 4;
  scene.add(light, light.target, new THREE.AmbientLight('#ffffff', Math.PI * 0.27), new THREE.HemisphereLight('#ffffff', '#000000', Math.PI * 0.2));

  const [sx, sz] = WAY[0], yaw = Math.atan2(WAY[1][0] - sx, WAY[1][1] - sz);
  let finished = false;
  return {
    ground, paint: wash.paint,
    field: { cells: 256, size: 96, centre: [0, -4] },
    colliders, boxes,
    start: { x: sx, z: sz, yaw },
    road: wayLine.filter((_, i) => i % 3 === 0 || i === wayLine.length - 1),
    way: new THREE.CatmullRomCurve3(WAY.map(([x, z]) => V(x, 0, z))).getPoints(150).map((p) => [p.x, p.z]),
    open: (x, z) => walls.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1),
    follow: { pitch: 0.05, want: 6.6, side: 0.8, lift: 1.7 },
    fov: 44, far: 4000, sun: SUN,
    counts: { pieces: solid.count, dabs: dabs.count, shafts: shafts.index.length / 6 },
    get now() { return time.value; },
    /** Everything painted at once (for looking at the finished page), or nothing. */
    paintAll(on = true) { if (on) { wash.paint.all(); skyT.value = -100; } else { wash.paint.none(); skyT.value = wash.paint.NEVER; } },
    update(dt, feet, camera) {
      time.value += dt;
      wash.paint.touch(feet.x, feet.z, time.value);
      wash.paint.sync();
      // the sky takes its wash the first time he is out from under the trees
      if (skyT.value >= wash.paint.NEVER && wood(feet.x, feet.z) < 0.35) skyT.value = time.value;
      // and at the tree in blossom the page is finished
      if (!finished && Math.hypot(feet.x - 11.4, feet.z + 26.2) < 6.5) {
        finished = true;
        // (the tree itself first; and the wash goes out from its foot over everything there is: the meadow,
        // back through the wood, the far trees, and ridge after ridge of the hills, the furthest last)
        // It goes out as a wave: over the ground in about three seconds, and in it colour climbs the trees and the
        // hills four times as fast, so that the ridges take it one after another as the wave passes on outward.
        wash.paint.flood(11.4, -26.2, time.value + 0.15, 2.4, 60);
        U.uFinale.value.set(11.4, -26.2, time.value + 0.15, 2.4);
        skyF.value = time.value + 0.15;
      }
      wash.sky.position.copy(camera.position);
    },
  };
}
