// Utility to generate formatted text content from team knowledge for OpenAI vector stores

interface KnowledgeItem {
  item?: string;
  quantity?: number;
  notes?: string;
  name?: string;
  description?: string;
  imageUrl?: string;
  title?: string;
  content?: string;
}

interface KnowledgeData {
  inventory: Array<{ item: string; quantity: number; notes: string }>;
  instruments: Array<{ name: string; description: string; quantity?: number | null; imageUrl?: string }>;
  technical: Array<{ title: string; content: string }>;
  accessMisc: Array<{ title: string; content: string }>;
}

interface AccountPortfolioKnowledgeParams {
  teamName: string;
  accountName: string;
  portfolioName: string;
  knowledge: KnowledgeData;
}

export function createAccountPortfolioKnowledgeText(params: AccountPortfolioKnowledgeParams): string {
  const { teamName, accountName, portfolioName, knowledge } = params;
  
  let text = `=== ${teamName.toUpperCase()} - ${accountName.toUpperCase()} - ${portfolioName.toUpperCase()} KNOWLEDGE ===\n\n`;
  
  // Inventory Section
  if (knowledge.inventory && knowledge.inventory.length > 0) {
    text += "INVENTORY:\n";
    for (const item of knowledge.inventory) {
      if (item.item && item.item.trim()) {
        text += `- ${item.item}: Quantity ${item.quantity || 0}`;
        if (item.notes && item.notes.trim()) {
          text += ` (${item.notes})`;
        }
        text += "\n";
      }
    }
    text += "\n";
  }
  
  // Instruments Section
  if (knowledge.instruments && knowledge.instruments.length > 0) {
    text += "INSTRUMENTS & TRAYS:\n";
    for (const item of knowledge.instruments) {
      if (item.name && item.name.trim()) {
        text += `- ${item.name}`;
        // Add quantity if available
        if (item.quantity !== undefined && item.quantity !== null) {
          text += ` (Qty: ${item.quantity})`;
        }
        if (item.description && item.description.trim()) {
          text += `: ${item.description}`;
        }
        // Include image reference if available (use stored path or uploaded file reference)
        if (item.imageUrl && item.imageUrl.trim() && !item.imageUrl.startsWith('blob:')) {
          console.log('🔍 KNOWLEDGE GENERATOR - Processing instrument image:');
          console.log('  📄 Instrument name:', item.name);
          console.log('  🔗 Original imageUrl:', item.imageUrl);
          
          let proxyUrl;
          
          // Check if it's already a properly formatted team image URL
          if (item.imageUrl.startsWith('/api/images/team-') && item.imageUrl.includes('/instruments/')) {
            // Keep the team image URL as-is - don't break it!
            proxyUrl = item.imageUrl;
            console.log('  🏢 DETECTED TEAM IMAGE URL - keeping as-is');
            console.log('  🎯 Using original URL:', proxyUrl);
          } else {
            // For other images, extract filename (legacy behavior)
            const urlParts = item.imageUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            console.log('  📁 URL parts:', urlParts);
            console.log('  📎 Extracted filename:', filename);
            
            proxyUrl = `/api/images/${encodeURIComponent(filename)}`;
            console.log('  🔄 Generated proxy URL:', proxyUrl);
          }
          
          text += `\n  [IMAGE: ${item.name} - ${proxyUrl}]`;
        }
        text += "\n";
      }
    }
    text += "\n";
  }
  
  // Technical Information Section
  if (knowledge.technical && knowledge.technical.length > 0) {
    text += "TECHNICAL INFORMATION:\n";
    for (const item of knowledge.technical) {
      if (item.title && item.title.trim()) {
        text += `- ${item.title}`;
        if (item.content && item.content.trim()) {
          text += `: ${item.content}`;
        }
        text += "\n";
      }
    }
    text += "\n";
  }

  // Access & Misc Section
  if (knowledge.accessMisc && knowledge.accessMisc.length > 0) {
    text += "ACCESS & MISCELLANEOUS:\n";
    for (const item of knowledge.accessMisc) {
      if (item.title && item.title.trim()) {
        text += `- ${item.title}`;
        if (item.content && item.content.trim()) {
          text += `: ${item.content}`;
        }
        text += "\n";
      }
    }
    text += "\n";
  }
  
  // Add footer
  text += `\nThis knowledge is specific to ${accountName} for ${portfolioName} procedures.\n`;
  text += `For general team information, refer to the ${teamName} general knowledge base.\n`;
  
  return text;
}

