import { startTransition, useEffect, useRef, useState } from 'react';
import './App.css';
import { recognizeLabel, warmOcrEngine } from './lib/ocr.ts';
import { buildSampleBatch } from './lib/sampleLabels.ts';
import { verifyApplicationRecord } from './lib/verification.ts';
import type { ApplicationRecord, LabelSource } from './types.ts';

const createId = () => crypto.randomUUID();

const createBlankRecord = (label?: LabelSource): ApplicationRecord => ({
  id: createId(),
  brandName: '',
  classType: '',
  alcoholContent: '',
  netContents: '',
  producer: '',
  countryOfOrigin: '',
  label,
  isReviewing: false,
});

const releaseLabel = (label?: LabelSource) => {
  if (label?.kind === 'upload' && label.previewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(label.previewUrl);
  }

  if (
    label?.kind === 'upload' &&
    label.ocrSource.startsWith('blob:') &&
    label.ocrSource !== label.previewUrl
  ) {
    URL.revokeObjectURL(label.ocrSource);
  }
};

const createUploadLabel = (file: File): LabelSource => {
  const previewUrl = URL.createObjectURL(file);

  return {
    kind: 'upload',
    name: file.name,
    previewUrl,
    ocrSource: previewUrl,
  };
};

const inferBrandNameFromFilename = (filename: string) =>
  filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatDuration = (value: number) =>
  value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;

const validateRecordForReview = (record: ApplicationRecord) => {
  if (!record.label) {
    return 'Attach a label image before starting review.';
  }

  const missingFields = [
    ['brand name', record.brandName],
    ['class / type', record.classType],
    ['alcohol content', record.alcoholContent],
    ['net contents', record.netContents],
  ]
    .filter(([, value]) => !value.trim())
    .map(([label]) => label);

  if (missingFields.length === 0) {
    return '';
  }

  return `Fill in ${missingFields.join(', ')} before review.`;
};

const getRecordStatus = (record: ApplicationRecord) => {
  if (record.isReviewing) {
    return { tone: 'running', label: 'Reviewing' };
  }

  if (record.error) {
    return { tone: 'attention', label: 'Needs input' };
  }

  if (record.review?.overall === 'attention') {
    return { tone: 'attention', label: 'Attention' };
  }

  if (record.review?.overall === 'pass') {
    return { tone: 'pass', label: 'Pass' };
  }

  if (record.label) {
    return { tone: 'ready', label: 'Ready' };
  }

  return { tone: 'idle', label: 'Draft' };
};

