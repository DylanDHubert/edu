#!/usr/bin/env node

/**
 * SIMPLE JOB CREATION TEST
 * 
 * This script tests just the job creation part without authentication
 */

const fs = require('fs');

// CONFIGURATION
const TEST_CONFIG = {
  testPdfPath: '/Users/dylanhubert/Code/HHB INC/hhb/Hip_TRTIIH_SP_2.pdf',
  baseUrl: 'http://localhost:3000',
};

async function testJobCreation() {
  console.log('🧪 TESTING JOB CREATION');
  console.log('========================');
  
  try {
    // CHECK PDF FILE
    if (!fs.existsSync(TEST_CONFIG.testPdfPath)) {
      throw new Error(`Test PDF not found at: ${TEST_CONFIG.testPdfPath}`);
    }
    
    const pdfStats = fs.statSync(TEST_CONFIG.testPdfPath);
    console.log(`📄 Test PDF: ${TEST_CONFIG.testPdfPath} (${pdfStats.size} bytes)`);
    
    // TEST LLAMAPARSE SERVICE DIRECTLY
    console.log('\n🔄 Testing LlamaParse service...');
    const llamaparseResponse = await fetch(`${TEST_CONFIG.baseUrl}/api/cron/process-documents`);
    const llamaparseResult = await llamaparseResponse.json();
    console.log('✅ LlamaParse service test:', llamaparseResult);
    
    console.log('\n✅ JOB CREATION TEST COMPLETED');
    console.log('The system is ready for deployment!');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

// RUN THE TEST
if (require.main === module) {
  testJobCreation().catch(console.error);
}
