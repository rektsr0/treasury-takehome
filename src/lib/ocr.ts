import type { OcrResult } from '../types.ts';

type TesseractApi = typeof import('tesseract.js');
type TesseractWorker = import('tesseract.js').Worker;

const assetBase = '/vendor/tesseract';
let tesseractPromise: Promise<TesseractApi> | null = null;
let workerPromise: Promise<TesseractWorker> | null = null;
let activeProgressListener: ((message: string) => void) | null = null;

const loadTesseract = async (): Promise<TesseractApi> => {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js').then((module) => {
      const defaultExport = (module as { default?: unknown }).default;
      const api = defaultExport && typeof defaultExport === 'object' ? defaultExport : module;
      return api as TesseractApi;
    });
  }

  return tesseractPromise;
};

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = loadTesseract().then(async (tesseract) => {
      const worker = await tesseract.createWorker('eng', tesseract.OEM.LSTM_ONLY, {
        workerPath: `${assetBase}/dist/worker.min.js`,
        corePath: `${assetBase}/core`,
        langPath: `${assetBase}/lang`,
        logger: (message) => {
          if (!activeProgressListener) {
            return;
          }

          const percent = Math.max(1, Math.round(message.progress * 100));
          activeProgressListener(`${message.status.replaceAll('-', ' ')} ${percent}%`);
        },
        errorHandler: (error) => {
          console.error('Tesseract worker error', error);
        },
      });

      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });

      return worker;
    });
  }

  return workerPromise;
};

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected label image could not be loaded.'));
    image.src = source;
  });

const preprocessImage = async (source: string) => {
  const image = await loadImage(source);
  const longestEdge = Math.max(image.width, image.height);
  const scale = Math.min(2, Math.max(1, 1800 / longestEdge));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The browser could not prepare the label image for OCR.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const grayscale = red * 0.299 + green * 0.587 + blue * 0.114;
    const contrasted = Math.max(0, Math.min(255, (grayscale - 128) * 1.35 + 138));

    data[index] = contrasted;
    data[index + 1] = contrasted;
    data[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
};

export const warmOcrEngine = async () => {
  await getWorker();
};

export const recognizeLabel = async (
  source: string,
  onProgress?: (message: string) => void,
): Promise<OcrResult> => {
  const startedAt = performance.now();
  activeProgressListener = onProgress ?? null;
  onProgress?.('preparing image 1%');

  try {
    const worker = await getWorker();
    const canvas = await preprocessImage(source);
    const { data } = await worker.recognize(
      canvas,
      {
        rotateAuto: true,
      },
      {
        text: true,
        blocks: true,
      },
    );

    const cleanedText = data.text.replace(/\s+\n/g, '\n').trim();
    const lines = cleanedText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    return {
      text: cleanedText,
      confidence: data.confidence,
      durationMs: Math.round(performance.now() - startedAt),
      lines,
    };
  } finally {
    activeProgressListener = null;
  }
};
