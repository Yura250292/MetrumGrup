/**
 * R2 Direct Upload з Presigned URLs
 * Завантажує файли паралельно напряму в R2, обходячи Vercel 4MB ліміт
 */

export interface UploadProgress {
  totalFiles: number;
  uploadedFiles: number;
  failedFiles: number;
  percentage: number;
  currentFile?: string;
}

export interface R2UploadResult {
  success: boolean;
  r2Keys: string[];
  failed: Array<{ name: string; error: string }>;
}

/**
 * Завантажує файли напряму в R2 через presigned URLs
 * @param files - Файли для завантаження
 * @param onProgress - Callback для progress updates
 */
export async function uploadFilesToR2(
  files: File[],
  onProgress?: (progress: UploadProgress) => void
): Promise<R2UploadResult> {
  console.log(`🚀 Starting R2 direct upload for ${files.length} files...`);

  try {
    // Step 1: Отримуємо presigned URLs
    const presignedRes = await fetch('/api/admin/estimates/upload-presigned', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.map(f => ({
          name: f.name,
          type: f.type,
          size: f.size,
        })),
      }),
    });

    if (!presignedRes.ok) {
      const error = await presignedRes.json();
      throw new Error(error.error || 'Failed to get presigned URLs');
    }

    const { uploads } = await presignedRes.json();
    console.log(`📝 Got ${uploads.length} presigned URLs`);

    // Step 2: Завантажуємо файли паралельно в R2
    let uploadedCount = 0;
    let failedCount = 0;
    const r2Keys: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    const uploadPromises = files.map(async (file, index) => {
      const upload = uploads[index];

      try {
        console.log(`📤 Uploading ${file.name} to R2...`);

        // PUT request напряму в R2
        // ВАЖЛИВО: Не вказуємо Content-Length - браузер додасть автоматично
        const uploadRes = await fetch(upload.url, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
            // Content-Length НЕ вказуємо - браузер додасть сам
          },
        });

        if (!uploadRes.ok) {
          throw new Error(`R2 upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
        }

        console.log(`✅ Uploaded ${file.name} to R2: ${upload.key}`);
        r2Keys.push(upload.key);
        uploadedCount++;

        // Update progress
        if (onProgress) {
          onProgress({
            totalFiles: files.length,
            uploadedFiles: uploadedCount,
            failedFiles: failedCount,
            percentage: Math.round((uploadedCount / files.length) * 100),
            currentFile: file.name,
          });
        }

      } catch (error) {
        console.error(`❌ Failed to upload ${file.name}:`, error);
        failed.push({
          name: file.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failedCount++;

        if (onProgress) {
          onProgress({
            totalFiles: files.length,
            uploadedFiles: uploadedCount,
            failedFiles: failedCount,
            percentage: Math.round((uploadedCount / files.length) * 100),
          });
        }
      }
    });

    // Чекаємо всі uploads
    await Promise.all(uploadPromises);

    console.log(`✅ R2 Upload complete: ${uploadedCount}/${files.length} succeeded, ${failedCount} failed`);

    return {
      success: failedCount === 0,
      r2Keys,
      failed,
    };

  } catch (error) {
    console.error('❌ R2 upload error:', error);
    throw error;
  }
}

/**
 * Форматує розмір файлу для відображення
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
