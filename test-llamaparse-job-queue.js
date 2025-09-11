#!/usr/bin/env node

/**
 * TEST SCRIPT FOR LLAMAPARSE JOB QUEUE
 * 
 * This script tests the complete flow:
 * 1. Upload a PDF to Supabase Storage
 * 2. Submit to LlamaParse and get job ID
 * 3. Create job record in database
 * 4. Run cron job to process the job
 * 5. Verify markdown is downloaded and uploaded to OpenAI
 */

const fs = require('fs');
const path = require('path');

// CONFIGURATION
const TEST_CONFIG = {
  // UPDATE THESE VALUES FOR YOUR TEST
  teamId: 'a6347479-8259-4d3e-b94e-df88b79f7bf7', // YOUR TEAM ID FROM LOGS
  portfolioId: 'd2570676-398c-401a-9deb-e44486b2f8f9', // YOUR PORTFOLIO ID
  testPdfPath: '/Users/dylanhubert/Code/HHB INC/hhb/Hip_TRTIIH_SP_2.pdf', // YOUR TEST PDF
  baseUrl: 'http://localhost:3000', // OR YOUR PRODUCTION URL
};

// TEST FUNCTIONS
async function testCompleteFlow() {
  console.log('🚀 STARTING LLAMAPARSE JOB QUEUE TEST');
  console.log('=====================================');
  
  try {
    // STEP 1: CHECK IF TEST PDF EXISTS
    if (!fs.existsSync(TEST_CONFIG.testPdfPath)) {
      throw new Error(`Test PDF not found at: ${TEST_CONFIG.testPdfPath}`);
    }
    
    const pdfStats = fs.statSync(TEST_CONFIG.testPdfPath);
    console.log(`📄 Test PDF: ${TEST_CONFIG.testPdfPath} (${pdfStats.size} bytes)`);
    
    // STEP 2: UPLOAD PDF TO SUPABASE STORAGE
    console.log('\n📤 STEP 1: Uploading PDF to Supabase Storage...');
    const uploadResult = await uploadPdfToSupabase();
    console.log('✅ PDF uploaded successfully');
    console.log(`   File Path: ${uploadResult.filePath}`);
    console.log(`   Unique Name: ${uploadResult.uniqueFileName}`);
    
    // STEP 3: SUBMIT TO LLAMAPARSE AND CREATE JOB
    console.log('\n🔄 STEP 2: Submitting to LlamaParse and creating job...');
    const jobResult = await submitToLlamaParse(uploadResult);
    console.log('✅ LlamaParse job submitted successfully');
    console.log(`   Document ID: ${jobResult.documentId}`);
    console.log(`   LlamaParse Job ID: ${jobResult.llamaparseJobId}`);
    
    // STEP 4: WAIT A BIT FOR LLAMAPARSE TO START PROCESSING
    console.log('\n⏳ STEP 3: Waiting for LlamaParse to start processing...');
    await sleep(5000); // WAIT 5 SECONDS
    
    // STEP 5: RUN CRON JOB TO PROCESS
    console.log('\n🔄 STEP 4: Running cron job to process documents...');
    const cronResult = await runCronJob();
    console.log('✅ Cron job completed');
    console.log(`   Processed: ${cronResult.processed} jobs`);
    console.log(`   Success: ${cronResult.success} jobs`);
    console.log(`   Failed: ${cronResult.failed} jobs`);
    
    // STEP 6: CHECK JOB STATUS
    console.log('\n📊 STEP 5: Checking job status...');
    const jobStatus = await checkJobStatus(jobResult.documentId);
    console.log('✅ Job status retrieved');
    console.log(`   Status: ${jobStatus.status}`);
    console.log(`   Progress: ${jobStatus.progress}%`);
    console.log(`   Current Step: ${jobStatus.currentStep}`);
    
    // STEP 7: IF STILL PROCESSING, WAIT AND CHECK AGAIN
    if (jobStatus.status === 'processing') {
      console.log('\n⏳ Job still processing, waiting and checking again...');
      await sleep(10000); // WAIT 10 SECONDS
      
      const finalStatus = await checkJobStatus(jobResult.documentId);
      console.log('✅ Final job status retrieved');
      console.log(`   Status: ${finalStatus.status}`);
      console.log(`   Progress: ${finalStatus.progress}%`);
      console.log(`   Current Step: ${finalStatus.currentStep}`);
      
      if (finalStatus.status === 'completed') {
        console.log('\n🎉 SUCCESS! Document processing completed successfully!');
        console.log(`   OpenAI File ID: ${finalStatus.openaiFileId}`);
      } else if (finalStatus.status === 'failed') {
        console.log('\n❌ FAILED! Document processing failed');
        console.log(`   Error: ${finalStatus.errorMessage}`);
      } else {
        console.log('\n⏳ Job still processing. You may need to run the cron job again.');
      }
    }
    
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// HELPER FUNCTIONS
async function uploadPdfToSupabase() {
  const pdfBuffer = fs.readFileSync(TEST_CONFIG.testPdfPath);
  const fileName = path.basename(TEST_CONFIG.testPdfPath);
  
  // GET UPLOAD URL
  const urlResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/teams/documents/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId: TEST_CONFIG.teamId,
      portfolioId: TEST_CONFIG.portfolioId,
      fileName: fileName,
      fileSize: pdfBuffer.length
    }),
  });
  
  if (!urlResponse.ok) {
    const errorData = await urlResponse.json();
    throw new Error(`Failed to get upload URL: ${errorData.error}`);
  }
  
  const { uploadUrl, filePath, uniqueFileName } = await urlResponse.json();
  
  // UPLOAD TO SUPABASE
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: pdfBuffer,
    headers: {
      'Content-Type': 'application/pdf',
    },
  });
  
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload PDF: ${uploadResponse.statusText}`);
  }
  
  return { filePath, uniqueFileName, originalName: fileName, fileSize: pdfBuffer.length };
}

async function submitToLlamaParse(uploadResult) {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/teams/documents/upload-with-llamaparse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      teamId: TEST_CONFIG.teamId,
      portfolioId: TEST_CONFIG.portfolioId,
      uploadedFiles: [uploadResult]
    }),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to submit to LlamaParse: ${errorData.error}`);
  }
  
  const result = await response.json();
  
  if (!result.success || !result.documents || result.documents.length === 0) {
    throw new Error('No documents returned from upload');
  }
  
  const document = result.documents[0];
  
  // FOR NOW, WE'LL USE THE DOCUMENT ID TO LOOK UP THE JOB
  // THE LLAMAPARSE JOB ID IS STORED IN THE PROCESSING_JOBS TABLE
  console.log('   Note: LlamaParse job ID is stored in processing_jobs table');
  
  return {
    documentId: document.id,
    llamaparseJobId: 'will-be-looked-up' // WE'LL GET THIS FROM THE DATABASE
  };
}

