import { GOVERNMENT_WARNING } from './constants.ts';
import type { ApplicationRecord, FieldCheck, OcrResult, ReviewResult } from '../types.ts';

const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizePunctuation = (value: string) =>
  collapseWhitespace(value)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-');

const normalizeLoose = (value: string) =>
  normalizePunctuation(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');

const normalizeBrand = (value: string) =>
  normalizeLoose(value)
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S');

const levenshteinDistance = (left: string, right: string) => {
  if (!left.length) {
    return right.length;
  }

  if (!right.length) {
    return left.length;
  }

  const rows = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = leftIndex - 1;
    rows[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = rows[rightIndex] ?? 0;
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      rows[rightIndex] = Math.min(
        (rows[rightIndex] ?? 0) + 1,
        (rows[rightIndex - 1] ?? 0) + 1,
        previous + cost,
      );
      previous = current;
    }
  }

  return rows[right.length] ?? 0;
};

const similarity = (left: string, right: string) => {
  if (!left && !right) {
    return 1;
  }

  const longest = Math.max(left.length, right.length);
  if (!longest) {
    return 1;
  }

  return 1 - levenshteinDistance(left, right) / longest;
};

const findBestLine = (
  expected: string,
  lines: string[],
  normalizer: (value: string) => string = normalizeLoose,
) => {
  const normalizedExpected = normalizer(expected);
  let bestLine = '';
  let bestScore = 0;

  for (const line of lines) {
    const score = similarity(normalizedExpected, normalizer(line));
    if (score > bestScore) {
      bestLine = line;
      bestScore = score;
    }
  }

  return { line: bestLine, score: bestScore };
};

const parseAlcohol = (value: string) => {
  const percentMatch = value.match(/(\d{1,2}(?:\.\d+)?)\s*%/i);
  const proofMatch = value.match(/(\d{1,3})\s*proof/i);

  return {
    percent: percentMatch?.[1] ?? '',
    proof: proofMatch?.[1] ?? '',
  };
};

const findAlcoholSnippet = (text: string) =>
  text.match(/\b\d{1,2}(?:\.\d+)?\s*%\s*(?:ALC\.?\s*\/?\s*VOL\.?)?(?:\s*\(\d{1,3}\s*PROOF\))?/i)?.[0] ??
  '';

const normalizeVolume = (value: string) =>
  value
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/MILLILITERS?/g, 'ML')
    .replace(/LITERS?/g, 'L')
    .replace(/FL\.?OZ\.?/g, 'FLOZ');

const hasLoosePhrase = (text: string, expected: string) =>
  normalizeLoose(text).includes(normalizeLoose(expected));

const collectWarningWords = (value: string) =>
  normalizePunctuation(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);

const buildTextCheck = (
  key: string,
  label: string,
  expected: string,
  ocr: OcrResult,
  passThreshold: number,
  manualThreshold: number,
  normalizer: (value: string) => string = normalizeLoose,
): FieldCheck => {
  const bestMatch = findBestLine(expected, ocr.lines, normalizer);
  if (hasLoosePhrase(ocr.text, expected) || bestMatch.score >= passThreshold) {
    return {
      key,
      label,
      status: 'pass',
      expected,
      actual: bestMatch.line || expected,
      detail: 'Found in OCR text.',
    };
  }

  if (bestMatch.score >= manualThreshold) {
    return {
      key,
      label,
      status: 'manual',
      expected,
      actual: bestMatch.line,
      detail: 'Close match found. Check manually.',
    };
  }

  return {
    key,
    label,
    status: 'fail',
    expected,
    actual: bestMatch.line || 'Not detected',
    detail: 'The expected value was not found in the label text.',
  };
};

const buildAlcoholCheck = (expected: string, ocr: OcrResult): FieldCheck => {
  const expectedAlcohol = parseAlcohol(expected);
  const actualSnippet = findAlcoholSnippet(ocr.text);
  const actualAlcohol = parseAlcohol(actualSnippet);

  if (
    expectedAlcohol.percent &&
    actualAlcohol.percent &&
    expectedAlcohol.percent === actualAlcohol.percent &&
    (!expectedAlcohol.proof || expectedAlcohol.proof === actualAlcohol.proof)
  ) {
    return {
      key: 'alcohol',
      label: 'Alcohol content',
      status: 'pass',
      expected,
      actual: actualSnippet,
      detail: 'Alcohol statement matched.',
    };
  }

  if (actualSnippet) {
    return {
      key: 'alcohol',
      label: 'Alcohol content',
      status: 'fail',
      expected,
      actual: actualSnippet,
      detail: 'Detected alcohol statement does not match.',
    };
  }

  return {
    key: 'alcohol',
    label: 'Alcohol content',
    status: 'fail',
    expected,
    actual: 'Not detected',
    detail: 'No alcohol statement was detected in the OCR output.',
  };
};

