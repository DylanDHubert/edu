// Debug test for page markers processing
// This simulates the exact logic from our cron job

/**
 * SIMULATE PAGE MARKERS EVERY 400 TOKENS (using character count as proxy)
 */
function addPageMarkersEvery400Tokens(markdown) {
  console.log('🔧 STARTING PAGE MARKERS PROCESSING');
  console.log('📝 INPUT MARKDOWN LENGTH:', markdown.length);
  
  try {
    // Split by LlamaParse page markers (<<N>>)
    const parts = markdown.split(/(<<\d+>>)/);
    console.log('📊 SPLIT INTO PARTS:', parts.length);
    console.log('📋 PARTS:', parts.map((part, i) => `${i}: "${part.substring(0, 50)}..."`));
    
    const result = [];
    
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const pageMarker = parts[i + 1]; // <<N>>
      
      console.log(`\n🔍 PROCESSING PART ${i}:`);
      console.log(`   Content length: ${content ? content.length : 0}`);
      console.log(`   Page marker: ${pageMarker}`);
      
      if (content && content.trim().length > 0) {
        // Use character count as proxy for tokens (roughly 4 chars = 1 token)
        const charCount = content.length;
        const estimatedTokens = Math.floor(charCount / 4);
        const pageNum = pageMarker ? pageMarker.match(/\d+/)?.[0] : '1';
        
        console.log(`   📄 Page ${pageNum}: ${charCount} chars (~${estimatedTokens} tokens)`);
        
        // ALWAYS add page marker at the beginning of each page section
        const pageMarkerText = `--- Page ${pageNum} ---`;
        result.push(pageMarkerText);
        console.log(`   🎯 Added initial page marker: ${pageMarkerText}`);
        
        // Add page markers every 400 tokens (1600 characters)
        const chunkSize = 1600; // 400 tokens * 4 chars/token
        console.log(`   🔧 Chunk size: ${chunkSize} characters`);
        
        for (let j = 0; j < charCount; j += chunkSize) {
          const chunk = content.slice(j, j + chunkSize);
          result.push(chunk);
          console.log(`   ✅ Added chunk: ${chunk.substring(0, 30)}...`);
          
          // Add page marker if there are more characters after this chunk
          if (j + chunkSize < charCount) {
            result.push(pageMarkerText);
            console.log(`   🎯 Added additional page marker: ${pageMarkerText}`);
          }
        }
      }
      
      if (pageMarker) {
        result.push(pageMarker);
        console.log(`   📌 Added page marker: ${pageMarker}`);
      }
    }
    
    const processedMarkdown = result.join('\n');
    console.log(`\n📊 FINAL RESULT:`);
    console.log(`   Original length: ${markdown.length}`);
    console.log(`   Processed length: ${processedMarkdown.length}`);
    console.log(`   Difference: ${processedMarkdown.length - markdown.length}`);
    
    return processedMarkdown;
    
  } catch (error) {
    console.error('❌ ERROR ADDING PAGE MARKERS:', error);
    return markdown;
  }
}

// Test with realistic LlamaParse output
const sampleMarkdown = `# Document Title

This is some content on page 1. It has multiple sentences to make it longer. This content should be processed and have page markers added every 400 tokens. Let's make this content longer by adding more text. This is still page 1 content that should be processed. We need to make this content much longer to trigger the 400 token threshold. Let's add more sentences here to make sure we have enough content to test the page marker insertion. This is still part of page 1 and should have page markers inserted every 400 tokens. Let's continue adding more content to make sure we trigger the page marker insertion logic. This content is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 1 content and should have page markers inserted. We need to add even more content to make sure we trigger the 400 token threshold. This is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 1 content and should have page markers inserted. We need to add even more content to make sure we trigger the 400 token threshold. This is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 1 content and should have page markers inserted.

<<1>>

# Page 2 Content

This is content on page 2. It also has multiple sentences to make it longer. This content should also be processed and have page markers added every 400 tokens. Let's make this content longer by adding more text. This is still page 2 content that should be processed. We need to make this content much longer to trigger the 400 token threshold. Let's add more sentences here to make sure we have enough content to test the page marker insertion. This is still part of page 2 and should have page markers inserted every 400 tokens. Let's continue adding more content to make sure we trigger the page marker insertion logic. This content is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 2 content and should have page markers inserted. We need to add even more content to make sure we trigger the 400 token threshold. This is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 2 content and should have page markers inserted. We need to add even more content to make sure we trigger the 400 token threshold. This is getting quite long now and should definitely trigger the page marker insertion. Let's add even more content to make sure we have enough to test the functionality properly. This is still page 2 content and should have page markers inserted.

<<2>>`;

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

console.log('\n🎯 TESTING SOURCE EXTRACTION:');
const sourceMatches = processedMarkdown.match(/--- Page (\d+) ---/g);
if (sourceMatches) {
  console.log(`Source extraction would find ${sourceMatches.length} sources:`, sourceMatches);
} else {
  console.log('❌ No sources would be found!');
}
