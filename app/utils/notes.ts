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
    return `NOTE ${index + 1} - ${portfolioLabel}${sharedLabel}:
TITLE: ${note.title}
CONTENT: ${note.content}
---`;
  }).join('\n\n');

  return `\n\nADDITIONAL NOTES FOR REFERENCE:\n${notesText}\n\n`;
} 