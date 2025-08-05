import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { getThreadMessages } from '../../../utils/openai';
import { PortfolioType } from '../../../utils/openai';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId, portfolioType } = await request.json();
    
    if (!threadId || !portfolioType) {
      return NextResponse.json(
        { error: 'THREAD ID AND PORTFOLIO TYPE ARE REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // VERIFY USER OWNS THIS THREAD
    const { data: chatHistory, error: ownershipError } = await supabase
      .from('chat_history')
      .select('*')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .single();

    if (ownershipError || !chatHistory) {
      return NextResponse.json(
        { error: 'THREAD NOT FOUND OR ACCESS DENIED' },
        { status: 404 }
      );
    }

    // GET MESSAGES FROM THREAD
    const messages = await getThreadMessages(threadId);
    
    // PROCESS CITATIONS FOR ASSISTANT MESSAGES
    const processedMessages = messages.map(message => {
      if (message.role === 'assistant' && message.content[0].type === 'text') {
        const textContent = message.content[0] as any;
        const annotations = textContent.text.annotations;
        
        if (annotations && annotations.length > 0) {
          // PROCESS CITATIONS TO EXTRACT FILENAMES
          const processedAnnotations = annotations.map((annotation: any, index: number) => {
            if (annotation.type === 'file_citation' && annotation.file_citation) {
              // EXTRACT FILENAME AND PAGE/PARAGRAPH FROM CITATION TEXT
              const citationText = annotation.text;
              const citationMatch = citationText.match(/【(\d+):(\d+)†(.+?)】/);
              let filename = 'Unknown file';
              let pageInfo = '';
              
              if (citationMatch) {
                const page = citationMatch[1];
                const paragraph = citationMatch[2];
                filename = citationMatch[3];
                pageInfo = ` (Page ${page}, Paragraph ${paragraph})`;
              } else {
                filename = annotation.file_citation.quote || 'Unknown file';
              }
              
              return {
                ...annotation,
                file_citation: {
                  ...annotation.file_citation,
                  quote: filename + pageInfo
                }
              };
            }
            return annotation;
          });
          
          return {
            ...message,
            content: [{
              ...textContent,
              text: {
                ...textContent.text,
                annotations: processedAnnotations
              }
            }]
          };
        }
      }
      return message;
    });
    
    return NextResponse.json({ messages: processedMessages });
  } catch (error) {
    console.error('ERROR LOADING MESSAGES:', error);
    return NextResponse.json(
      { error: 'INTERNAL SERVER ERROR' },
      { status: 500 }
    );
  }
} 