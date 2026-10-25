
import * as THREE from 'three';

// ==========================================
// BUILDING CONFIGURATION
// ==========================================

// Centre X keeps the widest building (9.1 units) clear of the sidewalk.
// Road edge is at 4.5, sidewalk at about 5.5.

const BUILDING_POSITIONS = [
  [-10.0, -18],
  [10.0, -25],
  [-10.5, -42],
  [10.5, -50],
  [-10.0, -68],
  [10.5, -78],
  [-10.5, -94],
  [10.0, -106],
  [-10.0, -124],
  [10.5, -137],
  [-10.5, -158],
  [10.0, -171],
  [-10.0, -191],
  [10.5, -205],
  [-10.5, -225],
  [10.0, -238],
];


const BUILDING_COLORS = [
  0x5279a8,
  0xc87555,
  0x559582,
  0x7869a6,
  0xc49b53,
  0x4e91a1,
  0xb96779,
  0xb7a58b,
];

const FACADE_ACCENTS = [
  0xe8d7bb,
  0xe0e5e8,
  0xd9c3a7,
  0xbacbd3,
];

const WINDOW_COLORS = [
  0x9bd9f5,
  0xffdfa0,
  0x73b8cf,
  0xd4ecf8,
  0xf5c982,
  0x80a6b8,
];

const SIGN_COLORS = [
  0xffc928,
  0x45d5cb,
  0xff8268,
  0x75a9ff,
  0xffa7d1,
];

const ROOF_COLORS = [
  0x343a43,
  0x50555b,
  0x404951,
];

// ==========================================
// SHARED MATERIALS
// ==========================================

const buildingMaterials = BUILDING_COLORS.map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0.02,
    })
);

const accentMaterials = FACADE_ACCENTS.map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
    })
);

const roofMaterials = ROOF_COLORS.map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
    })
);

const windowMaterials = WINDOW_COLORS.map(
  (color, index) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: index % 2 === 0 ? 0.12 : 0.07,
      roughness: 0.32,
      metalness: 0.12,
    })
);

const windowFrameMaterial = new THREE.MeshStandardMaterial({
  color: 0x303b46,
  roughness: 0.78,
});

const windowDividerMaterial = new THREE.MeshStandardMaterial({
  color: 0x64747e,
  roughness: 0.7,
});

const darkGlassMaterial = new THREE.MeshStandardMaterial({
  color: 0x172c3b,
  roughness: 0.3,
  metalness: 0.15,
});

const shopGlassMaterial = new THREE.MeshStandardMaterial({
  color: 0x72b9d0,
  emissive: 0x163746,
  emissiveIntensity: 0.12,
  roughness: 0.28,
  metalness: 0.1,
});

const signMaterials = SIGN_COLORS.map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.14,
      roughness: 0.55,
    })
);

const awningMaterials = [
  new THREE.MeshStandardMaterial({ color: 0xf4eee2, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0xd94d45, roughness: 0.85 }),
  new THREE.MeshStandardMaterial({ color: 0x268f91, roughness: 0.85 }),
  new THREE.MeshStandardMaterial({ color: 0xe9b94f, roughness: 0.85 }),
];

const metalMaterial = new THREE.MeshStandardMaterial({
  color: 0x737e88,
  roughness: 0.65,
  metalness: 0.35,
});

const rooftopTankMaterial = new THREE.MeshStandardMaterial({
  color: 0x778994,
  roughness: 0.65,
  metalness: 0.12,
});

// ==========================================
// SHARED GEOMETRIES
// ==========================================

