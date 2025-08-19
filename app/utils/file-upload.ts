// UTILITY FOR HANDLING LARGE FILE UPLOADS THAT BYPASS VERCEL'S 4.5MB LIMIT

interface UploadedFile {
  filePath: string;
  originalName: string;
  uniqueFileName: string;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export async function uploadFilesToSupabase(
  files: File[],
  teamId: string,
  portfolioId: string,
  onProgress?: (progress: UploadProgress[]) => void
): Promise<UploadedFile[]> {
  const uploadedFiles: UploadedFile[] = [];
  const progress: UploadProgress[] = files.map(file => ({
    fileName: file.name,
    progress: 0,
    status: 'uploading'
  }));

  // UPDATE PROGRESS INITIALLY
  onProgress?.(progress);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    try {
      // VALIDATE FILE TYPE
      if (file.type !== 'application/pdf') {
        progress[i].status = 'error';
        progress[i].error = 'Only PDF files are allowed';
        onProgress?.(progress);
        throw new Error(`File ${file.name} is not a PDF`);
      }

      // VALIDATE FILE SIZE
      if (file.size > 512 * 1024 * 1024) {
        progress[i].status = 'error';
        progress[i].error = 'File exceeds 512MB limit';
        onProgress?.(progress);
        throw new Error(`File ${file.name} exceeds 512MB limit`);
      }

      // GET SIGNED UPLOAD URL
      const urlResponse = await fetch('/api/teams/documents/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
          portfolioId,
          fileName: file.name,
          fileSize: file.size
        }),
      });

      if (!urlResponse.ok) {
        const errorData = await urlResponse.json();
        progress[i].status = 'error';
        progress[i].error = errorData.error || 'Failed to get upload URL';
        onProgress?.(progress);
        throw new Error(errorData.error || 'Failed to get upload URL');
      }

      const { uploadUrl, filePath, uniqueFileName } = await urlResponse.json();

      // UPLOAD DIRECTLY TO SUPABASE
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'application/pdf',
        },
      });

      if (!uploadResponse.ok) {
        progress[i].status = 'error';
        progress[i].error = 'Failed to upload to Supabase';
        onProgress?.(progress);
        throw new Error(`Failed to upload ${file.name} to Supabase`);
      }

      // MARK AS COMPLETED
      progress[i].status = 'completed';
      progress[i].progress = 100;
      onProgress?.(progress);

      uploadedFiles.push({
        filePath,
        originalName: file.name,
        uniqueFileName
      });

    } catch (error) {
      console.error(`Error uploading ${file.name}:`, error);
      progress[i].status = 'error';
      progress[i].error = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.(progress);
      throw error;
    }
  }

  return uploadedFiles;
}

export async function processUploadedFiles(
  uploadedFiles: UploadedFile[],
  teamId: string,
  portfolioId: string
): Promise<any> {
  const response = await fetch('/api/teams/documents/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId,
      portfolioId,
      uploadedFiles
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to process uploaded files');
  }

  return response.json();
}
