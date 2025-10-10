import { createClient } from '../utils/supabase/server';
import { verifyUserAuth, verifycourseAccess } from '../utils/auth-helpers';
import { cookies } from 'next/headers';
import { sendMessage, sendMessageStreaming, getThreadMessages } from '../utils/openai';
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
      // Use service client to bypass RLS for thread ownership verification
      const { createServiceClient } = await import('../utils/supabase/server');
      const serviceClient = createServiceClient();
      const { data: chatHistory, error: ownershipError } = await serviceClient
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
   * BUILD MESSAGE CONTEXT (KNOWLEDGE IS NOW IN VECTOR STORE)
   */
  async buildMessageContext(
    courseId: string, 
    portfolioId: string, 
    userId: string, 
    message: string
  ): Promise<string> {
    // KNOWLEDGE IS NOW HANDLED VIA VECTOR STORE, NO CONTEXT INJECTION NEEDED
    return message;
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
        request.courseId,
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
        request.courseId,
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
              (content: string, citations: string[], step?: string, citationData?: any[], openaiMessageId?: string, sources?: any[]) => {
                try {
                  // SEND STREAMING UPDATE WITH SAFE JSON HANDLING
                  const data = JSON.stringify({
                    type: 'update',
                    content,
                    citations,
                    step,
                    citationData: citationData || [],
                    openaiMessageId: openaiMessageId || null,
                    sources: sources || []
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (jsonError) {
                  console.error('JSON stringify error:', jsonError);
                  // FALLBACK: SEND A SAFE VERSION
                  const safeData = JSON.stringify({
                    type: 'update',
                    content: content.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''), // REMOVE CONTROL CHARACTERS
                    citations: citations || [],
                    step: step || '',
                    citationData: citationData || [],
                    openaiMessageId: openaiMessageId || null,
                    sources: sources || []
                  });
                  controller.enqueue(encoder.encode(`data: ${safeData}\n\n`));
                }
              },
              userId
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

      // VERIFY USER HAS ACCESS TO THIS course
      await verifycourseAccess(request.courseId, userId);

      // UPSERT RATING (INSERT OR UPDATE IF EXISTS)
      const upsertData: any = {
        user_id: userId,
        thread_id: request.threadId,
        message_id: request.messageId,
        course_id: request.courseId,
        portfolio_id: request.portfolioId,
        response_time_ms: request.responseTimeMs || null,
        feedback_text: request.feedbackText || null
      };
      
      // ONLY INCLUDE RATING IF IT'S PROVIDED
      if (request.rating !== undefined && request.rating !== null) {
        upsertData.rating = request.rating;
      }
      
      // Use service client to bypass RLS for rating operations
      const { createServiceClient } = await import('../utils/supabase/server');
      const serviceClient = createServiceClient();
      const { data: ratingData, error: ratingError } = await serviceClient
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

      // GET RATINGS FOR THIS THREAD - Use service client to bypass RLS
      const { createServiceClient } = await import('../utils/supabase/server');
      const serviceClient = createServiceClient();
      const { data: ratings, error: ratingsError } = await serviceClient
        .from('message_ratings')
        .select('message_id, rating, course_id, portfolio_id, response_time_ms, feedback_text')
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
          courseId: rating.course_id,
          portfolioId: rating.portfolio_id,
          responseTimeMs: rating.response_time_ms,
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