const geometries = {
  frontWindowFrame: new THREE.BoxGeometry(0.88, 1.16, 0.09),
  frontWindowGlass: new THREE.BoxGeometry(0.74, 1.00, 0.035),
  sideWindowFrame: new THREE.BoxGeometry(0.09, 1.16, 0.88),
  sideWindowGlass: new THREE.BoxGeometry(0.035, 1.00, 0.74),

  verticalWindowDivider: new THREE.BoxGeometry(0.045, 0.96, 0.045),
  horizontalWindowDivider: new THREE.BoxGeometry(0.70, 0.045, 0.045),

  verticalColumn: new THREE.BoxGeometry(0.24, 1, 0.24),
  horizontalTrim: new THREE.BoxGeometry(1, 0.14, 0.18),
  sideTrim: new THREE.BoxGeometry(0.18, 0.14, 1),

  roofSlab: new THREE.BoxGeometry(1, 0.28, 1),
  parapetFront: new THREE.BoxGeometry(1, 0.65, 0.22),
  parapetSide: new THREE.BoxGeometry(0.22, 0.65, 1),

  rooftopEquipment: new THREE.BoxGeometry(1.25, 0.75, 1.0),
  rooftopVent: new THREE.BoxGeometry(0.45, 0.55, 0.45),
  antenna: new THREE.BoxGeometry(0.07, 1.5, 0.07),

  shopWindow: new THREE.BoxGeometry(1, 1.65, 0.08),
  shopDoor: new THREE.BoxGeometry(0.85, 1.95, 0.16),
  doorHandle: new THREE.BoxGeometry(0.055, 0.3, 0.05),
  shopSign: new THREE.BoxGeometry(1, 0.48, 0.14),
  awning: new THREE.BoxGeometry(1, 0.14, 0.72),
  awningSupport: new THREE.BoxGeometry(0.08, 0.5, 0.08),
  awningValance: new THREE.BoxGeometry(1, 0.22, 0.12),

  balconyFloor: new THREE.BoxGeometry(1, 0.12, 0.42),
  balconyRail: new THREE.BoxGeometry(1, 0.08, 0.07),
  balconyPost: new THREE.BoxGeometry(0.055, 0.35, 0.055),

  tankBody: new THREE.CylinderGeometry(0.48, 0.48, 0.95, 8),
  tankTop: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 8),
};

// ==========================================
// CREATE BUILDING COLLECTION
// ==========================================

export function createBuildings() {
  const group = new THREE.Group();
  group.name = 'BuildingCollection';

  BUILDING_POSITIONS.forEach(([x, z], index) => {
    const building = createBuilding(index);

    building.name = `ScrollingBuilding_${index}`;
    building.position.set(x, 0, z);

    // Keep the existing environment scrolling contract.
    building.userData.scrollCity = true;

    group.add(building);
  });

  console.log('[BUILDINGS] CREATED:', group.children.length);

  return group;
}

// ==========================================
// CREATE INDIVIDUAL BUILDING
// ==========================================

function createBuilding(index) {
  const group = new THREE.Group();

  const width = 5.5 + (index % 3) * 1.8;
  const depth = 5 + ((index + 1) % 3) * 1.5;

  // Alternate heights and roof styles for a varied skyline.
  // Taller blocks (14–34 units) for a bigger street canyon. Previous
  // range was 9–24.
  const height = 14 + (index % 6) * 4;
  const style = index % 6;

  const bodyMaterial =
    buildingMaterials[index % buildingMaterials.length];

  const accentMaterial =
    accentMaterials[index % accentMaterials.length];

  const roofMaterial =
    roofMaterials[index % roofMaterials.length];

  // Main building structure.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    bodyMaterial
  );

  body.name = 'BuildingBody';
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;

  group.add(body);

  // Layered rooftop slab.
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.65, 0.28, depth + 0.65),
    roofMaterial
  );

  roof.name = 'BuildingRoof';
  roof.position.y = height + 0.14;
  roof.castShadow = true;

  group.add(roof);

  // Thin contrasting roof cap.
  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.85, 0.12, depth + 0.85),
    accentMaterial
  );

  roofCap.name = 'RoofCap';
  roofCap.position.y = height + 0.34;

  group.add(roofCap);

  createFacadeColumns(group, width, depth, height, accentMaterial);
  createFacadeTrims(group, width, depth, height, accentMaterial);

  createWindows(
    group,
    width,
    depth,
    height,
    index,
    style
  );

  createBalconies(
    group,
    width,
    depth,
    height,
    index,
    accentMaterial
  );

  createRoofProfile(
    group,
    width,
    depth,
    height,
    index,
    style
  );

  // Different storefront arrangements.
  if (index % 3 === 0 || index % 5 === 0) {
    createShopFront(
      group,
      width,
      depth,
      index,
      style
    );
  }

  return group;
}