const buildNetContentsCheck = (expected: string, ocr: OcrResult): FieldCheck => {
  const normalizedExpected = normalizeVolume(expected);
  const detected =
    ocr.text.match(/\b\d+(?:\.\d+)?\s*(?:mL|ML|L|fl\.?\s*oz\.?|oz)\b/i)?.[0] ?? '';

  if (detected && normalizeVolume(detected) === normalizedExpected) {
    return {
      key: 'netContents',
      label: 'Net contents',
      status: 'pass',
      expected,
      actual: detected,
      detail: 'Net contents matched.',
    };
  }

  if (detected) {
    return {
      key: 'netContents',
      label: 'Net contents',
      status: 'fail',
      expected,
      actual: detected,
      detail: 'Detected net contents do not match.',
    };
  }

  return {
    key: 'netContents',
    label: 'Net contents',
    status: 'fail',
    expected,
    actual: 'Not detected',
    detail: 'No net contents statement was detected.',
  };
};

const buildWarningChecks = (ocr: OcrResult): FieldCheck[] => {
  const collapsedText = normalizePunctuation(ocr.text);
  const exactWarningPresent = collapsedText.includes(GOVERNMENT_WARNING);
  const uppercaseHeadingPresent = collapsedText.includes('GOVERNMENT WARNING:');

  const warningWords = collectWarningWords(GOVERNMENT_WARNING);
  const detectedWords = new Set(collectWarningWords(collapsedText));
  const matchedWordCount = warningWords.filter((word) => detectedWords.has(word)).length;
  const coverage = matchedWordCount / warningWords.length;

  if (exactWarningPresent && uppercaseHeadingPresent) {
    return [
      {
        key: 'warningText',
        label: 'Government warning text',
        status: 'pass',
        expected: 'Exact federal warning text',
        actual: 'Exact warning detected',
        detail: 'Required warning text found.',
      },
      {
        key: 'warningFormatting',
        label: 'Warning formatting follow-up',
        status: 'manual',
        detail: 'Heading was found, but formatting still needs a visual check.',
      },
    ];
  }

  if (coverage >= 0.9 && !uppercaseHeadingPresent) {
    return [
      {
        key: 'warningText',
        label: 'Government warning text',
        status: 'fail',
        expected: 'GOVERNMENT WARNING: heading in all caps',
        actual: 'Warning body detected, but heading case did not match',
        detail: 'Warning body was found, but the heading is not all caps.',
      },
    ];
  }

  if (coverage >= 0.85) {
    return [
      {
        key: 'warningText',
        label: 'Government warning text',
        status: 'manual',
        expected: 'Exact federal warning text',
        actual: 'Partial warning detected',
        detail: 'Most of the warning was found, but the match was not exact.',
      },
    ];
  }

  return [
    {
      key: 'warningText',
      label: 'Government warning text',
      status: 'fail',
      expected: 'Exact federal warning text',
      actual: 'Not detected',
      detail: 'The required federal warning statement was not found in the OCR output.',
    },
  ];
};

export const verifyApplicationRecord = (
  record: ApplicationRecord,
  ocr: OcrResult,
): ReviewResult => {
  const checks: FieldCheck[] = [
    buildTextCheck('brand', 'Brand name', record.brandName, ocr, 0.94, 0.82, normalizeBrand),
    buildTextCheck('classType', 'Class / type', record.classType, ocr, 0.92, 0.78),
    buildAlcoholCheck(record.alcoholContent, ocr),
    buildNetContentsCheck(record.netContents, ocr),
  ];

  if (record.producer.trim()) {
    checks.push(
      buildTextCheck('producer', 'Producer / bottler', record.producer, ocr, 0.89, 0.74),
    );
  }

  if (record.countryOfOrigin.trim()) {
    checks.push(
      buildTextCheck('country', 'Country of origin', record.countryOfOrigin, ocr, 0.96, 0.8),
    );
  }

  checks.push(...buildWarningChecks(ocr));

  const passedCount = checks.filter((check) => check.status === 'pass').length;
  const failedCount = checks.filter((check) => check.status === 'fail').length;
  const manualCount = checks.filter((check) => check.status === 'manual').length;
  const headline =
    failedCount > 0
      ? `${failedCount} check${failedCount === 1 ? '' : 's'} need attention.`
      : manualCount > 0
        ? `${manualCount} item${manualCount === 1 ? '' : 's'} still need review.`
        : 'All checks passed.';

  return {
    overall: failedCount > 0 ? 'attention' : 'pass',
    headline,
    extractedText: ocr.text,
    durationMs: ocr.durationMs,
    confidence: ocr.confidence,
    passedCount,
    failedCount,
    manualCount,
    checks,
  };
};
