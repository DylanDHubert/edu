// NOTE UTILITIES FOR SERVER-SIDE (API ROUTES)

import { createClient } from "./supabase/server";
import { cookies } from "next/headers";


export async function getNotesForPortfolio(portfolioType: string, userId: string) {
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

export async function getNotesForTeamContext(teamId: string, accountId: string, portfolioId: string, userId: string) {
  const cookieStore = cookies();
  const supabase = await createClient(cookieStore);

  try {
    console.log('🔍 QUERYING NOTES WITH:', { teamId, accountId, portfolioId, userId });
    
    // GET NOTES FOR TEAM CONTEXT (INCLUDING PORTFOLIO-SHARED NOTES)
    const { data: notes, error } = await supabase
      .from('notes')
      .select(`
        *,
        team:teams(name),
        account:team_accounts(name),
        portfolio:team_portfolios(name)
      `)
      .eq('team_id', teamId)
      .eq('portfolio_id', portfolioId)
      .or(`user_id.eq.${userId},is_shared.eq.true,is_portfolio_shared.eq.true`)
      .or(`account_id.eq.${accountId},account_id.is.null`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ ERROR LOADING TEAM CONTEXT NOTES:', error);
      return [];
    }

    console.log('✅ RAW NOTES FROM DB:', notes?.length || 0, 'notes found');
    if (notes && notes.length > 0) {
      notes.forEach((note, index) => {
        console.log(`📝 NOTE ${index + 1}:`, {
          id: note.id,
          title: note.title,
          content: note.content?.substring(0, 50) + '...',
          user_id: note.user_id,
          is_shared: note.is_shared,
          team_id: note.team_id,
          account_id: note.account_id,
          portfolio_id: note.portfolio_id
        });
      });
    }

    return notes || [];
  } catch (error) {
    console.error('❌ ERROR GETTING NOTES FOR TEAM CONTEXT:', error);
    return [];
  }
}

export function formatNotesForContext(notes: any[]): string {
  if (!notes || notes.length === 0) {
    return '';
  }

  const notesText = notes.map((note, index) => {
    // Determine context label
    let contextLabel = '';
    if (note.team && note.portfolio) {
      if (note.account) {
        // Account-specific note
        contextLabel = `${note.team.name} → ${note.account.name} → ${note.portfolio.name}`;
      } else if (note.is_portfolio_shared) {
        // Portfolio-shared note
        contextLabel = `${note.team.name} → ALL ACCOUNTS → ${note.portfolio.name}`;
      } else {
        // Portfolio-level note (no account)
        contextLabel = `${note.team.name} → ${note.portfolio.name}`;
      }
    } else if (note.portfolio_type) {
      // Legacy individual note
      contextLabel = note.portfolio_type === 'general' ? 'GENERAL' : note.portfolio_type.toUpperCase();
    } else {
      contextLabel = 'UNKNOWN';
    }
    
    const sharedLabel = note.is_shared ? ' (TEAM)' : '';
    const portfolioSharedLabel = note.is_portfolio_shared ? ' (PORTFOLIO)' : '';
    
    // HANDLE IMAGES
    let imageInfo = '';
    if (note.images && Array.isArray(note.images) && note.images.length > 0) {
      console.log('🔍 NOTES FORMATTER - Processing note with images:');
      console.log('  📝 Note title:', note.title);
      console.log('  🖼️ Number of images:', note.images.length);
      
      const imageUrls = note.images.map((image: any, index: number) => {
        if (image.url) {
          console.log(`  🔗 Image ${index + 1} URL:`, image.url);
          
          // USE THE URL DIRECTLY (ALREADY IN CORRECT FORMAT)
          const description = image.description ? ` (${image.description})` : '';
          return `[IMAGE URL: ${image.url}${description}]`;
        }
        return '';
      }).filter((url: string) => url !== '');
      
      if (imageUrls.length > 0) {
        imageInfo = ` ${imageUrls.join(' ')}`;
      }
    }
    
    return `NOTE ${index + 1} - ${contextLabel}${sharedLabel}${portfolioSharedLabel}:
TITLE: ${note.title}
CONTENT: ${note.content}${imageInfo}
---`;
  }).join('\n\n');

  const contextText = `\n\nADDITIONAL NOTES FOR REFERENCE (THE CONTENT OF THESE NOTES TAKES PRIOTIY OVER RETRIEVED CONTENT):\n${notesText}\n\nIMPORTANT: WHEN REFERENCING NOTES WITH IMAGES, ONLY INCLUDE THE EXACT IMAGE URL IN YOUR RESPONSE SO THE USER CAN VIEW THE IMAGE. DO NOT EXPLAIN LINKS OR ANYATHING - JUST INCLUDE THE URL IN THIS FORMAT AT THE END OF THE NOTE (WITHOUT A FOLLOWING PERIOD): [IMAGE URL: /api/images/filename.jpg]`;
  
  return contextText;
}
