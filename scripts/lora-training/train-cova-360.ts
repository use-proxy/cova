/**
 * Cova 360° LoRA Training Pipeline
 *
 * Curates equirectangular interior images from Poly Haven and Flickr,
 * trains a FLUX LoRA via Replicate, and runs test inferences.
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

interface PolyHavenFilesResponse {
  hdri: {
    [resolution: string]: {
      hdr?: { url: string };
      exr?: { url: string };
    };
  };
  tonemapped?: {
    [resolution: string]: {
      jpg?: { url: string };
      png?: { url: string };
    };
  };
  backplates?: Record<string, unknown>;
}

interface DatasetImage {
  id: string;
  source: 'polyhaven' | 'flickr';
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

    const filesData: PolyHavenFilesResponse = await filesResponse.json() as PolyHavenFilesResponse;

    // Look for tonemapped JPG at 4k or higher resolution
    const tonemapped = filesData.tonemapped;
    if (!tonemapped) {
      log(`  Skipping ${assetId}: no tonemapped images available`);
      return null;
    }

    // Prefer 4k, then 2k
    const preferredResolutions = ['4k', '2k', '8k'];
    let downloadUrl: string | null = null;
    let chosenRes = '';

    for (const res of preferredResolutions) {
      const resData = tonemapped[res];
      if (resData) {
        const jpgEntry = resData as Record<string, { url: string } | undefined>;
        if (jpgEntry['jpg']?.url) {
          downloadUrl = jpgEntry['jpg'].url;
          chosenRes = res;
          break;
        }
        if (jpgEntry['png']?.url) {
          downloadUrl = jpgEntry['png'].url;
          chosenRes = res;
          break;
        }
      }
    }

    if (!downloadUrl) {
      log(`  Skipping ${assetId}: no suitable tonemapped resolution found`);
      return null;
    }

    const filename = `polyhaven_${assetId}_${chosenRes}.jpg`;
    const destPath = path.join(DATASET_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(destPath)) {
      log(`  Already downloaded: ${filename}`);
      const dims = readJpegDimensions(destPath);
      if (dims.width >= MIN_SOURCE_WIDTH && isEquirectangular(dims.width, dims.height)) {
        return {
          id: assetId,
          source: 'polyhaven',
          localPath: destPath,
          width: dims.width,
          height: dims.height,
          caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${assetId.replace(/_/g, ' ')}`,
        };
      }
      log(`  Previously downloaded but does not meet criteria (${dims.width}x${dims.height})`);
      return null;
    }

    log(`  Downloading ${chosenRes} JPG from Poly Haven...`);
    await downloadFile(downloadUrl, destPath);

    // Check dimensions
    const dims = readJpegDimensions(destPath);
    log(`  Downloaded: ${dims.width}x${dims.height}`);

    if (dims.width < MIN_SOURCE_WIDTH) {
      log(`  Skipping: width ${dims.width} < ${MIN_SOURCE_WIDTH}`);
      fs.unlinkSync(destPath);
      return null;
    }

    if (!isEquirectangular(dims.width, dims.height)) {
      log(`  Skipping: aspect ratio ${(dims.width / dims.height).toFixed(2)} is not ~2:1`);
      fs.unlinkSync(destPath);
      return null;
    }

    return {
      id: assetId,
      source: 'polyhaven',
      localPath: destPath,
      width: dims.width,
      height: dims.height,
      caption: `equirectangular 360 degree panoramic interior photograph, indoor room, ${assetId.replace(/_/g, ' ')}`,
    };
  } catch (error) {
    logError(`Failed to process Poly Haven asset: ${assetId}`, error);
    return null;
  }
}

async function curateDataset(): Promise<DatasetImage[]> {
  log('=== STEP 1: Curating Training Dataset ===');

  fs.mkdirSync(DATASET_DIR, { recursive: true });

  const assetIds = await fetchPolyHavenIndoorHDRIs();
  const images: DatasetImage[] = [];

  // Process sequentially to respect rate limits
  for (let i = 0; i < assetIds.length; i++) {
    const image = await downloadPolyHavenImage(assetIds[i], i);
    if (image) {
      images.push(image);
      log(`  Accepted (${images.length} total): ${image.id} — ${image.width}x${image.height}`);
    }

    // Brief pause between requests to be polite
    if (i < assetIds.length - 1) {
      await sleep(500);
    }
  }

  log(`Dataset curation complete: ${images.length} qualifying images`);

  if (images.length === 0) {
    throw new Error(
      'No qualifying images found. Check Poly Haven API response or relax filters.'
    );
  }

  // Write manifest
  const manifestPath = path.join(DATASET_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(images, null, 2));
  log(`Manifest saved to ${manifestPath}`);

  return images;
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
    const ext = path.extname(image.localPath);
    const baseName = `${image.id}${ext}`;
    const destImage = path.join(packageDir, baseName);
    const destCaption = path.join(
      packageDir,
      `${image.id}.txt`
    );

    // Copy image
    fs.copyFileSync(image.localPath, destImage);

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

  // Replicate file uploads API
  const fileBuffer = fs.readFileSync(zipPath);
  const fileSize = fileBuffer.length;

  log(`Uploading ${(fileSize / 1024 / 1024).toFixed(1)} MB to Replicate...`);

  // Step 1: Create upload
  const createResponse = await fetch(`${REPLICATE_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      ...replicateHeaders(),
      'Content-Type': 'application/zip',
      'Content-Length': String(fileSize),
      'Content-Disposition': 'attachment; filename="training-dataset.zip"',
    },
    body: fileBuffer,
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(
      `Failed to upload to Replicate: ${createResponse.status} — ${errorText}`
    );
  }

  const uploadResult = await createResponse.json() as { urls: { get: string } };
  const datasetUrl = uploadResult.urls.get;
  log(`Dataset uploaded: ${datasetUrl}`);

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

  // Create a destination model for the trained LoRA
  const createModelResponse = await fetch(`${REPLICATE_BASE_URL}/models`, {
    method: 'POST',
    headers: replicateHeaders(),
    body: JSON.stringify({
      owner: 'cova',
      name: 'cova-interior-360-lora',
      description: 'FLUX LoRA fine-tuned for equirectangular 360° interior renders',
      visibility: 'private',
      hardware: 'gpu-a40-large',
    }),
  });

  if (!createModelResponse.ok) {
    const errorText = await createModelResponse.text();
    // Model might already exist — that's fine
    if (!errorText.includes('already exists')) {
      log(`Warning: Could not create destination model: ${errorText}`);
    } else {
      log('Destination model already exists — reusing');
    }
  } else {
    log('Created destination model: cova/cova-interior-360-lora');
  }

  const response = await fetch(
    `${REPLICATE_BASE_URL}/models/${FLUX_LORA_TRAINER_MODEL}/versions/${FLUX_LORA_TRAINER_VERSION}/trainings`,
    {
      method: 'POST',
      headers: replicateHeaders(),
      body: JSON.stringify({
        destination: 'cova/cova-interior-360-lora',
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
    log('The trained model is available at: cova/cova-interior-360-lora');

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
      model: 'cova/cova-interior-360-lora',
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
        model: 'cova/cova-interior-360-lora',
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
    log(`  Model: cova/cova-interior-360-lora`);
    log(`  Trigger word: ${TRAINING_CONFIG.trigger_word}`);
    log(`  Test outputs: ${TEST_OUTPUT_DIR}`);
    log('========================================');
  } catch (error) {
    logError('Pipeline failed', error);
    process.exit(1);
  }
}

main();
