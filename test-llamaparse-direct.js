#!/usr/bin/env node

/**
 * DIRECT LLAMAPARSE API TEST
 * 
 * This script tests the LlamaParse service directly without authentication
 * to verify the API integration works correctly.
 */

const fs = require('fs');
const path = require('path');

// CONFIGURATION
const TEST_CONFIG = {
  testPdfPath: '/Users/dylanhubert/Code/HHB INC/hhb/Hip_TRTIIH_SP_2.pdf',
  apiKey: process.env.LLAMAPARSE_API_KEY,
  baseUrl: 'https://api.cloud.llamaindex.ai/api/v1',
};

// TEST FUNCTIONS
async function testLlamaParseDirect() {
  console.log('🧪 TESTING LLAMAPARSE API DIRECTLY');
  console.log('==================================');
  
  try {
    // CHECK API KEY
    if (!TEST_CONFIG.apiKey) {
      throw new Error('LLAMAPARSE_API_KEY environment variable is required');
    }
    
    console.log('✅ API Key found');
    
    // CHECK PDF FILE
    if (!fs.existsSync(TEST_CONFIG.testPdfPath)) {
      throw new Error(`Test PDF not found at: ${TEST_CONFIG.testPdfPath}`);
    }
    
    const pdfStats = fs.statSync(TEST_CONFIG.testPdfPath);
    console.log(`📄 Test PDF: ${TEST_CONFIG.testPdfPath} (${pdfStats.size} bytes)`);
    
    // STEP 1: SUBMIT FILE TO LLAMAPARSE
    console.log('\n📤 STEP 1: Submitting file to LlamaParse...');
    const jobId = await submitFileToLlamaParse();
    console.log(`✅ File submitted successfully`);
    console.log(`   Job ID: ${jobId}`);
    
    // STEP 2: CHECK STATUS
    console.log('\n🔄 STEP 2: Checking job status...');
    let status = await checkJobStatus(jobId);
    console.log(`✅ Status checked: ${status.status}`);
    
    // STEP 3: POLL UNTIL COMPLETE
    console.log('\n⏳ STEP 3: Polling until completion...');
    let attempts = 0;
    const maxAttempts = 20; // MAX 2 MINUTES (6 SECONDS * 20)
    
    while (status.status === 'PENDING' || status.status === 'PROCESSING') {
      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}: ${status.status} (${status.progress || 0}%)`);
      
      if (attempts >= maxAttempts) {
        throw new Error('Timeout waiting for LlamaParse to complete');
      }
      
      await sleep(6000); // WAIT 6 SECONDS
      status = await checkJobStatus(jobId);
    }
    
    // STEP 4: DOWNLOAD RESULT
    if (status.status === 'SUCCESS') {
      console.log('\n📥 STEP 4: Downloading markdown result...');
      const markdown = await downloadMarkdown(jobId);
      console.log(`✅ Markdown downloaded successfully`);
      console.log(`   Length: ${markdown.length} characters`);
      console.log(`   Preview: ${markdown.substring(0, 200)}...`);
      
      // SAVE TO FILE FOR INSPECTION
      const outputPath = `./test-result-${jobId}.md`;
      fs.writeFileSync(outputPath, markdown);
      console.log(`   Saved to: ${outputPath}`);
      
    } else {
      throw new Error(`LlamaParse job failed with status: ${status.status}`);
    }
    
    console.log('\n🎉 SUCCESS! LlamaParse API integration is working correctly!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// LLAMAPARSE API FUNCTIONS
async function submitFileToLlamaParse() {
  const pdfBuffer = fs.readFileSync(TEST_CONFIG.testPdfPath);
  const fileName = path.basename(TEST_CONFIG.testPdfPath);
  
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer]), fileName);
  
  const response = await fetch(`${TEST_CONFIG.baseUrl}/parsing/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEST_CONFIG.apiKey}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LlamaParse upload failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.id) {
    throw new Error('No job ID returned from LlamaParse');
  }
  
  return data.id;
}

async function checkJobStatus(jobId) {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/parsing/job/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${TEST_CONFIG.apiKey}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LlamaParse status check failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return await response.json();
}

async function downloadMarkdown(jobId) {
  const response = await fetch(`${TEST_CONFIG.baseUrl}/parsing/job/${jobId}/result/markdown`, {
    headers: {
      'Authorization': `Bearer ${TEST_CONFIG.apiKey}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LlamaParse download failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return await response.text();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// RUN THE TEST
if (require.main === module) {
  console.log('🧪 LLAMAPARSE DIRECT API TEST');
  console.log('=============================');
  console.log('');
  console.log('📋 CONFIG:');
  console.log(`   PDF: ${TEST_CONFIG.testPdfPath}`);
  console.log(`   API Key: ${TEST_CONFIG.apiKey ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Base URL: ${TEST_CONFIG.baseUrl}`);
  console.log('');
  
  if (!TEST_CONFIG.apiKey) {
    console.log('❌ Please set LLAMAPARSE_API_KEY environment variable');
    process.exit(1);
  }
  
  if (!fs.existsSync(TEST_CONFIG.testPdfPath)) {
    console.log(`❌ Please place a test PDF file at: ${TEST_CONFIG.testPdfPath}`);
    process.exit(1);
  }
  
  console.log('✅ Configuration looks good, starting test...');
  console.log('');
  
  testLlamaParseDirect().catch(console.error);
}
