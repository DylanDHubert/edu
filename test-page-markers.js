// Test script to verify page markers are being added correctly
// @ts-ignore - tiktoken types not available
const { encoding_for_model } = require('tiktoken');

/**
 * ADD PAGE MARKERS EVERY 400 TOKENS FOR SOURCE CITATIONS
 */
function addPageMarkersEvery400Tokens(markdown) {
  try {
    const tokenizer = encoding_for_model('gpt-4');
    const parts = markdown.split(/(<<\d+>>)/);
    const result = [];
    
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const pageMarker = parts[i + 1]; // <<N>>
      
      if (content && content.trim().length > 0) {
        const tokens = tokenizer.encode(content);
        const pageNum = pageMarker ? pageMarker.match(/\d+/)?.[0] : '1';
        
        console.log(`📄 Processing content between markers: ${pageNum} pages, ${tokens.length} tokens`);
        
        // Add page markers every 400 tokens
        for (let j = 0; j < tokens.length; j += 400) {
          const chunkTokens = tokens.slice(j, j + 400);
          const chunkText = tokenizer.decode(chunkTokens);
          result.push(chunkText);
          
          // Add page marker if there are more tokens after this chunk
          if (j + 400 < tokens.length) {
            result.push(`--- Page ${pageNum} ---`);
            console.log(`✅ Added page marker: --- Page ${pageNum} ---`);
          }
        }
      }
      
      if (pageMarker) {
        result.push(pageMarker);
      }
    }
    
    const processedMarkdown = result.join('\n');
    console.log(`📊 PAGE MARKERS ADDED: ${processedMarkdown.length} characters (was ${markdown.length})`);
    return processedMarkdown;
    
  } catch (error) {
    console.error('❌ ERROR ADDING PAGE MARKERS:', error);
    return markdown;
  }
}

// Test with sample markdown that mimics LlamaParse output
const sampleMarkdown = `# Document Title

This is some content on page 1. It has multiple sentences to make it longer. This content should be processed and have page markers added every 400 tokens. Let's make this content longer by adding more text. This is still page 1 content that should be processed.

<<1>>

# Page 2 Content

This is content on page 2. It also has multiple sentences to make it longer. This content should also be processed and have page markers added every 400 tokens. Let's make this content longer by adding more text. This is still page 2 content that should be processed.

<<2>>

# Page 3 Content

This is content on page 3. It also has multiple sentences to make it longer. This content should also be processed and have page markers added every 400 tokens. Let's make this content longer by adding more text. This is still page 3 content that should be processed.

<<3>>`;

console.log('🧪 TESTING PAGE MARKERS PROCESSING');
console.log('=====================================');
console.log('📝 ORIGINAL MARKDOWN:');
console.log(sampleMarkdown);
console.log('\n🔧 PROCESSING...\n');

const processedMarkdown = addPageMarkersEvery400Tokens(sampleMarkdown);

console.log('\n✅ PROCESSED MARKDOWN:');
console.log(processedMarkdown);

console.log('\n🔍 CHECKING FOR PAGE MARKERS:');
const pageMarkers = processedMarkdown.match(/--- Page \d+ ---/g);
if (pageMarkers) {
  console.log(`Found ${pageMarkers.length} page markers:`, pageMarkers);
} else {
  console.log('❌ No page markers found!');
}