interface GeneralKnowledgeParams {
  teamName: string;
  surgeonInfo: Array<{ title: string; content: string }>;
  accessMisc?: Array<{ title: string; content: string }>;
}

export function createGeneralKnowledgeText(params: GeneralKnowledgeParams): string {
  const { teamName, surgeonInfo } = params;
  
  let text = `=== ${teamName.toUpperCase()} - GENERAL TEAM KNOWLEDGE ===\n\n`;

  // Surgeon Information Section
  if (surgeonInfo && surgeonInfo.length > 0) {
    text += "SURGEON INFORMATION:\n";
    for (const info of surgeonInfo) {
      if (info.title && info.title.trim()) {
        text += `- ${info.title}`;
        if (info.content && info.content.trim()) {
          text += `: ${info.content}`;
        }
        text += "\n";
      }
    }
    text += "\n";
  }
  
  // Add footer
  text += `\nThis is general knowledge for the ${teamName} team.\n`;
  
  return text;
}

// Filter surgeon info by portfolio type - includes general practice + matching procedures
export function filterSurgeonInfoByPortfolio(
  surgeonKnowledgeData: any[], 
  portfolioName: string
): Array<{ title: string; content: string }> {
  if (!surgeonKnowledgeData || surgeonKnowledgeData.length === 0) {
    return [];
  }

  const portfolioLower = portfolioName.toLowerCase();
  
  const filteredEntries = surgeonKnowledgeData
    .filter((k: any) => k.category === 'surgeon_info')
    .filter((k: any) => {
      const procedureFocus = k.metadata?.procedure_focus?.toLowerCase() || '';
      
      // ALWAYS include general surgeon information (for any portfolio)
      if (procedureFocus === 'general' || procedureFocus === 'general practice' || procedureFocus === '') {
        return true;
      }
      
      // Include procedure-specific info that matches the portfolio
      let isMatch = false;
      
      // Knee/TKA procedures
      if (portfolioLower.includes('knee') || portfolioLower.includes('tk')) {
        isMatch = procedureFocus.includes('knee') || procedureFocus.includes('tka');
      }
      
      // Hip/THA procedures
      if (portfolioLower.includes('hip') || portfolioLower.includes('th')) {
        isMatch = isMatch || procedureFocus.includes('hip') || procedureFocus.includes('tha');
      }
      
      // Spine procedures
      if (portfolioLower.includes('spine') || portfolioLower.includes('spinal')) {
        isMatch = isMatch || procedureFocus.includes('spine') || procedureFocus.includes('spinal');
      }
      
      // Shoulder procedures
      if (portfolioLower.includes('shoulder')) {
        isMatch = isMatch || procedureFocus.includes('shoulder');
      }
      
      // Eyes procedures (for testing)
      if (portfolioLower.includes('eye')) {
        isMatch = isMatch || procedureFocus.includes('eye');
      }
      
      // Fields procedures (for testing) 
      if (portfolioLower.includes('field')) {
        isMatch = isMatch || procedureFocus.includes('field');
      }
      
      // Exact match fallback - if portfolio name matches procedure focus exactly
      if (portfolioLower === procedureFocus) {
        isMatch = true;
      }
      
      return isMatch;
    })
    .map((k: any) => ({
      title: k.metadata?.name ? 
        `${k.metadata.name}${k.metadata.procedure_focus && k.metadata.procedure_focus !== 'General Practice' && k.metadata.procedure_focus !== '' ? ` - ${k.metadata.procedure_focus}` : ''}` :
        k.title || '',
      content: k.metadata?.notes || k.content || ''
    }));

  return filteredEntries;
} 