function App() {
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [isLoadingSamples, setIsLoadingSamples] = useState(true);
  const [isBatchReviewing, setIsBatchReviewing] = useState(false);
  const [ocrState, setOcrState] = useState<'warming' | 'ready' | 'error'>('warming');
  const recordsRef = useRef(records);

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [sampleBatch] = await Promise.all([buildSampleBatch(), warmOcrEngine()]);
        startTransition(() => {
          setRecords(sampleBatch);
          setOcrState('ready');
        });
      } catch (error) {
        console.error(error);
        startTransition(() => {
          setRecords([]);
          setOcrState('error');
        });
      } finally {
        setIsLoadingSamples(false);
      }
    };

    void initialize();

    return () => {
      for (const record of recordsRef.current) {
        releaseLabel(record.label);
      }
    };
  }, []);

  const replaceRecords = (nextRecords: ApplicationRecord[]) => {
    startTransition(() => {
      setRecords(nextRecords);
    });
  };

  const updateRecord = (
    id: string,
    updater: (record: ApplicationRecord) => ApplicationRecord,
  ) => {
    startTransition(() => {
      setRecords((current) =>
        current.map((record) => (record.id === id ? updater(record) : record)),
      );
    });
  };

  const handleFieldChange = (
    id: string,
    field: keyof Pick<
      ApplicationRecord,
      'brandName' | 'classType' | 'alcoholContent' | 'netContents' | 'producer' | 'countryOfOrigin'
    >,
    value: string,
  ) => {
    updateRecord(id, (record) => ({
      ...record,
      [field]: value,
      error: undefined,
    }));
  };

  const loadSampleQueue = async () => {
    setIsLoadingSamples(true);

    const existingUploads = recordsRef.current.map((record) => record.label);
    for (const label of existingUploads) {
      releaseLabel(label);
    }

    try {
      const sampleBatch = await buildSampleBatch();
      replaceRecords(sampleBatch);
    } finally {
      setIsLoadingSamples(false);
    }
  };

  const addBlankRecord = () => {
    replaceRecords([...recordsRef.current, createBlankRecord()]);
  };

  const removeRecord = (id: string) => {
    const nextRecords = recordsRef.current.filter((record) => {
      if (record.id === id) {
        releaseLabel(record.label);
        return false;
      }

      return true;
    });

    replaceRecords(nextRecords);
  };

  const attachLabelToRecord = (id: string, file: File) => {
    updateRecord(id, (record) => {
      releaseLabel(record.label);
      return {
        ...record,
        brandName: record.brandName || inferBrandNameFromFilename(file.name),
        label: createUploadLabel(file),
        review: undefined,
        error: undefined,
        progressText: undefined,
      };
    });
  };

  const handleBatchUpload = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    const nextRecords = [
      ...recordsRef.current,
      ...Array.from(files).map((file) => createBlankRecord(createUploadLabel(file))),
    ].map((record) => {
      if (record.label?.kind !== 'upload' || record.brandName) {
        return record;
      }

      return {
        ...record,
        brandName: inferBrandNameFromFilename(record.label.name),
      };
    });

    replaceRecords(nextRecords);
  };

  const resetResult = (id: string) => {
    updateRecord(id, (record) => ({
      ...record,
      review: undefined,
      error: undefined,
      progressText: undefined,
    }));
  };

  const reviewRecord = async (id: string) => {
    const record = recordsRef.current.find((entry) => entry.id === id);
    if (!record) {
      return;
    }

    const validationError = validateRecordForReview(record);
    if (validationError) {
      updateRecord(id, (currentRecord) => ({
        ...currentRecord,
        error: validationError,
        review: undefined,
        isReviewing: false,
        progressText: undefined,
      }));
      return;
    }

    updateRecord(id, (currentRecord) => ({
      ...currentRecord,
      error: undefined,
      review: undefined,
      isReviewing: true,
      progressText: 'Starting OCR...',
    }));

    try {
      const ocr = await recognizeLabel(record.label!.ocrSource, (message) => {
        updateRecord(id, (currentRecord) => ({
          ...currentRecord,
          progressText: message,
        }));
      });

      const review = verifyApplicationRecord(record, ocr);
      updateRecord(id, (currentRecord) => ({
        ...currentRecord,
        review,
        isReviewing: false,
        progressText: undefined,
      }));
    } catch (error) {
      console.error(error);
      updateRecord(id, (currentRecord) => ({
        ...currentRecord,
        error: 'OCR failed for this image. Try a clearer, front-facing label photo.',
        isReviewing: false,
        progressText: undefined,
      }));
    }
  };

  const reviewAllRecords = async () => {
    setIsBatchReviewing(true);

    try {
      for (const record of recordsRef.current) {
        await reviewRecord(record.id);
      }
    } finally {
      setIsBatchReviewing(false);
    }
  };

  const totalRecords = records.length;
  const readyRecords = records.filter((record) => record.label && !record.isReviewing).length;
  const passedRecords = records.filter((record) => record.review?.overall === 'pass').length;
  const attentionRecords = records.filter(
    (record) => record.review?.overall === 'attention' || Boolean(record.error),
  ).length;
  const activeReviews = isBatchReviewing || records.some((record) => record.isReviewing);

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Alcohol label review</p>
          <h1>Label Lens</h1>
          <p className="hero-copy">
            Upload label images, compare OCR text against application fields, and flag
            mismatches before manual review.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => void reviewAllRecords()} disabled={activeReviews || !records.length}>
              Review all queued labels
            </button>
            <button type="button" className="ghost-button" onClick={() => void loadSampleQueue()} disabled={isLoadingSamples || activeReviews}>
              Load sample queue
            </button>
          </div>
        </div>

        <aside className="hero-aside">
          <div className="seal-card">
            <span className={`state-pill state-pill--${ocrState}`}>
              OCR {ocrState === 'warming' ? 'warming up' : ocrState}
            </span>
            <p>
              The first load starts the OCR worker and caches the language files in the
              browser.
            </p>
          </div>
          <div className="seal-card">
            <strong>Current checks</strong>
            <p>
              Checks brand, class/type, alcohol content, net contents, producer/country,
              and the federal government warning statement. Warning formatting still needs
              a visual check.
            </p>
          </div>
        </aside>
      </section>

      <section className="summary-grid" aria-label="Queue summary">
        <article className="summary-card">
          <span className="summary-label">Queue size</span>
          <strong>{totalRecords}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Ready</span>
          <strong>{readyRecords}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Passed</span>
          <strong>{passedRecords}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Needs attention</span>
          <strong>{attentionRecords}</strong>
        </article>
      </section>

      <section className="controls-panel">
        <div className="controls-copy">
          <h2>Batch queue</h2>
          <p>
            Start with the sample queue or add your own labels. Each record keeps the
            fields used during review.
          </p>
        </div>

        <div className="controls-actions">
          <button type="button" className="secondary-button" onClick={addBlankRecord} disabled={activeReviews}>
            Add application
          </button>
          <label className="secondary-button file-button">
            Add label batch
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                handleBatchUpload(event.target.files);
                event.currentTarget.value = '';
              }}
              disabled={activeReviews}
            />
          </label>
        </div>
      </section>

      <section className="records-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Review queue</p>
            <h2>Applications</h2>
          </div>
          <p className="panel-caption">
            One sample contains mismatches so the attention state is easy to verify.
          </p>
        </div>

        {isLoadingSamples ? (
          <div className="empty-state">Loading sample labels...</div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            No applications in the queue. Add one or upload label images.
          </div>
        ) : (
          <div className="records-stack">
            {records.map((record, index) => {
              const status = getRecordStatus(record);

              return (
                <article className="record-card" key={record.id}>
                  <header className="record-header">
                    <div>
                      <p className="eyebrow">Application {index + 1}</p>
                      <h3>{record.brandName || record.label?.name || 'Untitled application'}</h3>
                    </div>
                    <span className={`status-chip status-chip--${status.tone}`}>{status.label}</span>
                  </header>

                  <div className="record-grid">
                    <section className="form-panel">
                      <div className="field-grid">
                        <label>
                          <span>Brand name</span>
                          <input
                            type="text"
                            value={record.brandName}
                            onChange={(event) => handleFieldChange(record.id, 'brandName', event.target.value)}
                            placeholder="Old Tom Distillery"
                          />
                        </label>

                        <label>
                          <span>Class / type</span>
                          <input
                            type="text"
                            value={record.classType}
                            onChange={(event) => handleFieldChange(record.id, 'classType', event.target.value)}
                            placeholder="Kentucky Straight Bourbon Whiskey"
                          />
                        </label>

                        <label>
                          <span>Alcohol content</span>
                          <input
                            type="text"
                            value={record.alcoholContent}
                            onChange={(event) => handleFieldChange(record.id, 'alcoholContent', event.target.value)}
                            placeholder="45% Alc./Vol. (90 Proof)"
                          />
                        </label>

                        <label>
                          <span>Net contents</span>
                          <input
                            type="text"
                            value={record.netContents}
                            onChange={(event) => handleFieldChange(record.id, 'netContents', event.target.value)}
                            placeholder="750 mL"
                          />
                        </label>

                        <label>
                          <span>Producer / bottler</span>
                          <input
                            type="text"
                            value={record.producer}
                            onChange={(event) => handleFieldChange(record.id, 'producer', event.target.value)}
                            placeholder="Bottled by ..."
                          />
                        </label>

                        <label>
                          <span>Country of origin</span>
                          <input
                            type="text"
                            value={record.countryOfOrigin}
                            onChange={(event) =>
                              handleFieldChange(record.id, 'countryOfOrigin', event.target.value)
                            }
                            placeholder="Product of USA"
                          />
                        </label>
                      </div>

                      <div className="record-actions">
                        <label className="secondary-button file-button">
                          {record.label ? 'Replace label image' : 'Attach label image'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) {
                                attachLabelToRecord(record.id, file);
                              }

                              event.currentTarget.value = '';
                            }}
                            disabled={record.isReviewing}
                          />
                        </label>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => void reviewRecord(record.id)}
                          disabled={record.isReviewing || isBatchReviewing}
                        >
                          {record.isReviewing ? 'Reviewing...' : 'Review this label'}
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => resetResult(record.id)}
                          disabled={record.isReviewing}
                        >
                          Clear result
                        </button>
                        <button
                          type="button"
                          className="ghost-button danger-button"
                          onClick={() => removeRecord(record.id)}
                          disabled={record.isReviewing}
                        >
                          Remove
                        </button>
                      </div>
                    </section>

                    <section className="preview-panel">
                      {record.label ? (
                        <div className="label-preview-shell">
                          <img
                            className="label-preview"
                            src={record.label.previewUrl}
                            alt={`Preview of ${record.label.name}`}
                          />
                          <div className="preview-meta">
                            <strong>{record.label.name}</strong>
                            <span>{record.label.kind === 'sample' ? 'Sample label' : 'Uploaded label'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="label-placeholder">
                          Attach a front-facing label image to run OCR and field checks.
                        </div>
                      )}

                      {record.progressText ? <p className="progress-note">{record.progressText}</p> : null}
                      {record.error ? <p className="error-banner">{record.error}</p> : null}

                      {record.review ? (
                        <div className="review-panel">
                          <div className={`review-summary review-summary--${record.review.overall}`}>
                            <div>
                              <span className="summary-label">Result</span>
                              <strong>{record.review.headline}</strong>
                            </div>
                            <div className="review-stats">
                              <span>{record.review.passedCount} pass</span>
                              <span>{record.review.failedCount} fail</span>
                              <span>{record.review.manualCount} manual</span>
                            </div>
                          </div>

                          <div className="metrics-row">
                            <span>OCR confidence {record.review.confidence.toFixed(0)}%</span>
                            <span>Runtime {formatDuration(record.review.durationMs)}</span>
                          </div>

                          <ul className="check-list">
                            {record.review.checks.map((check) => (
                              <li className={`check-item check-item--${check.status}`} key={check.key}>
                                <div className="check-header">
                                  <strong>{check.label}</strong>
                                  <span>{check.status}</span>
                                </div>
                                <p>{check.detail}</p>
                                {check.expected ? <p>Expected: {check.expected}</p> : null}
                                {check.actual ? <p>Detected: {check.actual}</p> : null}
                              </li>
                            ))}
                          </ul>

                          <details className="ocr-details">
                            <summary>Show extracted label text</summary>
                            <pre>{record.review.extractedText || 'No OCR text returned.'}</pre>
                          </details>
                        </div>
                      ) : null}
                    </section>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
