// ⚠️ ASSERTION: Metro requires static string literals in require().
// Dynamic path construction will NOT be bundled at build time.
// Every GLB file used in FURNITURE_CATALOG must have an explicit require() here.
// Keep this file in sync with furnitureCatalog.ts — one entry per catalog item.
//
// Paths are relative from apps/mobile/src/data/ to the monorepo root assets/:
// ../../../../assets/3d/furniture/ready/<filename>.glb

export const GLB_ASSETS: Record<string, number> = {
  // Bohemian
  'boho-sofa-01':       require('../../../../assets/3d/furniture/ready/boho_sofa.glb'),
  'boho-chair-01':      require('../../../../assets/3d/furniture/ready/boho_chair.glb'),
  'boho-rug-01':        require('../../../../assets/3d/furniture/ready/boho_rug.glb'),
  'boho-mirror-01':     require('../../../../assets/3d/furniture/ready/boho_mirror.glb'),
  'boho-plant-01':      require('../../../../assets/3d/furniture/ready/boho_plant.glb'),
  'boho-floor-lamp-01': require('../../../../assets/3d/furniture/ready/boho_floor_lamp.glb'),
  'boho-pendant-01':    require('../../../../assets/3d/furniture/ready/boho_pendant_lamp.glb'),
  'boho-cushions-01':   require('../../../../assets/3d/furniture/ready/boho_floor_cushions.glb'),

  // Coastal
  'coastal-sofa-01':    require('../../../../assets/3d/furniture/ready/coastal_sofa.glb'),
  'coastal-chair-01':   require('../../../../assets/3d/furniture/ready/coastal_rattan_chair.glb'),
  'coastal-coffee-01':  require('../../../../assets/3d/furniture/ready/coastal_coffee_table.glb'),
  'coastal-rug-01':     require('../../../../assets/3d/furniture/ready/coastal_rug.glb'),
  'coastal-plant-01':   require('../../../../assets/3d/furniture/ready/coastal_plant.glb'),
  'coastal-lamp-01':    require('../../../../assets/3d/furniture/ready/coastal_floor_lamp.glb'),
  'coastal-mirror-01':  require('../../../../assets/3d/furniture/ready/coastal_mirror.glb'),
  'coastal-pendant-01': require('../../../../assets/3d/furniture/ready/coastal_pendant_lamp.glb'),

  // Japandi
  'japandi-sofa-01':    require('../../../../assets/3d/furniture/ready/japandi_sofa.glb'),
  'japandi-chair-01':   require('../../../../assets/3d/furniture/ready/japandi_chair.glb'),
  'japandi-coffee-01':  require('../../../../assets/3d/furniture/ready/japandi_coffee_table.glb'),
  'japandi-side-01':    require('../../../../assets/3d/furniture/ready/japandi_side_table.glb'),
  'japandi-rug-01':     require('../../../../assets/3d/furniture/ready/japandi_rug.glb'),
  'japandi-lamp-01':    require('../../../../assets/3d/furniture/ready/japandi_floor_lamp.glb'),
  'japandi-pendant-01': require('../../../../assets/3d/furniture/ready/japandi_pendant_lamp.glb'),
  'japandi-mirror-01':  require('../../../../assets/3d/furniture/ready/japandi_mirror.glb'),
  'japandi-plant-01':   require('../../../../assets/3d/furniture/ready/japandi_plant_small.glb'),

  // Mid-Century
  'mid-sofa-01':         require('../../../../assets/3d/furniture/ready/midcentury_sofa.glb'),
  'mid-chair-01':        require('../../../../assets/3d/furniture/ready/midcentury_eames_chair.glb'),
  'mid-dining-chair-01': require('../../../../assets/3d/furniture/ready/midcentury_dining_chair.glb'),
  'mid-ottoman-01':      require('../../../../assets/3d/furniture/ready/midcentury_ottoman.glb'),
  'mid-sideboard-01':    require('../../../../assets/3d/furniture/ready/midcentury_sideboard.glb'),
  'mid-lamp-01':         require('../../../../assets/3d/furniture/ready/midcentury_floor_lamp.glb'),
  'mid-pendant-01':      require('../../../../assets/3d/furniture/ready/midcentury_pendant_lamp.glb'),
  'mid-table-lamp-01':   require('../../../../assets/3d/furniture/ready/midcentury_table_lamp.glb'),
  'mid-rug-01':          require('../../../../assets/3d/furniture/ready/midcentury_rug.glb'),

  // Minimalist (reuses industrial GLBs)
  'min-sofa-01':        require('../../../../assets/3d/furniture/ready/industrial_sofa.glb'),
  'min-coffee-01':      require('../../../../assets/3d/furniture/ready/industrial_coffee_table.glb'),
  'min-floor-lamp-01':  require('../../../../assets/3d/furniture/ready/industrial_floor_lamp.glb'),
  'min-pendant-01':     require('../../../../assets/3d/furniture/ready/industrial_pendant_lamp.glb'),
  'min-shelf-01':       require('../../../../assets/3d/furniture/ready/industrial_pipe_shelf.glb'),
  'min-rug-01':         require('../../../../assets/3d/furniture/ready/industrial_rug.glb'),
  'min-table-lamp-01':  require('../../../../assets/3d/furniture/ready/industrial_table_lamp.glb'),
  'min-plant-01':       require('../../../../assets/3d/furniture/ready/industrial_cactus.glb'),

  // Shared
  'plant-fiddle-01':    require('../../../../assets/3d/furniture/ready/plant_fiddle_leaf.glb'),
};
