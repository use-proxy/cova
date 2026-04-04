import Replicate from 'replicate'

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export interface Detection {
  type: string
  label: string
  bbox: [number, number, number, number]
  confidence: number
  showToUser: boolean
}

const FURNITURE_LABELS = [
  'sofa',
  'couch',
  'chair',
  'armchair',
  'bed',
  'desk',
  'table',
  'coffee table',
  'dining table',
  'bookshelf',
  'wardrobe',
  'dresser',
  'nightstand',
  'lamp',
  'rug',
  'curtains',
  'tv',
  'television',
  'plant',
  'artwork',
  'mirror',
  'cabinet',
  'shelf',
  'ottoman',
  'bench',
]

const ARCHITECTURE_LABELS = [
  'floor',
  'wall',
  'ceiling',
  'window',
  'door',
  'fireplace',
  'stairs',
  'column',
  'arch',
  'exposed brick',
  'built-in',
  'baseboard',
]

export async function detectFurniture(photoUrl: string): Promise<Detection[]> {
  try {
    const prompt = FURNITURE_LABELS.join(' . ')

    const output = (await replicate.run(
      'adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734419b7d746a3f64db15559728',
      {
        input: {
          image: photoUrl,
          query: prompt,
          box_threshold: 0.7,
          text_threshold: 0.7,
        },
      }
    )) as {
      detections?: Array<{
        label: string
        confidence: number
        bbox: number[]
      }>
    }

    if (!output.detections) return []

    return output.detections
      .filter((d) => d.confidence >= 0.7)
      .map((d) => ({
        type: 'furniture',
        label: d.label,
        bbox: d.bbox as [number, number, number, number],
        confidence: d.confidence,
        showToUser: d.confidence >= 0.85,
      }))
  } catch {
    return []
  }
}

export async function detectArchitecture(photoUrl: string): Promise<Detection[]> {
  try {
    const prompt = ARCHITECTURE_LABELS.join(' . ')

    const output = (await replicate.run(
      'adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734419b7d746a3f64db15559728',
      {
        input: {
          image: photoUrl,
          query: prompt,
          box_threshold: 0.7,
          text_threshold: 0.7,
        },
      }
    )) as {
      detections?: Array<{
        label: string
        confidence: number
        bbox: number[]
      }>
    }

    if (!output.detections) return []

    return output.detections
      .filter((d) => d.confidence >= 0.7)
      .map((d) => ({
        type: 'architecture',
        label: d.label,
        bbox: d.bbox as [number, number, number, number],
        confidence: d.confidence,
        showToUser: d.confidence >= 0.85,
      }))
  } catch {
    return []
  }
}
