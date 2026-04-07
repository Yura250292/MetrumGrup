/**
 * Утиліти для батч-завантаження файлів (для обходу Vercel 4.5MB ліміту)
 */

export const MAX_BATCH_SIZE = 4 * 1024 * 1024; // 4 MB на батч

export interface FileBatch {
  files: File[];
  totalSize: number;
  batchNumber: number;
}

export interface UploadProgress {
  currentBatch: number;
  totalBatches: number;
  uploadedFiles: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
}

/**
 * Розбиває масив файлів на батчі по MAX_BATCH_SIZE
 */
export function createFileBatches(files: File[]): FileBatch[] {
  const batches: FileBatch[] = [];
  let currentBatch: File[] = [];
  let currentSize = 0;
  let batchNumber = 1;

  // Сортуємо файли за розміром (менші спочатку)
  const sortedFiles = [...files].sort((a, b) => a.size - b.size);

  for (const file of sortedFiles) {
    // Якщо файл сам по собі більше ліміту - треба його розбити
    if (file.size > MAX_BATCH_SIZE) {
      // Якщо є незавершений батч - додаємо його
      if (currentBatch.length > 0) {
        batches.push({
          files: currentBatch,
          totalSize: currentSize,
          batchNumber: batchNumber++,
        });
        currentBatch = [];
        currentSize = 0;
      }

      // Великий файл йде окремим батчем (буде оброблятись через chunking)
      batches.push({
        files: [file],
        totalSize: file.size,
        batchNumber: batchNumber++,
      });
      continue;
    }

    // Якщо додавання файлу перевищить ліміт - закриваємо поточний батч
    if (currentSize + file.size > MAX_BATCH_SIZE && currentBatch.length > 0) {
      batches.push({
        files: currentBatch,
        totalSize: currentSize,
        batchNumber: batchNumber++,
      });
      currentBatch = [];
      currentSize = 0;
    }

    // Додаємо файл до поточного батчу
    currentBatch.push(file);
    currentSize += file.size;
  }

  // Додаємо останній батч якщо є
  if (currentBatch.length > 0) {
    batches.push({
      files: currentBatch,
      totalSize: currentSize,
      batchNumber: batchNumber,
    });
  }

  return batches;
}

/**
 * Розраховує прогрес завантаження
 */
export function calculateProgress(
  currentBatchIndex: number,
  batches: FileBatch[],
  uploadedFilesInCurrentBatch: number = 0
): UploadProgress {
  const totalFiles = batches.reduce((sum, batch) => sum + batch.files.length, 0);
  const totalBytes = batches.reduce((sum, batch) => sum + batch.totalSize, 0);

  // Скільки файлів вже завантажено (всі попередні батчі + поточний файл)
  let uploadedFiles = 0;
  let uploadedBytes = 0;

  for (let i = 0; i < currentBatchIndex; i++) {
    uploadedFiles += batches[i].files.length;
    uploadedBytes += batches[i].totalSize;
  }

  // Додаємо файли з поточного батчу
  if (currentBatchIndex < batches.length) {
    uploadedFiles += uploadedFilesInCurrentBatch;
    for (let i = 0; i < uploadedFilesInCurrentBatch; i++) {
      uploadedBytes += batches[currentBatchIndex].files[i]?.size || 0;
    }
  }

  const percentage = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  return {
    currentBatch: currentBatchIndex + 1,
    totalBatches: batches.length,
    uploadedFiles,
    totalFiles,
    uploadedBytes,
    totalBytes,
    percentage,
  };
}

/**
 * Форматує розмір файлу для відображення
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Розбиває великий файл на чанки для послідовної передачі
 */
export function* chunkFile(file: File, chunkSize: number = MAX_BATCH_SIZE): Generator<Blob> {
  let offset = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    yield chunk;
    offset += chunkSize;
  }
}

/**
 * Перевіряє чи батч не перевищує ліміт
 */
export function validateBatch(batch: FileBatch): { valid: boolean; error?: string } {
  if (batch.totalSize > MAX_BATCH_SIZE) {
    return {
      valid: false,
      error: `Батч ${batch.batchNumber} перевищує ліміт: ${formatFileSize(batch.totalSize)} > ${formatFileSize(MAX_BATCH_SIZE)}`,
    };
  }

  return { valid: true };
}
