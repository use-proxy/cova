/**
 * Cova 360° LoRA Training Pipeline
 *
 * Curates equirectangular interior images from three sources:
 *   1. Poly Haven — HDR→tonemapped JPG conversion + backplates
 *   2. Flickr — Creative Commons equirectangular interior photos
 *   3. Hugging Face — public indoor-360 datasets
 *
 * Trains a FLUX LoRA via Replicate and runs test inferences.
 *
 * Usage: npx ts-node scripts/lora-training/train-cova-360.ts
 *
 * Requires: REPLICATE_API_TOKEN env var
 */

import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PolyHavenAsset {
  name: string;
  categories: string[];
  tags: string[];
}

interface PolyHavenAssetsResponse {
  [key: string]: PolyHavenAsset;
}

interface PolyHavenFileEntry {
  size: number;
  url: string;
  md5: string;
}

interface PolyHavenFilesResponse {
  hdri: {
    [resolution: string]: {
      hdr?: PolyHavenFileEntry;
      exr?: PolyHavenFileEntry;
    };
  };
  /** Flat object with direct url — NOT nested by resolution */
  tonemapped?: PolyHavenFileEntry;
  backplates?: Record<string, unknown>;
}

interface DatasetImage {
  id: string;
  source: 'polyhaven' | 'flickr' | 'huggingface';
  localPath: string;
  width: number;
  height: number;
  caption: string;
}

interface ReplicateTrainingInput {
  input_images: string;
  trigger_word: string;
  steps: number;
  batch_size: number;
  learning_rate: number;
  resolution: string;
  autocaption: boolean;
  lora_rank: number;
  optimizer: string;
}

interface ReplicateTraining {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  model: string;
  version: string;
  urls: {
    get: string;
    cancel: string;
  };
  output: Record<string, string> | null;
  error: string | null;
  logs: string;
  created_at: string;
  completed_at: string | null;
}

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output: string[] | null;
  error: string | null;
  logs: string;
}

interface ImageDimensions {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_BASE_URL = 'https://api.replicate.com/v1';
const POLYHAVEN_API_URL = 'https://api.polyhaven.com';
const FLICKR_API_URL = 'https://www.flickr.com/services/rest';
const FLICKR_API_KEY = process.env.FLICKR_API_KEY ?? '';
const HF_DATASET_ID = 'Nielsrb/indoor-360-images';
const HF_API_URL = 'https://huggingface.co/api/datasets';

const MIN_QUALIFYING_IMAGES = 50;
const MAX_TRAINING_IMAGES = 150; // LoRA works well with 50-150; also keeps ZIP under 100MB upload limit

const FLUX_LORA_TRAINER_MODEL = 'ostris/flux-dev-lora-trainer';
const FLUX_LORA_TRAINER_VERSION =
  'b6af14222e6bd9be257cbc1ea4afda3cd0503e1133083b9d1de0364d8568e6ef';

const TRAINING_CONFIG: ReplicateTrainingInput = {
  input_images: '', // set after dataset upload
  trigger_word: 'COVAINTERIOR360',
  steps: 2000,
  batch_size: 1,
  learning_rate: 0.0004,
  resolution: '1024',
  autocaption: true,
  lora_rank: 16,
  optimizer: 'adamw8bit',
};

const TARGET_WIDTH = 2048;
const TARGET_HEIGHT = 1024;
const MIN_SOURCE_WIDTH = 2048;

const DATASET_DIR = path.resolve(__dirname, 'dataset');
const TEST_OUTPUT_DIR = path.resolve(__dirname, 'test-outputs');

const TEST_PROMPTS = [
  'COVAINTERIOR360 equirectangular panoramic view of a modern coastal living room with light wood floors, white walls, linen sofa, ocean blue accents, photorealistic, 8k',
  'COVAINTERIOR360 equirectangular panoramic view of a minimalist bedroom with concrete floor, platform bed, neutral palette, floor to ceiling windows, photorealistic, 8k',
  'COVAINTERIOR360 equirectangular panoramic view of a japandi kitchen with warm oak cabinets, ceramic backsplash, pendant lights, natural materials, photorealistic, 8k',
  'COVAINTERIOR360 equirectangular panoramic view of a bohemian dining room with reclaimed wood table, woven chairs, terracotta pots, warm lighting, photorealistic, 8k',
  'COVAINTERIOR360 equirectangular panoramic view of a mid century modern home office with walnut desk, Eames chair, geometric rug, brass lamp, photorealistic, 8k',
];

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 3_600_000; // 1 hour for training

// Set dynamically after Replicate account lookup
let TRAINED_MODEL_DESTINATION = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logError(message: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  console.error(`[${timestamp}] ERROR: ${message} — ${errorMessage}`);
}

function replicateHeaders(): Record<string, string> {
  if (!REPLICATE_API_TOKEN) {
    throw new Error(
      'REPLICATE_API_TOKEN not set. Export it before running this script.'
    );
  }
  return {
    Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`No response body for ${url}`);
  }
  const nodeStream = Readable.fromWeb(response.body as import('stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));
}

/**
 * Read JPEG dimensions from file header without loading the full image.
 * Falls back to returning 0x0 if unable to parse.
 */
function readJpegDimensions(filePath: string): ImageDimensions {
  const buffer = fs.readFileSync(filePath);
  let offset = 2; // skip SOI marker

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }
    const marker = buffer[offset + 1];

    // SOF0 through SOF3 contain dimensions
    if (marker >= 0xc0 && marker <= 0xc3) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip non-SOF markers
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }

