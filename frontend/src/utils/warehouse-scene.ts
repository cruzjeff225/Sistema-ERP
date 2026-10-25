// Builds the aerial (2.5D) warehouse scene from the real hierarchy: warehouse > aisle > rack > level > slot.
// There are no physical coordinates in the data, so the layout is computed: aisles side by side, the racks of an aisle next to each
// other, levels as columns across a rack and positions along it. Nothing here invents locations or occupancy: a fill ratio exists only
// when the slot has a capacity and a quantity in a comparable unit (`usedCapacity` is null when units are mixed).

export type SlotState = 'AVAILABLE' | 'OCCUPIED' | 'FULL' | 'INACTIVE';
export type MapSlot = {
  id: number; code: string; aisle: string; rack: string; level: string; position: string; capacity: number;
  state: SlotState; usedCapacity: string | null; freeCapacity: string | null;
  stocks: { quantity: string; product: { id: number; name: string; sku: string; purchaseUnit: { id: number; name: string } } }[];
};
export type AisleInput = { name: string; racks: { name: string; positions: string[]; levels: { name: string; cells: (MapSlot | undefined)[] }[] }[] };

export type SceneCell = { slot: MapSlot; poly: string; ring: string; fill: string | null; ratio: number | null };
export type SceneRack = {
  key: string; name: string; levelCount: number; side: 'left' | 'right';
  shadow: string; deck: string; recess: string; sideFace: string; sideBeams: string[]; sidePosts: string[]; frontFace: string; frontBraces: string[]; posts: string[];
  tag: { x: number; y: number; w: number; text: string }; levelLabels: { x: number; y: number; text: string }[]; cells: SceneCell[];
};
export type SceneAisle = { name: string; racks: SceneRack[]; pin: { x1: number; y1: number; x2: number; y2: number }; label: { x: number; y: number } };
export type Scene = {
  aisles: SceneAisle[]; svgW: number; svgH: number; hasRatio: boolean;
  floor: string; safety: string; lines: { x1: number; y1: number; x2: number; y2: number }[]; joints: { x1: number; y1: number; x2: number; y2: number }[];
  shades: { back: string; left: string; right: string };
  back: { x: number; y: number; w: number; h: number; cap: string; pillars: number[]; door: number };
  leftWall: { face: string; cap: string }; rightWall: { face: string; cap: string };
  front: { x: number; y: number; w: number; h: number; cap: string; pillars: number[] };
};

const CW = 46, FR = 9, GAP = 18, LANE = 96, MARGIN = 60, TAG_H = 104, MIN_LEN = 270, POS_UNIT = 32, WALL_H = 84, TS = 0.9, YS = 0.9, OFFX = 74, RH = 34;

export const fillRatio = (slot: MapSlot) => slot.usedCapacity !== null && slot.capacity > 0 ? Math.max(0, Math.min(1, Number(slot.usedCapacity) / slot.capacity)) : null;