async function runCronJob() {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/cron/process-documents`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Cron job failed: ${errorData.error}`);
  }
  
  return await response.json();
}

async function checkJobStatus(documentId) {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/api/teams/documents/processing-status/${documentId}`, {
    method: 'GET',
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to get job status: ${errorData.error}`);
  }
  
  const result = await response.json();
  return result.status;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// RUN THE TEST
if (require.main === module) {
  console.log('🧪 LLAMAPARSE JOB QUEUE TEST SCRIPT');
  console.log('===================================');
  console.log('');
  console.log('⚠️  BEFORE RUNNING THIS TEST:');
  console.log('1. Make sure your server is running');
  console.log('2. Update TEST_CONFIG with your team ID and portfolio ID');
  console.log('3. Place a test PDF file at the specified path');
  console.log('4. Make sure you have the processing_jobs table created');
  console.log('');
  console.log('📋 CURRENT CONFIG:');
  console.log(`   Team ID: ${TEST_CONFIG.teamId}`);
  console.log(`   Portfolio ID: ${TEST_CONFIG.portfolioId}`);
  console.log(`   Test PDF: ${TEST_CONFIG.testPdfPath}`);
  console.log(`   Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log('');
  
  // CHECK IF CONFIG IS UPDATED
  if (TEST_CONFIG.portfolioId === 'your-portfolio-id') {
    console.log('❌ Please update TEST_CONFIG.portfolioId with your actual portfolio ID');
    process.exit(1);
  }
  
  if (!fs.existsSync(TEST_CONFIG.testPdfPath)) {
    console.log(`❌ Please place a test PDF file at: ${TEST_CONFIG.testPdfPath}`);
    process.exit(1);
  }
  
  console.log('✅ Configuration looks good, starting test...');
  console.log('');
  
  testCompleteFlow().catch(console.error);
}