  return { width: 0, height: 0 };
}

/**
 * Check if image has approximately 2:1 aspect ratio (equirectangular).
 */
function isEquirectangular(width: number, height: number): boolean {
  if (width === 0 || height === 0) return false;
  const ratio = width / height;
  return ratio >= 1.9 && ratio <= 2.1;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Step 1: Curate Dataset from Poly Haven
// ---------------------------------------------------------------------------

async function fetchPolyHavenIndoorHDRIs(): Promise<string[]> {
  log('Fetching Poly Haven indoor HDRI asset list...');

  const response = await fetch(
    `${POLYHAVEN_API_URL}/assets?type=hdris&categories=indoor`
  );
  if (!response.ok) {
    throw new Error(
      `Poly Haven API error: ${response.status} ${response.statusText}`
    );
  }

  const assets: PolyHavenAssetsResponse = await response.json() as PolyHavenAssetsResponse;
  const assetIds = Object.keys(assets);
  log(`Found ${assetIds.length} indoor HDRI assets on Poly Haven`);
  return assetIds;
}

async function downloadPolyHavenImage(
  assetId: string,
  index: number
): Promise<DatasetImage | null> {
  try {
    log(`[${index + 1}] Fetching file info for: ${assetId}`);

    const filesResponse = await fetch(
      `${POLYHAVEN_API_URL}/files/${assetId}`
    );
    if (!filesResponse.ok) {
      log(`  Skipping ${assetId}: files API returned ${filesResponse.status}`);
      return null;
    }

    const filesData: PolyHavenFilesResponse =
      (await filesResponse.json()) as PolyHavenFilesResponse;

    const destJpgPath = path.join(DATASET_DIR, `polyhaven_${assetId}.jpg`);

    // Skip if already downloaded and valid
    if (fs.existsSync(destJpgPath)) {
      log(`  Already downloaded: polyhaven_${assetId}.jpg`);
      const dims = readJpegDimensions(destJpgPath);
      if (
        dims.width >= MIN_SOURCE_WIDTH &&
        isEquirectangular(dims.width, dims.height)
      ) {
        return {
          id: assetId,
          source: 'polyhaven',
          localPath: destJpgPath,
          width: dims.width,
          height: dims.height,
          caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${assetId.replace(/_/g, ' ')}`,
        };
      }
      log(
        `  Previously downloaded but does not meet criteria (${dims.width}x${dims.height})`
      );
      return null;
    }

    // ----- Strategy A: Download tonemapped JPG (flat URL, not nested by resolution) -----
    if (filesData.tonemapped?.url) {
      log(`  Downloading tonemapped JPG for ${assetId}...`);
      await downloadFile(filesData.tonemapped.url, destJpgPath);
      const dims = readJpegDimensions(destJpgPath);
      if (
        dims.width >= MIN_SOURCE_WIDTH &&
        isEquirectangular(dims.width, dims.height)
      ) {
        log(`  Tonemapped accepted: ${dims.width}x${dims.height}`);
        return {
          id: assetId,
          source: 'polyhaven',
          localPath: destJpgPath,
          width: dims.width,
          height: dims.height,
          caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${assetId.replace(/_/g, ' ')}`,
        };
      }
      log(`  Tonemapped rejected: ${dims.width}x${dims.height} (ratio ${dims.width > 0 ? (dims.width / dims.height).toFixed(2) : 'N/A'})`);
      fs.unlinkSync(destJpgPath);
    }

    // ----- Strategy B: Check backplates for direct JPG URLs -----
    if (filesData.backplates) {
      const bpResolutions = ['4k', '2k', '8k'];
      for (const res of bpResolutions) {
        const bpRes = (filesData.backplates as Record<string, Record<string, { url?: string }>>)[res];
        if (bpRes) {
          const jpgUrl = bpRes['jpg']?.url;
          if (jpgUrl) {
            log(`  Downloading ${res} backplate JPG for ${assetId}...`);
            await downloadFile(jpgUrl, destJpgPath);
            const dims = readJpegDimensions(destJpgPath);
            if (
              dims.width >= MIN_SOURCE_WIDTH &&
              isEquirectangular(dims.width, dims.height)
            ) {
              log(`  Backplate accepted: ${dims.width}x${dims.height}`);
              return {
                id: assetId,
                source: 'polyhaven',
                localPath: destJpgPath,
                width: dims.width,
                height: dims.height,
                caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${assetId.replace(/_/g, ' ')}`,
              };
            }
            fs.unlinkSync(destJpgPath);
            break;
          }
        }
      }
    }

    log(`  Skipping ${assetId}: no qualifying JPG source`);
    return null;
  } catch (error) {
    logError(`Failed to process Poly Haven asset: ${assetId}`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 2: Flickr API — Creative Commons equirectangular interiors
// ---------------------------------------------------------------------------

interface FlickrPhoto {
  id: string;
  owner: string;
  title: string;
  url_o?: string;
  width_o?: string;
  height_o?: string;
  url_l?: string;
  width_l?: string;
  height_l?: string;
  url_k?: string;
  width_k?: string;
  height_k?: string;
}

interface FlickrSearchResponse {
  photos: {
    page: number;
    pages: number;
    perpage: number;
    total: number;
    photo: FlickrPhoto[];
  };
  stat: string;
}

async function fetchFlickrImages(): Promise<DatasetImage[]> {
  log('--- Source 2: Flickr Creative Commons equirectangular interiors ---');

  if (!FLICKR_API_KEY) {
    log('  FLICKR_API_KEY not set — skipping Flickr source');
    log('  (Set FLICKR_API_KEY in .env.local to enable)');
    return [];
  }

  const images: DatasetImage[] = [];
  const searchQueries = [
    'equirectangular interior room 360',
    'equirectangular indoor panorama',
    '360 panoramic interior design room',
  ];

  for (const query of searchQueries) {
    try {
      const params = new URLSearchParams({
        method: 'flickr.photos.search',
        api_key: FLICKR_API_KEY,
        text: query,
        license: '4,5,9,10', // Creative Commons
        media: 'photos',
        content_type: '1', // photos only
        extras: 'url_o,url_k,url_l,o_dims',
        per_page: '100',
        page: '1',
        format: 'json',
        nojsoncallback: '1',
        sort: 'relevance',
      });

      log(`  Searching Flickr: "${query}"`);
      const response = await fetch(`${FLICKR_API_URL}?${params}`);
      if (!response.ok) {
        log(`  Flickr API error: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as FlickrSearchResponse;
      if (data.stat !== 'ok') {
        log(`  Flickr returned non-ok status`);
        continue;
      }

      log(`  Found ${data.photos.total} results, processing page 1...`);

      for (const photo of data.photos.photo) {
        // Pick the largest available URL
        const url = photo.url_o ?? photo.url_k ?? photo.url_l;
        const widthStr = photo.url_o
          ? photo.width_o
          : photo.url_k
            ? photo.width_k
            : photo.width_l;
        const heightStr = photo.url_o
          ? photo.height_o
          : photo.url_k
            ? photo.height_k
            : photo.height_l;

        if (!url || !widthStr || !heightStr) continue;

        const w = parseInt(widthStr, 10);
        const h = parseInt(heightStr, 10);

        if (w < MIN_SOURCE_WIDTH) continue;
        if (!isEquirectangular(w, h)) continue;

        const filename = `flickr_${photo.id}.jpg`;
        const destPath = path.join(DATASET_DIR, filename);

        if (fs.existsSync(destPath)) {
          const dims = readJpegDimensions(destPath);
          if (
            dims.width >= MIN_SOURCE_WIDTH &&
            isEquirectangular(dims.width, dims.height)
          ) {
            images.push({
              id: `flickr_${photo.id}`,
              source: 'flickr',
              localPath: destPath,
              width: dims.width,
              height: dims.height,
              caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${photo.title || 'untitled'}`,
            });
            continue;
          }
        }

        try {
          log(`  Downloading Flickr photo ${photo.id} (${w}x${h})...`);
          await downloadFile(url, destPath);

          const dims = readJpegDimensions(destPath);
          if (
            dims.width >= MIN_SOURCE_WIDTH &&
            isEquirectangular(dims.width, dims.height)
          ) {
            images.push({
              id: `flickr_${photo.id}`,
              source: 'flickr',
              localPath: destPath,
              width: dims.width,
              height: dims.height,
              caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${photo.title || 'untitled'}`,
            });
            log(`  Accepted: flickr_${photo.id} — ${dims.width}x${dims.height}`);
          } else {
            fs.unlinkSync(destPath);
          }
        } catch (dlErr) {
          logError(`  Failed to download Flickr photo ${photo.id}`, dlErr);
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        }

        await sleep(300);
      }
    } catch (err) {
      logError(`Flickr search failed for query: "${query}"`, err);
    }
  }

  log(`  Flickr source: ${images.length} qualifying images`);
  return images;
}

// ---------------------------------------------------------------------------
// Source 3: Hugging Face datasets — indoor 360 images
// ---------------------------------------------------------------------------

interface HFFileEntry {
  rfilename: string;
}

async function fetchHuggingFaceImages(): Promise<DatasetImage[]> {
  log('--- Source 3: Hugging Face indoor-360-images dataset ---');

  const images: DatasetImage[] = [];

  try {
    // List files in the dataset repository
    const listUrl = `${HF_API_URL}/${HF_DATASET_ID}/tree/main`;
    log(`  Fetching file list from ${listUrl}`);

    const response = await fetch(listUrl);
    if (!response.ok) {
      log(`  HF API error: ${response.status} ${response.statusText}`);
      log('  Trying alternative dataset IDs...');

      // Try alternative dataset names
      const alternatives = [
        'Nielsrb/indoor-360-images',
        'jasonkrone/indoor-panorama',
        'polyhaven/indoor-hdris',
      ];

      for (const altId of alternatives) {
        try {
          const altResponse = await fetch(
            `${HF_API_URL}/${altId}/tree/main`
          );
          if (altResponse.ok) {
            log(`  Found alternative dataset: ${altId}`);
            const altFiles = (await altResponse.json()) as HFFileEntry[];
            return await downloadHFFiles(altId, altFiles);
          }
        } catch {
          continue;
        }
      }

      log('  No Hugging Face datasets available — skipping');
      return [];
    }

    const files = (await response.json()) as HFFileEntry[];
    return await downloadHFFiles(HF_DATASET_ID, files);
  } catch (err) {
    logError('Hugging Face source failed', err);
    return [];
  }
}

async function downloadHFFiles(
  datasetId: string,
  files: HFFileEntry[]
): Promise<DatasetImage[]> {
  const images: DatasetImage[] = [];
  const imageFiles = files.filter((f) =>
    /\.(jpg|jpeg|png)$/i.test(f.rfilename)
  );

  log(`  Found ${imageFiles.length} image files in HF dataset`);

  for (const file of imageFiles) {
    const filename = `hf_${file.rfilename.replace(/\//g, '_')}`;
    const destPath = path.join(DATASET_DIR, filename);
    const destJpgPath = destPath.replace(/\.png$/i, '.jpg');
    const finalPath = /\.png$/i.test(filename) ? destJpgPath : destPath;

    if (fs.existsSync(finalPath)) {
      const dims = readJpegDimensions(finalPath);
      if (
        dims.width >= MIN_SOURCE_WIDTH &&
        isEquirectangular(dims.width, dims.height)
      ) {
        images.push({
          id: `hf_${path.basename(file.rfilename, path.extname(file.rfilename))}`,
          source: 'huggingface',
          localPath: finalPath,
          width: dims.width,
          height: dims.height,
          caption: `equirectangular 360 degree panoramic interior photograph, indoor room`,
        });
        continue;
      }
    }

    try {
      const dlUrl = `https://huggingface.co/datasets/${datasetId}/resolve/main/${file.rfilename}`;
      log(`  Downloading HF: ${file.rfilename}`);
      await downloadFile(dlUrl, destPath);

      // Convert PNG to JPG if needed
      if (/\.png$/i.test(file.rfilename)) {
        await sharp(destPath).jpeg({ quality: 90 }).toFile(destJpgPath);
        fs.unlinkSync(destPath);
      }

      const dims = readJpegDimensions(finalPath);
      if (
        dims.width >= MIN_SOURCE_WIDTH &&
        isEquirectangular(dims.width, dims.height)
      ) {
        images.push({
          id: `hf_${path.basename(file.rfilename, path.extname(file.rfilename))}`,
          source: 'huggingface',
          localPath: finalPath,
          width: dims.width,
          height: dims.height,
          caption: `equirectangular 360 degree panoramic interior photograph, indoor room`,
        });
        log(`  Accepted: ${filename} — ${dims.width}x${dims.height}`);
      } else {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        log(
          `  Skipping ${filename}: ${dims.width}x${dims.height} (ratio ${dims.width > 0 ? (dims.width / dims.height).toFixed(2) : 'N/A'})`
        );
      }
    } catch (dlErr) {
      logError(`  Failed to download HF file: ${file.rfilename}`, dlErr);
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    }

    await sleep(300);
  }

  log(`  Hugging Face source: ${images.length} qualifying images`);
  return images;
}

// ---------------------------------------------------------------------------
// Curate dataset from all three sources
// ---------------------------------------------------------------------------

async function curateDataset(): Promise<DatasetImage[]> {
  log('=== STEP 1: Curating Training Dataset ===');

  fs.mkdirSync(DATASET_DIR, { recursive: true });

  const allImages: DatasetImage[] = [];

  // --- Source 1: Poly Haven (HDR → tonemapped JPG + backplates) ---
  log('--- Source 1: Poly Haven indoor HDRIs ---');
  const assetIds = await fetchPolyHavenIndoorHDRIs();

  for (let i = 0; i < assetIds.length; i++) {
    const image = await downloadPolyHavenImage(assetIds[i], i);
    if (image) {
      allImages.push(image);
      log(
        `  Accepted (${allImages.length} total): ${image.id} — ${image.width}x${image.height}`
      );
    }

    // Brief pause between requests to be polite
    if (i < assetIds.length - 1) {
      await sleep(500);
    }
  }
  log(`Poly Haven source: ${allImages.length} qualifying images`);

  // --- Source 2: Flickr ---
  const flickrImages = await fetchFlickrImages();
  // Deduplicate by checking existing IDs
  const existingIds = new Set(allImages.map((img) => img.id));
  for (const img of flickrImages) {
    if (!existingIds.has(img.id)) {
      allImages.push(img);
      existingIds.add(img.id);
    }
  }
  log(`After Flickr: ${allImages.length} total qualifying images`);

  // --- Source 3: Hugging Face ---
  const hfImages = await fetchHuggingFaceImages();
  for (const img of hfImages) {
    if (!existingIds.has(img.id)) {
      allImages.push(img);
      existingIds.add(img.id);
    }
  }
  log(`After Hugging Face: ${allImages.length} total qualifying images`);

  // --- Enforce minimum count ---
  log(`\nDataset curation complete: ${allImages.length} qualifying images`);
  log(`Minimum required: ${MIN_QUALIFYING_IMAGES}`);

  if (allImages.length < MIN_QUALIFYING_IMAGES) {
    throw new Error(
      `Insufficient training images: found ${allImages.length}, need at least ${MIN_QUALIFYING_IMAGES}. ` +
        `Sources yielded — Poly Haven: ${allImages.filter((i) => i.source === 'polyhaven').length}, ` +
        `Flickr: ${allImages.filter((i) => i.source === 'flickr').length}, ` +
        `Hugging Face: ${allImages.filter((i) => i.source === 'huggingface').length}. ` +
        `Add FLICKR_API_KEY to .env.local or find additional public datasets.`
    );
  }

  // Cap to MAX_TRAINING_IMAGES — shuffle first for variety across sources
  let finalImages = allImages;
  if (allImages.length > MAX_TRAINING_IMAGES) {
    // Fisher-Yates shuffle for even distribution
    const shuffled = [...allImages];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    finalImages = shuffled.slice(0, MAX_TRAINING_IMAGES);
    log(`Capped to ${MAX_TRAINING_IMAGES} images (from ${allImages.length}) for training`);
  }

  // Write manifest
  const manifestPath = path.join(DATASET_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(finalImages, null, 2));
  log(`Manifest saved to ${manifestPath}`);

  return finalImages;
}

// ---------------------------------------------------------------------------
// Step 2: Package Dataset as ZIP for Replicate
// ---------------------------------------------------------------------------

async function packageDatasetAsZip(images: DatasetImage[]): Promise<string> {
  log('=== STEP 2: Packaging Dataset ===');

  // Replicate's trainer accepts a ZIP of images + optional captions.
  // We create a tar.gz using Node built-ins (zip requires external lib).
  // The trainer also accepts a URL to a zip — we'll create a local zip
  // and then the user can host it or we can use Replicate's file upload.

  // For simplicity, we'll create a ZIP-compatible directory structure
  // and let the user upload it. The script will generate the captions
  // as .txt files alongside images.

  const packageDir = path.join(DATASET_DIR, 'packaged');
  fs.mkdirSync(packageDir, { recursive: true });

  for (const image of images) {
    const baseName = `${image.id}.jpg`;
    const destImage = path.join(packageDir, baseName);
    const destCaption = path.join(
      packageDir,
      `${image.id}.txt`
    );

    // Resize to training dimensions (2048x1024) to keep ZIP under Replicate's 2GB limit
    if (image.width > TARGET_WIDTH) {
      log(`  Resizing ${image.id}: ${image.width}x${image.height} → ${TARGET_WIDTH}x${TARGET_HEIGHT}`);
      await sharp(image.localPath)
        .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'fill' })
        .jpeg({ quality: 80 })
        .toFile(destImage);
    } else {
      fs.copyFileSync(image.localPath, destImage);
    }

    // Write caption file
    fs.writeFileSync(destCaption, image.caption);
  }

  log(`Packaged ${images.length} images with captions to ${packageDir}`);

  // Create a zip using the tar command (macOS/Linux)
  const zipPath = path.join(DATASET_DIR, 'training-dataset.zip');

  const { execSync } = await import('child_process');
  try {
    execSync(
      `cd "${packageDir}" && zip -r "${zipPath}" .`,
      { stdio: 'pipe' }
    );
    log(`ZIP created: ${zipPath} (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (error) {
    logError('Failed to create ZIP — ensure "zip" command is available', error);
    throw error;
  }

  return zipPath;
}

// ---------------------------------------------------------------------------
// Step 3: Upload to Replicate and Start Training
// ---------------------------------------------------------------------------

async function uploadDatasetToReplicate(zipPath: string): Promise<string> {
  log('=== STEP 3: Uploading Dataset to Replicate ===');

  const fileSize = fs.statSync(zipPath).size;
  log(`Uploading ${(fileSize / 1024 / 1024).toFixed(1)} MB to Replicate...`);

  // Replicate expects multipart form data with a "content" field
  const fileBuffer = fs.readFileSync(zipPath);
  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  const formData = new FormData();
  formData.append('content', blob, 'training-dataset.zip');

  const response = await fetch(`${REPLICATE_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to upload to Replicate: ${response.status} — ${errorText}`
    );
  }

  const uploadResult = await response.json() as { id: string; urls: { get: string } };
  const datasetUrl = uploadResult.urls.get;
  log(`Dataset uploaded (file ID: ${uploadResult.id}): ${datasetUrl}`);

  return datasetUrl;
}

async function startTraining(datasetUrl: string): Promise<ReplicateTraining> {
  log('Starting LoRA training on Replicate...');

  const trainingInput: ReplicateTrainingInput = {
    ...TRAINING_CONFIG,
    input_images: datasetUrl,
  };

  log('Training configuration:');
  log(`  trigger_word: ${trainingInput.trigger_word}`);
  log(`  steps: ${trainingInput.steps}`);
  log(`  batch_size: ${trainingInput.batch_size}`);
  log(`  learning_rate: ${trainingInput.learning_rate}`);
  log(`  resolution: ${trainingInput.resolution}`);
  log(`  lora_rank: ${trainingInput.lora_rank}`);
  log(`  optimizer: ${trainingInput.optimizer}`);
  log(`  autocaption: ${trainingInput.autocaption}`);

  // Get the current user's username for model ownership
  const accountResponse = await fetch(`${REPLICATE_BASE_URL}/account`, {
    headers: replicateHeaders(),
  });
  if (!accountResponse.ok) {
    throw new Error(`Failed to fetch Replicate account: ${accountResponse.status}`);
  }
  const account = await accountResponse.json() as { username: string };
  const owner = account.username;
  const modelName = 'cova-interior-360-lora';
  const destination = `${owner}/${modelName}`;
  TRAINED_MODEL_DESTINATION = destination;
  log(`Replicate account: ${owner}`);

  // Create a destination model for the trained LoRA
  const createModelResponse = await fetch(`${REPLICATE_BASE_URL}/models`, {
    method: 'POST',
    headers: replicateHeaders(),
    body: JSON.stringify({
      owner,
      name: modelName,
      description: 'FLUX LoRA fine-tuned for equirectangular 360° interior renders',
      visibility: 'private',
      hardware: 'gpu-t4',
    }),
  });

  if (!createModelResponse.ok) {
    const errorText = await createModelResponse.text();
    // Model might already exist — that's fine
    if (errorText.includes('already exists')) {
      log(`Destination model already exists — reusing ${destination}`);
    } else {
      throw new Error(`Failed to create destination model: ${errorText}`);
    }
  } else {
    log(`Created destination model: ${destination}`);
  }

  const response = await fetch(
    `${REPLICATE_BASE_URL}/models/${FLUX_LORA_TRAINER_MODEL}/versions/${FLUX_LORA_TRAINER_VERSION}/trainings`,
    {
      method: 'POST',
      headers: replicateHeaders(),
      body: JSON.stringify({
        destination,
        input: trainingInput,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to start training: ${response.status} — ${errorText}`
    );
  }

  const training: ReplicateTraining = await response.json() as ReplicateTraining;
  log(`Training started: ${training.id}`);
  log(`Status: ${training.status}`);
  log(`Poll URL: ${training.urls.get}`);

  return training;
}

// ---------------------------------------------------------------------------
// Step 4: Poll Until Training Complete
// ---------------------------------------------------------------------------

async function pollTraining(training: ReplicateTraining): Promise<ReplicateTraining> {
  log('=== STEP 4: Polling Training Status ===');

  const startTime = Date.now();
  let current = training;
  let lastLogLength = 0;

  while (
    current.status === 'starting' ||
    current.status === 'processing'
  ) {
    const elapsed = Date.now() - startTime;
    if (elapsed > POLL_TIMEOUT_MS) {
      throw new Error(
        `Training timed out after ${POLL_TIMEOUT_MS / 60_000} minutes`
      );
    }

    await sleep(POLL_INTERVAL_MS);

    const response = await fetch(current.urls.get, {
      headers: replicateHeaders(),
    });

    if (!response.ok) {
      logError(`Poll failed: ${response.status}`, response.statusText);
      continue;
    }

    current = await response.json() as ReplicateTraining;

    // Print new log lines
    if (current.logs && current.logs.length > lastLogLength) {
      const newLogs = current.logs.slice(lastLogLength);
      process.stdout.write(newLogs);
      lastLogLength = current.logs.length;
    }

    const elapsedMin = (elapsed / 60_000).toFixed(1);
    log(`Status: ${current.status} (${elapsedMin} min elapsed)`);
  }

  if (current.status === 'succeeded') {
    log('Training completed successfully!');
    log(`Output: ${JSON.stringify(current.output, null, 2)}`);
  } else {
    throw new Error(
      `Training failed with status: ${current.status} — ${current.error ?? 'unknown error'}`
    );
  }

  return current;
}

// ---------------------------------------------------------------------------
// Step 5: Download Trained LoRA Weights
// ---------------------------------------------------------------------------

async function downloadWeights(training: ReplicateTraining): Promise<string> {
  log('=== STEP 5: Downloading Trained LoRA Weights ===');

  if (!training.output) {
    throw new Error('Training output is null — cannot download weights');
  }

  const weightsUrl = training.output['weights'] || training.output['version'];
  if (!weightsUrl) {
    log(`Training output keys: ${Object.keys(training.output).join(', ')}`);
    log('Note: LoRA weights are stored as a new model version on Replicate.');
    log(`The trained model is available at: ${TRAINED_MODEL_DESTINATION}`);

    const infoPath = path.join(TEST_OUTPUT_DIR, 'training-result.json');
    fs.writeFileSync(infoPath, JSON.stringify(training, null, 2));
    log(`Training result saved to ${infoPath}`);
    return infoPath;
  }

  const weightsPath = path.join(TEST_OUTPUT_DIR, 'cova-360-lora-weights.safetensors');
  log(`Downloading weights from: ${weightsUrl}`);
  await downloadFile(weightsUrl, weightsPath);
  log(`Weights saved to: ${weightsPath}`);

  // Also save full training result
  const resultPath = path.join(TEST_OUTPUT_DIR, 'training-result.json');
  fs.writeFileSync(resultPath, JSON.stringify(training, null, 2));

  return weightsPath;
}

// ---------------------------------------------------------------------------
// Step 6: Run Test Inferences
// ---------------------------------------------------------------------------

async function runTestInference(
  prompt: string,
  index: number
): Promise<string | null> {
  log(`  Test ${index + 1}/${TEST_PROMPTS.length}: ${prompt.slice(0, 80)}...`);

  const response = await fetch(`${REPLICATE_BASE_URL}/predictions`, {
    method: 'POST',
    headers: replicateHeaders(),
    body: JSON.stringify({
      // Use the trained model
      model: TRAINED_MODEL_DESTINATION,
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '2:1',
        output_format: 'jpg',
        output_quality: 90,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logError(`Test inference failed: ${response.status}`, errorText);
    return null;
  }

  let prediction: ReplicatePrediction = await response.json() as ReplicatePrediction;

  // Poll for completion
  const predictionUrl = `${REPLICATE_BASE_URL}/predictions/${prediction.id}`;
  const inferenceTimeout = 300_000; // 5 minutes
  const startTime = Date.now();

  while (
    prediction.status === 'starting' ||
    prediction.status === 'processing'
  ) {
    if (Date.now() - startTime > inferenceTimeout) {
      logError(`Test inference ${index + 1} timed out`, 'exceeded 5 minutes');
      return null;
    }
    await sleep(5_000);

    const pollResponse = await fetch(predictionUrl, {
      headers: replicateHeaders(),
    });
    if (!pollResponse.ok) continue;
    prediction = await pollResponse.json() as ReplicatePrediction;
  }

  if (prediction.status !== 'succeeded' || !prediction.output) {
    logError(
      `Test inference ${index + 1} failed: ${prediction.status}`,
      prediction.error ?? 'no output'
    );
    return null;
  }

  const outputUrl = Array.isArray(prediction.output)
    ? prediction.output[0]
    : String(prediction.output);
  const outputPath = path.join(
    TEST_OUTPUT_DIR,
    `test_${index + 1}_${Date.now()}.jpg`
  );

  await downloadFile(outputUrl, outputPath);
  log(`  Saved: ${outputPath}`);

  return outputPath;
}

async function runTestInferences(): Promise<void> {
  log('=== STEP 6: Running Test Inferences ===');

  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

  const results: Array<{ prompt: string; outputPath: string | null }> = [];

  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    const outputPath = await runTestInference(TEST_PROMPTS[i], i);
    results.push({ prompt: TEST_PROMPTS[i], outputPath });
  }

  // Summary
  const succeeded = results.filter((r) => r.outputPath !== null).length;
  const failed = results.length - succeeded;

  log('');
  log('=== TEST INFERENCE RESULTS ===');
  log(`Succeeded: ${succeeded}/${results.length}`);
  log(`Failed: ${failed}/${results.length}`);

  for (const result of results) {
    const status = result.outputPath ? 'OK' : 'FAIL';
    log(`  [${status}] ${result.prompt.slice(0, 60)}...`);
    if (result.outputPath) {
      log(`         → ${result.outputPath}`);
    }
  }

  // Save results summary
  const summaryPath = path.join(TEST_OUTPUT_DIR, 'inference-results.json');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        model: TRAINED_MODEL_DESTINATION,
        trigger_word: TRAINING_CONFIG.trigger_word,
        results: results.map((r) => ({
          prompt: r.prompt,
          output: r.outputPath,
          success: r.outputPath !== null,
        })),
        summary: { total: results.length, succeeded, failed },
      },
      null,
      2
    )
  );
  log(`Results summary saved to ${summaryPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('========================================');
  log('  Cova 360° LoRA Training Pipeline');
  log('========================================');
  log('');

  // Validate env
  if (!REPLICATE_API_TOKEN) {
    console.error(
      'ERROR: REPLICATE_API_TOKEN environment variable is not set.'
    );
    console.error(
      'Export it before running: export REPLICATE_API_TOKEN=r8_...'
    );
    process.exit(1);
  }

  log(`Replicate token: ${REPLICATE_API_TOKEN.slice(0, 6)}...${REPLICATE_API_TOKEN.slice(-4)}`);
  log(`Dataset directory: ${DATASET_DIR}`);
  log(`Test output directory: ${TEST_OUTPUT_DIR}`);
  log('');

  try {
    // Step 1: Curate dataset
    const images = await curateDataset();
    log(`\nCurated ${images.length} training images\n`);

    // Step 2: Package as ZIP
    const zipPath = await packageDatasetAsZip(images);
    log(`\nDataset packaged: ${zipPath}\n`);

    // Step 3: Upload and start training
    const datasetUrl = await uploadDatasetToReplicate(zipPath);
    const training = await startTraining(datasetUrl);
    log(`\nTraining ID: ${training.id}\n`);

    // Step 4: Poll until complete
    const completedTraining = await pollTraining(training);

    // Step 5: Download weights
    await downloadWeights(completedTraining);

    // Step 6: Test inferences
    await runTestInferences();

    log('');
    log('========================================');
    log('  Pipeline Complete!');
    log('========================================');
    log(`  Training ID: ${completedTraining.id}`);
    log(`  Model: ${TRAINED_MODEL_DESTINATION}`);
    log(`  Trigger word: ${TRAINING_CONFIG.trigger_word}`);
    log(`  Test outputs: ${TEST_OUTPUT_DIR}`);
    log('========================================');
  } catch (error) {
    logError('Pipeline failed', error);
    process.exit(1);
  }
}

main();
