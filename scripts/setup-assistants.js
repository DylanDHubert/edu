// LOAD ENVIRONMENT VARIABLES FROM .env
require('dotenv').config({ path: '.env' });

const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// PORTFOLIO CONFIGURATIONS
const PORTFOLIOS = {
  hip: {
    name: 'HIP PORTFOLIO',
    description: 'HIP SURGICAL TECHNIQUES AND PROTOCOLS',
    files: [
      'Hip_002 Accolade System Surgical Technique.pdf',
      'Hip_003 Accolade II Femoral Hip System Surgical Technique.pdf',
      'Hip_ADM_MDM System.pdf',
      'Hip_Insignia Design Rationale.pdf',
      'Hip_Insignia Surgical Protocol.pdf',
      'Hip_mako-tha-surgical-technique.pdf',
      'Hip_trident-constrained-acetabular-insert-surgical-technique.pdf',
      'Hip_TRTIIH_SP_2.pdf'
    ]
  },
  knee: {
    name: 'KNEE PORTFOLIO',
    description: 'KNEE SURGICAL TECHNIQUES AND PROTOCOLS',
    files: [
      'Knee_Triathlon Knee Replacement Presentation.pdf',
      'Knee_triathlon_total_knee_system_reference_guide.pdf',
      'Knee_triathlon-tritanium-surgical-technique.pdf'
    ]
  },
  ts_knee: {
    name: 'TS KNEE PORTFOLIO',
    description: 'TS KNEE SURGICAL TECHNIQUES AND PROTOCOLS',
    files: [
      'TS_Knee_triathlon-TS-Brochure.pdf'
    ]
  }
};

async function setupAssistants() {
  console.log('🚀 STARTING ASSISTANT SETUP...\n');

  const results = {};

  for (const [portfolioType, portfolio] of Object.entries(PORTFOLIOS)) {
    console.log(`📁 SETTING UP ${portfolio.name.toUpperCase()}...`);
    
    try {
      // CREATE VECTOR STORE
      console.log('  📦 CREATING VECTOR STORE...');
      const vectorStore = await client.vectorStores.create({
        name: `${portfolio.name} Vector Store`
      });
      console.log(`  ✅ VECTOR STORE CREATED: ${vectorStore.id}`);

      // UPLOAD FILES
      console.log('  📄 UPLOADING FILES...');
      const fileIds = [];
      
      for (const filename of portfolio.files) {
        const filePath = path.join(__dirname, '..', 'data', portfolioType, filename);
        
        if (!fs.existsSync(filePath)) {
          console.log(`  ⚠️  FILE NOT FOUND: ${filename}`);
          continue;
        }

        const file = await client.files.create({
          file: fs.createReadStream(filePath),
          purpose: 'assistants'
        });
        
        fileIds.push(file.id);
        console.log(`  ✅ UPLOADED: ${filename} (${file.id})`);
      }

      // ADD FILES TO VECTOR STORE
      if (fileIds.length > 0) {
        console.log('  🔗 ADDING FILES TO VECTOR STORE...');
        const fileBatch = await client.vectorStores.fileBatches.createAndPoll(
          vectorStore.id,
          { file_ids: fileIds }
        );
        console.log(`  ✅ FILES ADDED TO VECTOR STORE: ${fileBatch.file_counts.total}`);
      }

      // CREATE ASSISTANT
      console.log('  🤖 CREATING ASSISTANT...');
      const assistant = await client.beta.assistants.create({
        name: `${portfolio.name} Assistant`,
        instructions: `YOU ARE AN EXPERT MEDICAL ASSISTANT SPECIALIZING IN ${portfolio.name.toUpperCase()}. USE YOUR KNOWLEDGE BASE TO ANSWER QUESTIONS ABOUT SURGICAL TECHNIQUES, PROTOCOLS, AND MEDICAL PROCEDURES. ALWAYS PROVIDE ACCURATE, DETAILED INFORMATION BASED ON THE UPLOADED DOCUMENTS.

IMPORTANT: FORMAT YOUR RESPONSES AS PLAIN TEXT ONLY. DO NOT USE MARKDOWN FORMATTING. USE SIMPLE TEXT WITH LINE BREAKS FOR ORGANIZATION. AVOID USING MARKDOWN SYMBOLS LIKE #, *, -, OR \`\`\`. JUST USE CLEAN, READABLE PLAIN TEXT.`,
        model: 'gpt-4o',
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: [vectorStore.id]
          }
        }
      });
      
      console.log(`  ✅ ASSISTANT CREATED: ${assistant.id}`);

      results[portfolioType] = {
        assistantId: assistant.id,
        vectorStoreId: vectorStore.id,
        fileIds: fileIds
      };

      console.log(`✅ ${portfolio.name.toUpperCase()} SETUP COMPLETE\n`);
    } catch (error) {
      console.error(`❌ ERROR SETTING UP ${portfolio.name.toUpperCase()}:`, error);
    }
  }

  // OUTPUT ENVIRONMENT VARIABLES
  console.log('🔧 ENVIRONMENT VARIABLES TO ADD:');
  console.log('');
  
  for (const [portfolioType, result] of Object.entries(results)) {
    const upperPortfolioType = portfolioType.toUpperCase();
    console.log(`${upperPortfolioType}_ASSISTANT_ID=${result.assistantId}`);
    console.log(`${upperPortfolioType}_VECTOR_STORE_ID=${result.vectorStoreId}`);
  }

  console.log('\n📝 COPY THESE ENVIRONMENT VARIABLES TO YOUR .env.local FILE');
  console.log('🎉 ASSISTANT SETUP COMPLETE!');
}

// RUN SETUP
if (require.main === module) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY ENVIRONMENT VARIABLE IS REQUIRED');
    process.exit(1);
  }
  
  setupAssistants().catch(console.error);
} 