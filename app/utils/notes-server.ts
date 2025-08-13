// NOTE UTILITIES FOR SERVER-SIDE (API ROUTES)

import { createClient } from "./supabase/server";
import { cookies } from "next/headers";
import { PortfolioType } from "./portfolios";

export async function getNotesForPortfolio(portfolioType: PortfolioType, userId: string) {
  const cookieStore = cookies();
  const supabase = await createClient(cookieStore);

  try {
    // GET USER'S PERSONAL NOTES FOR THIS PORTFOLIO
    const { data: personalNotes, error: personalError } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .or(`portfolio_type.eq.${portfolioType},portfolio_type.eq.general`);

    if (personalError) {
      console.error('ERROR LOADING PERSONAL NOTES:', personalError);
      return [];
    }

    // GET SHARED NOTES FOR THIS PORTFOLIO
    const { data: sharedNotes, error: sharedError } = await supabase
      .from('notes')
      .select('*')
      .eq('is_shared', true)
      .or(`portfolio_type.eq.${portfolioType},portfolio_type.eq.general`);

    if (sharedError) {
      console.error('ERROR LOADING SHARED NOTES:', sharedError);
      return personalNotes || [];
    }

    // COMBINE AND REMOVE DUPLICATES
    const allNotes = [...(personalNotes || []), ...(sharedNotes || [])];
    const uniqueNotes = allNotes.filter((note, index, self) => 
      index === self.findIndex(n => n.id === note.id)
    );

    return uniqueNotes;
  } catch (error) {
    console.error('ERROR GETTING NOTES FOR PORTFOLIO:', error);
    return [];
  }
}

export function formatNotesForContext(notes: any[]): string {
  if (!notes || notes.length === 0) {
    return '';
  }

  const notesText = notes.map((note, index) => {
    const portfolioLabel = note.portfolio_type === 'general' ? 'GENERAL' : note.portfolio_type.toUpperCase();
    const sharedLabel = note.is_shared ? ' (SHARED)' : '';
    
    // HANDLE MULTIPLE IMAGES
    let imageInfo = '';
    if (note.images && Array.isArray(note.images) && note.images.length > 0) {
      const imageUrls = note.images.map((image: any) => {
        if (image.url) {
          // EXTRACT FILENAME FROM SUPABASE URL
          const urlParts = image.url.split('/');
          const filename = urlParts[urlParts.length - 1];
          const proxyUrl = `/api/images/${encodeURIComponent(filename)}`;
          const description = image.description ? ` (${image.description})` : '';
          return `[IMAGE URL: ${proxyUrl}${description}]`;
        }
        return '';
      }).filter((url: string) => url !== '');
      
      if (imageUrls.length > 0) {
        imageInfo = ` ${imageUrls.join(' ')}`;
      }
    }
    // BACKWARD COMPATIBILITY: HANDLE OLD SINGLE IMAGE FORMAT
    else if (note.image_url) {
      const urlParts = note.image_url.split('/');
      const filename = urlParts[urlParts.length - 1];
      const proxyUrl = `/api/images/${encodeURIComponent(filename)}`;
      const description = note.image_description ? ` (${note.image_description})` : '';
      imageInfo = ` [IMAGE URL: ${proxyUrl}${description}]`;
    }
    
    return `NOTE ${index + 1} - ${portfolioLabel}${sharedLabel}:
TITLE: ${note.title}
CONTENT: ${note.content}${imageInfo}
---`;
  }).join('\n\n');

  const contextText = `\n\nADDITIONAL NOTES FOR REFERENCE (THE CONTENT OF THESE NOTES TAKES PRIOTIY OVER RETRIEVED CONTENT):\n${notesText}\n\nIMPORTANT: WHEN REFERENCING NOTES WITH IMAGES, ONLY INCLUDE THE EXACT IMAGE URL IN YOUR RESPONSE SO THE USER CAN VIEW THE IMAGE. DO NOT EXPLAIN LINKS OR ANYATHING - JUST INCLUDE THE URL IN THIS FORMAT AT THE END OF THE NOTE (WITHOUT A FOLLOWING PERIOD): [IMAGE URL: /api/images/filename.jpg]`;
  
  return contextText;
}