// ==========================================
// FACADE COLUMNS AND CORNER TRIMS
// ==========================================

function createFacadeColumns(
  group,
  width,
  depth,
  height,
  material
) {
  const columnHeight = Math.max(2, height - 0.15);

  const positions = [
    [-width / 2 + 0.18, depth / 2 + 0.03],
    [width / 2 - 0.18, depth / 2 + 0.03],
    [width / 2 + 0.03, -depth / 2 + 0.18],
    [width / 2 + 0.03, depth / 2 - 0.18],
  ];

  positions.forEach(([x, z], index) => {
    const column = new THREE.Mesh(
      geometries.verticalColumn,
      material
    );

    column.name = `FacadeColumn_${index}`;
    column.position.set(
      x,
      columnHeight / 2 + 0.05,
      z
    );

    column.scale.y = columnHeight;
    group.add(column);
  });
}

function createFacadeTrims(
  group,
  width,
  depth,
  height,
  material
) {
  // Ground-floor separation band.
  const frontBand = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.25, 0.16, 0.2),
    material
  );

  frontBand.name = 'FrontFacadeBand';
  frontBand.position.set(0, 3.05, depth / 2 + 0.06);
  group.add(frontBand);

  const sideBand = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.16, depth + 0.15),
    material
  );

  sideBand.name = 'SideFacadeBand';
  sideBand.position.set(width / 2 + 0.06, 3.05, 0);
  group.add(sideBand);

  // Mid-building horizontal bands create extra depth.
  if (height >= 15) {
    for (let y = 7.2; y < height - 1.5; y += 5.2) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, 0.10, 0.12),
        material
      );

      band.position.set(0, y, depth / 2 + 0.035);
      band.name = 'UpperFacadeBand';

      group.add(band);
    }
  }
}

// ==========================================
// WINDOWS WITH VISIBLE DIVISIONS
// ==========================================

function createWindows(
  group,
  width,
  depth,
  height,
  index,
  style
) {
  const rows = Math.max(1, Math.floor((height - 2.3) / 2.5));

  const frontColumns = Math.max(
    2,
    Math.floor(width / 1.7)
  );

  const sideColumns = Math.max(
    2,
    Math.floor(depth / 1.7)
  );

  for (let row = 0; row < rows; row++) {
    const y = 1.9 + row * 2.5;

    if (y + 0.58 > height - 0.5) continue;

    for (let col = 0; col < frontColumns; col++) {
      const x =
        -width / 2 +
        0.9 +
        col * ((width - 1.8) / Math.max(frontColumns - 1, 1));

      const materialIndex =
        (index + row + col + style) % windowMaterials.length;

      addWindow(
        group,
        x,
        y,
        depth / 2 + 0.06,
        windowMaterials[materialIndex],
        false
      );
    }

    for (let col = 0; col < sideColumns; col++) {
      const z =
        -depth / 2 +
        0.9 +
        col * ((depth - 1.8) / Math.max(sideColumns - 1, 1));

      const materialIndex =
        (index + row + col + 2) % windowMaterials.length;

      addWindow(
        group,
        width / 2 + 0.06,
        y,
        z,
        windowMaterials[materialIndex],
        true
      );
    }
  }
}

function addWindow(
  group,
  x,
  y,
  z,
  glassMaterial,
  isSide
) {
  const frameGeometry = isSide
    ? geometries.sideWindowFrame
    : geometries.frontWindowFrame;

  const glassGeometry = isSide
    ? geometries.sideWindowGlass
    : geometries.frontWindowGlass;

  const frame = new THREE.Mesh(
    frameGeometry,
    windowFrameMaterial
  );

  frame.name = 'WindowFrame';
  frame.position.set(x, y, z);
  group.add(frame);

  const glass = new THREE.Mesh(
    glassGeometry,
    glassMaterial
  );

  glass.name = 'BuildingWindow';

  glass.position.set(
    isSide ? x + 0.052 : x,
    y,
    isSide ? z : z + 0.052
  );

  group.add(glass);

  // Window mullions: one vertical and one horizontal divider.
  const vertical = new THREE.Mesh(
    geometries.verticalWindowDivider,
    windowDividerMaterial
  );

  vertical.name = 'WindowVerticalDivider';

  vertical.position.set(
    isSide ? x + 0.078 : x,
    y,
    isSide ? z : z + 0.078
  );

  group.add(vertical);

  const horizontal = new THREE.Mesh(
    geometries.horizontalWindowDivider,
    windowDividerMaterial
  );

  horizontal.name = 'WindowHorizontalDivider';

  horizontal.position.set(
    isSide ? x + 0.078 : x,
    y,
    isSide ? z : z + 0.078
  );

  if (isSide) {
    // Rotate the divider assembly onto the side-facing plane.
    horizontal.rotation.y = Math.PI / 2;
  }

  group.add(horizontal);
}

