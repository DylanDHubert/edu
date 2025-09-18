// UTILITY FOR HANDLING INVENTORY FILE UPLOADS (EXCEL/CSV FILES)

interface UploadedFile {
  filePath: string;
  originalName: string;
  uniqueFileName: string;
  fileSize: number;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  error?: string;
}

export async function uploadInventoryFilesToSupabase(
  files: File[],
  teamId: string,
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
      // VALIDATE FILE TYPE - SUPPORT EXCEL AND CSV
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
        'application/csv' // .csv alternative
      ];
      
      const allowedExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = file.name.toLowerCase().match(/\.(xlsx|xls|csv)$/)?.[0];
      
      if (!allowedTypes.includes(file.type) && !fileExtension) {
        progress[i].status = 'error';
        progress[i].error = 'Only Excel (.xlsx, .xls) and CSV files are allowed';
        onProgress?.(progress);
        throw new Error(`File ${file.name} is not a valid Excel or CSV file`);
      }

      // VALIDATE FILE SIZE
      if (file.size > 512 * 1024 * 1024) {
        progress[i].status = 'error';
        progress[i].error = 'File exceeds 512MB limit';
        onProgress?.(progress);
        throw new Error(`File ${file.name} exceeds 512MB limit`);
      }

      // GET SIGNED UPLOAD URL
      const urlResponse = await fetch('/api/teams/inventory/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teamId,
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
      const contentType = file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': contentType,
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
        uniqueFileName,
        fileSize: file.size
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

export async function processUploadedInventoryFiles(
  uploadedFiles: UploadedFile[],
  teamId: string
): Promise<any> {
  const response = await fetch('/api/teams/inventory/upload-with-llamaparse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId,
      uploadedFiles
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to process uploaded inventory files');
  }

  return response.json();
}
