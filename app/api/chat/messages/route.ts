import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../utils/supabase/server';
import { getThreadMessages } from '../../../utils/openai';

import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { threadId, portfolioType } = await request.json();
    
    if (!threadId) {
      return NextResponse.json(
        { error: 'THREAD ID IS REQUIRED' },
        { status: 400 }
      );
    }

    // VERIFY USER AUTHENTICATION
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // GET MESSAGES FROM OPENAI
    const messages = await getThreadMessages(threadId);
    
    // PROCESS MESSAGES TO ADD CITATIONS
    const processedMessages = messages.map(message => {
      if (message.role === 'assistant') {
        const processedContent = message.content.map(content => {
          if (content.type === 'text' && content.text.annotations) {
            // SIMPLY REPLACE CITATION PLACEHOLDERS WITH NUMBERED REFERENCES
            let processedText = content.text.value;
            for (let index = 0; index < content.text.annotations.length; index++) {
              const annotation = content.text.annotations[index];
              if (annotation.type === 'file_citation') {
                processedText = processedText.replace(annotation.text, `[${index + 1}]`);
              }
            }
            return {
              ...content,
              text: {
                ...content.text,
                value: processedText
              }
            };
          }
          return content;
        });
        
        return {
          ...message,
          content: processedContent
        };
      }
      return message;
    });

    return NextResponse.json({ messages: processedMessages });
  } catch (error) {
    console.error('ERROR GETTING MESSAGES:', error);
    return NextResponse.json(
      { error: 'FAILED TO GET MESSAGES' },
      { status: 500 }
    );
  }
} 