// ==========================================
// BALCONIES ON SELECTED BUILDINGS
// ==========================================

function createBalconies(
  group,
  width,
  depth,
  height,
  index,
  material
) {
  if (index % 4 !== 1 && index % 4 !== 3) return;

  const rows = Math.floor((height - 3) / 5);

  for (let row = 0; row < rows; row++) {
    const y = 4.1 + row * 5;

    const floor = new THREE.Mesh(
      geometries.balconyFloor,
      material
    );

    floor.name = 'BalconyFloor';
    floor.scale.x = Math.min(1.6, width * 0.23);
    floor.position.set(0, y, depth / 2 + 0.2);

    group.add(floor);

    const rail = new THREE.Mesh(
      geometries.balconyRail,
      windowFrameMaterial
    );

    rail.name = 'BalconyRail';
    rail.scale.x = Math.min(1.6, width * 0.23);
    rail.position.set(0, y + 0.32, depth / 2 + 0.39);

    group.add(rail);

    [-0.55, 0, 0.55].forEach((offset) => {
      const post = new THREE.Mesh(
        geometries.balconyPost,
        windowFrameMaterial
      );

      post.position.set(offset, y + 0.16, depth / 2 + 0.39);
      group.add(post);
    });
  }
}

// ==========================================
// VARIED ROOFTOPS
// ==========================================

function createRoofProfile(
  group,
  width,
  depth,
  height,
  index,
  style
) {
  // Raised parapets on alternating buildings.
  if (style === 1 || style === 3 || style === 5) {
    const front = new THREE.Mesh(
      geometries.parapetFront,
      roofMaterials[(index + 1) % roofMaterials.length]
    );

    front.name = 'RoofFrontParapet';
    front.scale.x = width;
    front.position.set(0, height + 0.68, depth / 2 - 0.05);

    group.add(front);

    const back = front.clone();
    back.name = 'RoofBackParapet';
    back.position.z = -depth / 2 + 0.05;

    group.add(back);

    const left = new THREE.Mesh(
      geometries.parapetSide,
      roofMaterials[(index + 1) % roofMaterials.length]
    );

    left.name = 'RoofSideParapet';
    left.scale.z = depth;
    left.position.set(-width / 2 + 0.05, height + 0.68, 0);

    group.add(left);

    const right = left.clone();
    right.name = 'RoofSideParapet';
    right.position.x = width / 2 - 0.05;

    group.add(right);
  }

  // Rooftop equipment.
  if (index % 3 === 0) {
    const equipment = new THREE.Mesh(
      geometries.rooftopEquipment,
      metalMaterial
    );

    equipment.name = 'RooftopEquipment';
    equipment.scale.set(1, 0.85, 0.9);

    equipment.position.set(
      width * 0.19,
      height + 0.28 + 0.32,
      -depth * 0.12
    );

    equipment.castShadow = true;
    group.add(equipment);

    const vent = new THREE.Mesh(
      geometries.rooftopVent,
      roofMaterials[index % roofMaterials.length]
    );

    vent.name = 'RooftopVent';
    vent.position.set(
      -width * 0.18,
      height + 0.28 + 0.275,
      -depth * 0.15
    );

    group.add(vent);
  }

  // Water tank on selected buildings.
  if (index % 5 === 2) {
    const tank = new THREE.Mesh(
      geometries.tankBody,
      rooftopTankMaterial
    );

    tank.name = 'RooftopWaterTank';
    tank.position.set(
      width * 0.2,
      height + 0.28 + 0.48,
      depth * 0.12
    );

    tank.castShadow = true;
    group.add(tank);

    const lid = new THREE.Mesh(
      geometries.tankTop,
      metalMaterial
    );

    lid.name = 'WaterTankLid';
    lid.position.set(
      tank.position.x,
      height + 0.28 + 0.98,
      tank.position.z
    );

    group.add(lid);
  }

  // Antennas add skyline variation.
  if (index % 4 === 0 || index % 7 === 1) {
    const antenna = new THREE.Mesh(
      geometries.antenna,
      metalMaterial
    );

    antenna.name = 'RooftopAntenna';
    antenna.position.set(
      -width * 0.25,
      height + 0.28 + 0.75,
      depth * 0.2
    );

    group.add(antenna);
  }
}

