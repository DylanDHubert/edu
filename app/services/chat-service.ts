import { createClient } from '../utils/supabase/server';
import { verifyUserAuth, verifyTeamAccess } from '../utils/auth-helpers';
import { cookies } from 'next/headers';
import { sendMessage, sendMessageStreaming, getThreadMessages } from '../utils/openai';
import { getNotesForTeamContext, formatNotesForContext } from '../utils/notes-server';
import { 
  SendMessageRequest, 
  RateMessageRequest, 
  GetRatingsRequest, 
  GetMessagesRequest,
  ChatResult, 
  RatingResult, 
  RatingsResult,
  ThreadOwnershipResult,
  StreamingUpdate
} from '../types/chat';

export class ChatService {
  private async getSupabase() {
    const cookieStore = cookies();
    return await createClient(cookieStore);
  }

  /**
   * VERIFY THREAD OWNERSHIP
   */
  async verifyThreadOwnership(threadId: string, userId: string): Promise<ThreadOwnershipResult> {
    try {
      const supabase = await this.getSupabase();
      const { data: chatHistory, error: ownershipError } = await supabase
        .from('chat_history')
        .select('*')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .single();

      if (ownershipError || !chatHistory) {
        return {
          success: false,
          error: 'Thread not found or access denied'
        };
      }

      return {
        success: true,
        chatHistory
      };
    } catch (error) {
      console.error('Error verifying thread ownership:', error);
      return {
        success: false,
        error: 'Failed to verify thread ownership'
      };
    }
  }

  /**
   * BUILD MESSAGE CONTEXT WITH NOTES
   */
  async buildMessageContext(
    teamId: string, 
    accountId: string, 
    portfolioId: string, 
    userId: string, 
    message: string
  ): Promise<string> {
    try {
      // GET NOTES FOR TEAM CONTEXT
      const notes = await getNotesForTeamContext(teamId, accountId, portfolioId, userId);
      const notesContext = formatNotesForContext(notes);
      
      // COMBINE NOTES AND MESSAGE
      return notesContext ? `${notesContext}USER MESSAGE: ${message}` : message;
    } catch (error) {
      console.error('Error building message context:', error);
      return message; // Fallback to original message
    }
  }

  /**
   * SEND A MESSAGE (NON-STREAMING)
   */
  async sendMessage(request: SendMessageRequest, userId: string): Promise<ChatResult> {
    try {
      // VERIFY THREAD OWNERSHIP
      const ownershipResult = await this.verifyThreadOwnership(request.threadId, userId);
      if (!ownershipResult.success) {
        return {
          success: false,
          error: ownershipResult.error
        };
      }

      // BUILD MESSAGE CONTEXT
      const messageWithContext = await this.buildMessageContext(
        request.teamId,
        request.accountId,
        request.portfolioId,
        userId,
        request.message
      );

      // SEND MESSAGE
      const messages = await sendMessage(request.threadId, messageWithContext, request.assistantId);
      
      return {
        success: true,
        messages
      };
    } catch (error) {
      console.error('Error sending message:', error);
      return {
        success: false,
        error: 'Failed to send message'
      };
    }
  }

