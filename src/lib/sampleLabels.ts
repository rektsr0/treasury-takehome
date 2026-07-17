import { GOVERNMENT_WARNING } from './constants.ts';
import type { ApplicationRecord } from '../types.ts';

interface SampleBlueprint {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  producer: string;
  countryOfOrigin: string;
  labelBrandName?: string;
  labelAlcoholContent?: string;
  labelWarning?: string;
  accentColor: string;
  bannerColor: string;
  subtitle: string;
}

const SAMPLE_BLUEPRINTS: SampleBlueprint[] = [
  {
    brandName: 'Old Tom Distillery',
    classType: 'Kentucky Straight Bourbon Whiskey',
    alcoholContent: '45% Alc./Vol. (90 Proof)',
    netContents: '750 mL',
    producer: 'Bottled by Old Tom Distillery, Frankfort, KY',
    countryOfOrigin: 'Product of USA',
    accentColor: '#8b5e34',
    bannerColor: '#efe1c1',
    subtitle: 'Batch A-104 / domestic',
  },
  {
    brandName: "Stone's Throw",
    classType: 'London Dry Gin',
    alcoholContent: '42% Alc./Vol. (84 Proof)',
    netContents: '700 mL',
    producer: "Distilled & Bottled by Stone's Throw Spirits, Seattle, WA",
    countryOfOrigin: 'Product of USA',
    labelBrandName: "STONE'S THROW",
    accentColor: '#1f5662',
    bannerColor: '#d9eef2',
    subtitle: 'Importer queue / punctuation variance',
  },
  {
    brandName: 'Harbor Light Rum',
    classType: 'Premium Caribbean Rum',
    alcoholContent: '40% Alc./Vol. (80 Proof)',
    netContents: '750 mL',
    producer: 'Imported by Harbor Light Imports, Miami, FL',
    countryOfOrigin: 'Product of Jamaica',
    labelAlcoholContent: '38% Alc./Vol. (76 Proof)',
    labelWarning:
      'Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.',
    accentColor: '#8b3a2d',
    bannerColor: '#f7d9cf',
    subtitle: 'Imported sample / expected rejection',
  },
];

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) => {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth && line) {
      context.fillText(line, x, currentY);
      currentY += lineHeight;
      line = word;
      continue;
    }

    line = nextLine;
  }

  if (line) {
    context.fillText(line, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
};

const createLabelImage = (blueprint: SampleBlueprint) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1600;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create a rendering context for the sample label.');
  }

  context.fillStyle = '#f6f1e6';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = blueprint.accentColor;
  context.lineWidth = 14;
  context.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

  context.fillStyle = blueprint.bannerColor;
  context.fillRect(88, 88, canvas.width - 176, 146);

  context.fillStyle = '#1f2528';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.font = '600 32px Trebuchet MS';
  context.fillText('ALCOHOL BEVERAGE LABEL REVIEW SAMPLE', canvas.width / 2, 128);

  context.font = '700 96px Georgia';
  context.fillStyle = blueprint.accentColor;
  context.fillText(
    blueprint.labelBrandName ?? blueprint.brandName.toUpperCase(),
    canvas.width / 2,
    320,
  );

  context.font = '600 40px Georgia';
  context.fillStyle = '#23333a';
  context.fillText(blueprint.subtitle, canvas.width / 2, 446);

  context.textAlign = 'left';
  context.fillStyle = '#101518';
  context.font = '700 46px Trebuchet MS';
  context.fillText(blueprint.classType, 104, 612);

  context.font = '600 40px Trebuchet MS';
  context.fillText(blueprint.labelAlcoholContent ?? blueprint.alcoholContent, 104, 712);
  context.fillText(blueprint.netContents, 104, 790);

  context.font = '500 34px Trebuchet MS';
  context.fillText(blueprint.producer, 104, 920);
  context.fillText(blueprint.countryOfOrigin, 104, 980);

  context.strokeStyle = '#a7a19a';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(104, 1080);
  context.lineTo(canvas.width - 104, 1080);
  context.stroke();

  const warning = blueprint.labelWarning ?? GOVERNMENT_WARNING;
  const warningHeading = warning.startsWith('GOVERNMENT WARNING:')
    ? 'GOVERNMENT WARNING:'
    : 'Government Warning:';
  const warningBody = warning.replace(/^[A-Za-z ]+WARNING:\s*/, '');

  context.fillStyle = '#111';
  context.font = '700 30px Trebuchet MS';
  context.fillText(warningHeading, 104, 1124);

  context.font = '500 28px Trebuchet MS';
  wrapText(context, warningBody, 104, 1172, canvas.width - 208, 38);

  return canvas.toDataURL('image/png');
};

const createId = () => crypto.randomUUID();

export const buildDemoBatch = async (): Promise<ApplicationRecord[]> =>
  SAMPLE_BLUEPRINTS.map((blueprint) => {
    const image = createLabelImage(blueprint);

    return {
      id: createId(),
      brandName: blueprint.brandName,
      classType: blueprint.classType,
      alcoholContent: blueprint.alcoholContent,
      netContents: blueprint.netContents,
      producer: blueprint.producer,
      countryOfOrigin: blueprint.countryOfOrigin,
      label: {
        kind: 'sample',
        name: `${blueprint.brandName}.png`,
        previewUrl: image,
        ocrSource: image,
      },
      isReviewing: false,
    };
  });