export function buildWarehouseScene(aisles: AisleInput[]): Scene {
  const groups = aisles.map(aisle => {
    const racks = aisle.racks.map(rack => ({ rack, rw: rack.levels.length * CW + FR * 2 }));
    return { aisle, racks, gw: racks.reduce((total, item) => total + item.rw, 0) + GAP * Math.max(0, racks.length - 1) };
  });
  const maxPositions = Math.max(1, ...groups.flatMap(group => group.racks.map(item => item.rack.positions.length)));
  const rackLen = Math.max(MIN_LEN, maxPositions * POS_UNIT);
  let cursor = MARGIN;
  const lanes = [cursor];
  const placed = groups.map(group => { const start = cursor + LANE / 2; cursor = start + group.gw + LANE / 2; lanes.push(cursor); return { ...group, start }; });
  const W = Math.max(cursor + MARGIN, 320);
  const vTop = TAG_H, vFront = vTop + rackLen, H = vFront + 128, Y0 = WALL_H + 34;
  const scale = (v: number) => TS + (1 - TS) * (v / H);
  const P = (u: number, v: number, z = 0) => { const s = scale(v); return { x: OFFX + W / 2 + (u - W / 2) * s, y: Y0 + v * YS - z * s }; };
  const poly = (...points: [number, number, number?][]) => points.map(([u, v, z]) => { const point = P(u, v, z ?? 0); return `${point.x.toFixed(1)},${point.y.toFixed(1)}`; }).join(' ');
  const flat = (u0: number, v0: number, u1: number, v1: number, z = 0) => poly([u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]);
  const center = W / 2;
  const postCount = Math.max(2, Math.round(rackLen / 80)) + 1;

  const aislesOut: SceneAisle[] = placed.map(group => {
    let ru = group.start;
    const racks: SceneRack[] = group.racks.map(({ rack, rw }, rackIndex) => {
      const levels = [...rack.levels].reverse();
      const innerU0 = ru + FR, innerV0 = vTop + FR, rowH = (rackLen - FR * 2) / Math.max(1, rack.positions.length);
      const cells: SceneCell[] = [];
      levels.forEach((level, column) => level.cells.forEach((slot, row) => {
        if (!slot) return;
        const u0 = innerU0 + column * CW + 1.5, u1 = innerU0 + (column + 1) * CW - 1.5, v0 = innerV0 + row * rowH + 1.5, v1 = innerV0 + (row + 1) * rowH - 1.5;
        const ratio = slot.state === 'OCCUPIED' ? fillRatio(slot) : null;
        cells.push({
          slot, poly: flat(u0, v0, u1, v1, RH), ring: flat(u0 - 2.5, v0 - 2.5, u1 + 2.5, v1 + 2.5, RH),
          ratio, fill: ratio !== null ? flat(u0, v1 - ratio * (v1 - v0), u1, v1, RH) : null,
        });
      }));
      const side: 'left' | 'right' = ru + rw / 2 < center ? 'right' : 'left';
      const sideU = side === 'right' ? ru + rw : ru;
      const label = `Estante ${rack.name}`;
      const top = P(ru + rw / 2, vTop, RH);
      const rack3d: SceneRack = {
        key: `${group.aisle.name}-${rack.name}`, name: rack.name, levelCount: levels.length, side,
        shadow: flat(ru + 8, vTop + 12, ru + rw + 16, vFront + 12),
        deck: flat(ru, vTop, ru + rw, vFront, RH),
        recess: flat(innerU0, innerV0, ru + rw - FR, vFront - FR, RH),
        sideFace: poly([sideU, vTop, 0], [sideU, vFront, 0], [sideU, vFront, RH], [sideU, vTop, RH]),
        sideBeams: [0.34, 0.68].map(k => poly([sideU, vTop, RH * k], [sideU, vFront, RH * k])),
        sidePosts: Array.from({ length: postCount }, (_, k) => { const v = vTop + (k * (rackLen - 6)) / (postCount - 1); return poly([sideU, v, 0], [sideU, v + 6, 0], [sideU, v + 6, RH], [sideU, v, RH]); }),
        frontFace: poly([ru, vFront, 0], [ru + rw, vFront, 0], [ru + rw, vFront, RH], [ru, vFront, RH]),
        frontBraces: [poly([ru, vFront, 0], [ru + rw, vFront, RH]), poly([ru + rw, vFront, 0], [ru, vFront, RH])],
        posts: [ru, ru + rw - 8].map(u => poly([u, vFront, 0], [u + 8, vFront, 0], [u + 8, vFront, RH + 6], [u, vFront, RH + 6])),
        tag: { x: top.x, y: top.y - 40 - (rackIndex % 2) * 36, w: Math.max(label.length * 12 + 28, 94), text: label },
        levelLabels: levels.length > 1 ? levels.map((level, column) => ({ x: P(innerU0 + column * CW + CW / 2, vTop, RH).x, y: P(innerU0, vTop, RH).y - 8, text: `N${level.name}` })) : [],
        cells,
      };
      ru += rw + GAP;
      return rack3d;
    });
    const mid = group.start + group.gw / 2;
    const pinA = P(mid, vFront + 12), pinB = P(mid, vFront + 44), label = P(mid, vFront + 82);
    return { name: group.aisle.name, racks, pin: { x1: pinA.x, y1: pinA.y, x2: pinB.x, y2: pinB.y }, label };
  });

  const tl = P(0, 0), tr = P(W, 0), bl = P(0, H), br = P(W, H);
  const columns = Math.max(2, Math.floor(W / 150));
  const cap = 9;
  return {
    aisles: aislesOut, svgW: W + OFFX * 2, svgH: Y0 + H * YS + 52,
    floor: flat(0, 0, W, H), safety: flat(18, 18, W - 18, H - 18),
    lines: lanes.map(u => { const a = P(u, 34), b = P(u, H - 34); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }),
    joints: [0.25, 0.5, 0.75].map(k => { const a = P(0, H * k), b = P(W, H * k); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; }),
    shades: { back: flat(0, 0, W, 34), left: flat(0, 0, 30, H), right: flat(W - 30, 0, W, H) },
    back: { x: tl.x - 4, y: tl.y - WALL_H, w: tr.x - tl.x + 8, h: WALL_H, cap: `${tl.x - 4},${tl.y - WALL_H} ${tr.x + 4},${tl.y - WALL_H} ${tr.x + 4 + 5},${tl.y - WALL_H - cap} ${tl.x - 4 - 5},${tl.y - WALL_H - cap}`,
      pillars: Array.from({ length: columns }, (_, index) => P(((index + 0.5) * W) / columns, 0).x), door: (tl.x + tr.x) / 2 },
    leftWall: { face: `${tl.x},${tl.y} ${bl.x},${bl.y} ${bl.x - 42},${bl.y - 58} ${tl.x - 20},${tl.y - WALL_H}`, cap: `${tl.x - 20},${tl.y - WALL_H} ${bl.x - 42},${bl.y - 58} ${bl.x - 52},${bl.y - 58 - cap} ${tl.x - 30},${tl.y - WALL_H - cap}` },
    rightWall: { face: `${tr.x},${tr.y} ${br.x},${br.y} ${br.x + 42},${br.y - 58} ${tr.x + 20},${tr.y - WALL_H}`, cap: `${tr.x + 20},${tr.y - WALL_H} ${br.x + 42},${br.y - 58} ${br.x + 52},${br.y - 58 - cap} ${tr.x + 30},${tr.y - WALL_H - cap}` },
    front: { x: bl.x - 8, y: bl.y, w: br.x - bl.x + 16, h: 30, cap: `${bl.x - 8},${bl.y} ${br.x + 8},${bl.y} ${br.x + 8},${bl.y - 8} ${bl.x - 8},${bl.y - 8}`, pillars: lanes.map(u => P(u, H).x) },
    hasRatio: aisles.some(aisle => aisle.racks.some(rack => rack.levels.some(level => level.cells.some(slot => !!slot && slot.state === 'OCCUPIED' && fillRatio(slot) !== null)))),
  };
}