  /**
   * SEND A MESSAGE (STREAMING)
   */
  async sendMessageStreaming(request: SendMessageRequest, userId: string): Promise<ReadableStream> {
    try {
      // VERIFY THREAD OWNERSHIP
      const ownershipResult = await this.verifyThreadOwnership(request.threadId, userId);
      if (!ownershipResult.success) {
        throw new Error(ownershipResult.error);
      }

      // BUILD MESSAGE CONTEXT
      const messageWithContext = await this.buildMessageContext(
        request.teamId,
        request.accountId,
        request.portfolioId,
        userId,
        request.message
      );

      // CREATE STREAMING RESPONSE
      const encoder = new TextEncoder();
      
      return new ReadableStream({
        async start(controller) {
          try {
            await sendMessageStreaming(
              request.threadId, 
              messageWithContext, 
              request.assistantId,
              (content: string, citations: string[], step?: string) => {
                try {
                  // SEND STREAMING UPDATE WITH SAFE JSON HANDLING
                  const data = JSON.stringify({
                    type: 'update',
                    content,
                    citations,
                    step
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (jsonError) {
                  console.error('JSON stringify error:', jsonError);
                  // FALLBACK: SEND A SAFE VERSION
                  const safeData = JSON.stringify({
                    type: 'update',
                    content: content.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''), // REMOVE CONTROL CHARACTERS
                    citations: citations || [],
                    step: step || ''
                  });
                  controller.enqueue(encoder.encode(`data: ${safeData}\n\n`));
                }
              }
            );
            
            // SEND COMPLETION SIGNAL
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          } catch (error) {
            const errorData = JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        }
      });
    } catch (error) {
      console.error('Error creating streaming response:', error);
      throw error;
    }
  }

  /**
   * RATE A MESSAGE
   */
  async rateMessage(request: RateMessageRequest, userId: string): Promise<RatingResult> {
    try {
      // VERIFY THREAD OWNERSHIP
      const ownershipResult = await this.verifyThreadOwnership(request.threadId, userId);
      if (!ownershipResult.success) {
        return {
          success: false,
          error: ownershipResult.error
        };
      }

      // VERIFY USER HAS ACCESS TO THIS TEAM
      await verifyTeamAccess(request.teamId, userId);

      // UPSERT RATING (INSERT OR UPDATE IF EXISTS)
      const upsertData: any = {
        user_id: userId,
        thread_id: request.threadId,
        message_id: request.messageId,
        team_id: request.teamId,
        account_id: request.accountId,
        portfolio_id: request.portfolioId,
        response_time_ms: request.responseTimeMs || null,
        citations: request.citations || [],
        feedback_text: request.feedbackText || null
      };
      
      // ONLY INCLUDE RATING IF IT'S PROVIDED
      if (request.rating !== undefined && request.rating !== null) {
        upsertData.rating = request.rating;
      }
      
      const supabase = await this.getSupabase();
      const { data: ratingData, error: ratingError } = await supabase
        .from('message_ratings')
        .upsert(upsertData, {
          onConflict: 'user_id,message_id'
        })
        .select()
        .single();

      if (ratingError) {
        console.error('ERROR SAVING RATING:', ratingError);
        return {
          success: false,
          error: 'Failed to save rating'
        };
      }

      return {
        success: true,
        rating: ratingData
      };
    } catch (error) {
      console.error('Error rating message:', error);
      return {
        success: false,
        error: 'Failed to save rating'
      };
    }
  }

  /**
   * GET RATINGS FOR A THREAD
   */
  async getRatings(request: GetRatingsRequest, userId: string): Promise<RatingsResult> {
    try {
      // VERIFY THREAD OWNERSHIP
      const ownershipResult = await this.verifyThreadOwnership(request.threadId, userId);
      if (!ownershipResult.success) {
        return {
          success: false,
          error: ownershipResult.error
        };
      }

      // GET RATINGS FOR THIS THREAD
      const supabase = await this.getSupabase();
      const { data: ratings, error: ratingsError } = await supabase
        .from('message_ratings')
        .select('message_id, rating, team_id, account_id, portfolio_id, response_time_ms, citations, feedback_text')
        .eq('thread_id', request.threadId)
        .eq('user_id', userId);

      if (ratingsError) {
        console.error('ERROR LOADING RATINGS:', ratingsError);
        return {
          success: false,
          error: 'Failed to load ratings'
        };
      }

      // CONVERT TO OBJECT FOR EASY LOOKUP
      const ratingsMap = (ratings || []).reduce((acc: Record<string, any>, rating: any) => {
        acc[rating.message_id] = {
          rating: rating.rating,
          teamId: rating.team_id,
          accountId: rating.account_id,
          portfolioId: rating.portfolio_id,
          responseTimeMs: rating.response_time_ms,
          citations: rating.citations || [],
          feedbackText: rating.feedback_text || null
        };
        return acc;
      }, {} as Record<string, any>);

      return {
        success: true,
        ratings: ratingsMap
      };
    } catch (error) {
      console.error('Error loading ratings:', error);
      return {
        success: false,
        error: 'Failed to load ratings'
      };
    }
  }

  /**
   * GET MESSAGES FOR A THREAD
   */
  async getMessages(request: GetMessagesRequest, userId: string): Promise<ChatResult> {
    try {
      // VERIFY THREAD OWNERSHIP
      const ownershipResult = await this.verifyThreadOwnership(request.threadId, userId);
      if (!ownershipResult.success) {
        return {
          success: false,
          error: ownershipResult.error
        };
      }

      // GET MESSAGES FROM OPENAI
      const messages = await getThreadMessages(request.threadId);
      
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

      return {
        success: true,
        messages: processedMessages
      };
    } catch (error) {
      console.error('Error getting messages:', error);
      return {
        success: false,
        error: 'Failed to get messages'
      };
    }
  }
}
