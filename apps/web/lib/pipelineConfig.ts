/**
 * Pipeline mode configuration.
 * Reads PIPELINE_MODE from env and exports typed config.
 *
 * Modes:
 *   full            — New architecture: multi-image + flythrough video + async Plus
 *   mini_both       — Mini for capture + Mini for redesign 3D (fastest, cheapest)
 *   mini_async_plus — Mini for capture, Plus for redesign 3D (legacy default)
 *   multi_image     — Reserved for future multi-image capture (legacy)
 *   pansplat        — Reserved for future PanSplat integration
 */

export type PipelineMode = 'full' | 'mini_both' | 'mini_async_plus' | 'multi_image' | 'pansplat'

export interface PipelineConfig {
  mode: PipelineMode
  useMiniFinal: boolean
  asyncPlusUpgrade: boolean
  captureMode: 'video' | 'multi_image'
  use3DModel: 'marble' | 'pansplat'
  estimatedTotalSeconds: number
  estimatedCostUsd: number
}

const MODE_CONFIGS: Record<PipelineMode, PipelineConfig> = {
  full: {
    mode: 'full',
    useMiniFinal: false,
    asyncPlusUpgrade: true,
    captureMode: 'multi_image',
    use3DModel: 'marble',
    estimatedTotalSeconds: 180, // ~3 min to video_ready, Plus in background
    estimatedCostUsd: 1.46,
  },
  mini_both: {
    mode: 'mini_both',
    useMiniFinal: true,
    asyncPlusUpgrade: false,
    captureMode: 'video',
    use3DModel: 'marble',
    estimatedTotalSeconds: 150,
    estimatedCostUsd: 0.30,
  },
  mini_async_plus: {
    mode: 'mini_async_plus',
    useMiniFinal: false,
    asyncPlusUpgrade: false,
    captureMode: 'video',
    use3DModel: 'marble',
    estimatedTotalSeconds: 480,
    estimatedCostUsd: 1.46,
  },
  multi_image: {
    mode: 'multi_image',
    useMiniFinal: true,
    asyncPlusUpgrade: false,
    captureMode: 'multi_image',
    use3DModel: 'marble',
    estimatedTotalSeconds: 120,
    estimatedCostUsd: 0.28,
  },
  pansplat: {
    mode: 'pansplat',
    useMiniFinal: true,
    asyncPlusUpgrade: false,
    captureMode: 'video',
    use3DModel: 'pansplat',
    estimatedTotalSeconds: 90,
    estimatedCostUsd: 0.10,
  },
}

export function getPipelineConfig(): PipelineConfig {
  const mode = (process.env.PIPELINE_MODE || 'full') as PipelineMode
  return MODE_CONFIGS[mode] ?? MODE_CONFIGS.full
}