// ==========================================
// STOREFRONTS, DOORS AND AWNINGS
// ==========================================

function createShopFront(
  group,
  width,
  depth,
  index,
  style
) {
  const frontZ = depth / 2 + 0.075;
  const signMaterial =
    signMaterials[index % signMaterials.length];

  const shopWidth = width * 0.76;
  const doorWidth = 0.85;
  const sideWidth = (shopWidth - doorWidth - 0.25) / 2;

  // Left shop display window.
  const leftDisplay = new THREE.Mesh(
    geometries.shopWindow,
    shopGlassMaterial
  );

  leftDisplay.name = 'ShopDisplayWindow';
  leftDisplay.scale.x = sideWidth;
  leftDisplay.position.set(
    -doorWidth / 2 - sideWidth / 2 - 0.08,
    1.55,
    frontZ
  );

  group.add(leftDisplay);

  // Right shop display window.
  const rightDisplay = leftDisplay.clone();

  rightDisplay.name = 'ShopDisplayWindow';
  rightDisplay.position.x =
    doorWidth / 2 + sideWidth / 2 + 0.08;

  group.add(rightDisplay);

  // Contrasting entrance.
  const door = new THREE.Mesh(
    geometries.shopDoor,
    darkGlassMaterial
  );

  door.name = 'ShopEntrance';
  door.position.set(0, 1.25, frontZ + 0.035);

  group.add(door);

  // Door handle.
  const handle = new THREE.Mesh(
    geometries.doorHandle,
    metalMaterial
  );

  handle.name = 'ShopDoorHandle';
  handle.position.set(0.25, 1.25, frontZ + 0.13);

  group.add(handle);

  // Colored sign panel above the shop.
  const sign = new THREE.Mesh(
    geometries.shopSign,
    signMaterial
  );

  sign.name = 'ShopSign';
  sign.scale.x = width * 0.66;
  sign.position.set(0, 2.55, frontZ + 0.06);

  group.add(sign);

  // Small contrasting awning.
  const awningMaterial =
    awningMaterials[index % awningMaterials.length];

  const awning = new THREE.Mesh(
    geometries.awning,
    awningMaterial
  );

  awning.name = 'ShopAwning';
  awning.scale.x = width * 0.78;
  awning.position.set(0, 2.22, frontZ + 0.42);
  awning.rotation.x = -0.08;

  group.add(awning);

  // Front valance.
  const valance = new THREE.Mesh(
    geometries.awningValance,
    signMaterial
  );

  valance.name = 'AwningValance';
  valance.scale.x = width * 0.78;
  valance.position.set(0, 2.08, frontZ + 0.76);

  group.add(valance);

  // Awning supports.
  [-width * 0.32, width * 0.32].forEach((x) => {
    const support = new THREE.Mesh(
      geometries.awningSupport,
      metalMaterial
    );

    support.name = 'AwningSupport';
    support.position.set(x, 1.92, frontZ + 0.43);

    group.add(support);
  });

  // Ground-floor side accent varies by building style.
  if (style % 2 === 0) {
    const lowerTrim = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.12, 0.14),
      accentMaterials[index % accentMaterials.length]
    );

    lowerTrim.name = 'ShopLowerTrim';
    lowerTrim.position.set(0, 0.28, frontZ + 0.02);

    group.add(lowerTrim);
  }
}
