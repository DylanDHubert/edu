// THUMBNAIL SERVICE: HANDLES SCREENSHOT AND PDF RETRIEVAL FROM SUPABASE STORAGE
// PROVIDES CLEAN API FOR FRONTEND TO ACCESS DOCUMENT ASSETS

import { createServiceClient } from '../utils/supabase/server';

export interface ThumbnailResult {
  data: ArrayBuffer;
  contentType: string;
  filename: string;
}

export interface PDFResult {
  data: ArrayBuffer;
  contentType: string;
  filename: string;
}

export class ThumbnailService {
  private supabase = createServiceClient();

  /**
   * GET SCREENSHOT THUMBNAIL BY DOCUMENT ID AND PAGE NUMBER
   */
  async getScreenshotThumbnail(
    teamId: string,
    portfolioId: string,
    documentId: string,
    pageNumber: number
  ): Promise<ThumbnailResult> {
    try {
      const filename = `page_${pageNumber}.jpg`;
      const filePath = `teams/${teamId}/portfolios/${portfolioId}/screenshots/${documentId}/${filename}`;
      
      console.log('🔍 THUMBNAIL SERVICE: FETCHING SCREENSHOT');
      console.log('  📁 File path:', filePath);
      console.log('  📄 Document ID:', documentId);
      console.log('  📖 Page:', pageNumber);

      const { data, error } = await this.supabase.storage
        .from('team-documents')
        .download(filePath);

      if (error) {
        console.error('❌ THUMBNAIL SERVICE: SCREENSHOT NOT FOUND:', error);
        throw new Error(`Screenshot not found: ${error.message}`);
      }

      if (!data) {
        throw new Error('Screenshot data not available');
      }

      const arrayBuffer = await data.arrayBuffer();
      
      console.log('✅ THUMBNAIL SERVICE: SCREENSHOT LOADED', arrayBuffer.byteLength, 'bytes');

      return {
        data: arrayBuffer,
        contentType: 'image/jpeg',
        filename: filename
      };

    } catch (error) {
      console.error('THUMBNAIL SERVICE ERROR:', error);
      throw error;
    }
  }

  /**
   * GET PDF DOCUMENT BY DOCUMENT ID
   */
  async getPDFDocument(
    teamId: string,
    portfolioId: string,
    documentId: string
  ): Promise<PDFResult> {
    try {
      // GET DOCUMENT INFO FROM DATABASE
      const { data: document, error: docError } = await this.supabase
        .from('team_documents')
        .select('original_name, file_path')
        .eq('id', documentId)
        .eq('team_id', teamId)
        .eq('portfolio_id', portfolioId)
        .single();

      if (docError || !document) {
        throw new Error(`Document not found: ${docError?.message || 'Unknown error'}`);
      }

      console.log('🔍 THUMBNAIL SERVICE: FETCHING PDF');
      console.log('  📁 File path:', document.file_path);
      console.log('  📄 Document ID:', documentId);
      console.log('  📝 Original name:', document.original_name);

      const { data, error } = await this.supabase.storage
        .from('team-documents')
        .download(document.file_path);

      if (error) {
        console.error('❌ THUMBNAIL SERVICE: PDF NOT FOUND:', error);
        throw new Error(`PDF not found: ${error.message}`);
      }

      if (!data) {
        throw new Error('PDF data not available');
      }

      const arrayBuffer = await data.arrayBuffer();
      
      console.log('✅ THUMBNAIL SERVICE: PDF LOADED', arrayBuffer.byteLength, 'bytes');

      return {
        data: arrayBuffer,
        contentType: 'application/pdf',
        filename: document.original_name
      };

    } catch (error) {
      console.error('THUMBNAIL SERVICE ERROR:', error);
      throw error;
    }
  }

  /**
   * VERIFY USER HAS ACCESS TO TEAM/PORTFOLIO
   */
  async verifyUserAccess(userId: string, teamId: string): Promise<boolean> {
    try {
      const { data: teamMember, error } = await this.supabase
        .from('team_members')
        .select('role')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      return !error && !!teamMember;
    } catch (error) {
      console.error('THUMBNAIL SERVICE: ACCESS VERIFICATION ERROR:', error);
      return false;
    }
  }
}
