import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../utils/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { teamId, generalKnowledge } = await request.json();
    console.log('General knowledge update called for team:', teamId);
    console.log('General knowledge data:', JSON.stringify(generalKnowledge, null, 2));

    // Validate required fields
    if (!teamId || !generalKnowledge) {
      return NextResponse.json(
        { error: 'Team ID and general knowledge are required' },
        { status: 400 }
      );
    }

    // Verify user authentication
    const cookieStore = cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a manager of this team - USE SERVICE CLIENT TO AVOID RLS CIRCULAR REFERENCE
    const serviceClient = createServiceClient();
    const { data: teamMember, error: memberError } = await serviceClient
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (memberError || !teamMember || teamMember.role !== 'manager') {
      return NextResponse.json(
        { error: 'Manager access required' },
        { status: 403 }
      );
    }



    // Handle surgeon knowledge - UPDATE or INSERT each surgeon
    if (generalKnowledge.surgeons && generalKnowledge.surgeons.length > 0) {
      for (const surgeon of generalKnowledge.surgeons) {
        if (surgeon.name && surgeon.name.trim()) {
          // Check if this specific surgeon + procedure combination already exists
          const { data: existingSurgeon, error: checkError } = await supabase
            .from('team_knowledge')
            .select('id')
            .eq('team_id', teamId)
            .is('account_id', null)
            .is('portfolio_id', null)
            .eq('category', 'surgeon_info')
            .eq('title', surgeon.name.trim())
            .eq('metadata->>procedure_focus', surgeon.procedure_focus?.trim() || '')
            .single();

          const knowledgeData = {
            title: surgeon.name.trim(),
            content: `${surgeon.specialty?.trim() || ''} - ${surgeon.procedure_focus?.trim() || ''} - ${surgeon.notes?.trim() || ''}`,
            metadata: {
              name: surgeon.name.trim(),
              specialty: surgeon.specialty?.trim() || '',
              procedure_focus: surgeon.procedure_focus?.trim() || '',
              notes: surgeon.notes?.trim() || ''
            },
            updated_at: new Date().toISOString()
          };

          if (existingSurgeon && !checkError) {
            // UPDATE existing record
            const { error: surgeonError } = await supabase
              .from('team_knowledge')
              .update(knowledgeData)
              .eq('id', existingSurgeon.id);

            if (surgeonError) {
              console.error('Error updating surgeon knowledge:', surgeonError);
            }
          } else {
            // INSERT new record
            const { error: surgeonError } = await supabase
              .from('team_knowledge')
              .insert({
                team_id: teamId,
                account_id: null,
                portfolio_id: null,
                category: 'surgeon_info',
                ...knowledgeData
              });

            if (surgeonError) {
              console.error('Error creating surgeon knowledge:', surgeonError);
            }
          }
        }
      }
    }

    // Clean up orphaned entries only for surgeons being saved (not all surgeons)
    if (generalKnowledge.surgeons && generalKnowledge.surgeons.length > 0) {
      // Get list of surgeon names being saved in this request
      const surgeonsBeingSaved = new Set();
      generalKnowledge.surgeons.forEach((surgeon: any) => {
        if (surgeon.name?.trim()) {
          surgeonsBeingSaved.add(surgeon.name.trim());
        }
      });

      // Only clean up entries for surgeons being saved in this request
      for (const surgeonName of surgeonsBeingSaved) {
        // Get all existing entries for this specific surgeon
        const { data: existingEntries } = await supabase
          .from('team_knowledge')
          .select('id, metadata')
          .eq('team_id', teamId)
          .eq('category', 'surgeon_info')
          .eq('title', surgeonName)
          .is('account_id', null)
          .is('portfolio_id', null);

        if (existingEntries) {
          // Build list of procedure_focus values that should exist for this surgeon
          const shouldExist = new Set();
          generalKnowledge.surgeons.forEach((surgeon: any) => {
            if (surgeon.name?.trim() === surgeonName) {
              const procedureFocus = surgeon.procedure_focus?.trim() || '';
              shouldExist.add(procedureFocus);
            }
          });

          // Delete entries for this surgeon that shouldn't exist anymore
          for (const entry of existingEntries) {
            const procedureFocus = entry.metadata?.procedure_focus || '';
            if (!shouldExist.has(procedureFocus)) {
              await supabase
                .from('team_knowledge')
                .delete()
                .eq('id', entry.id);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'General knowledge updated successfully'
    });

  } catch (error) {
    console.error('Error updating general knowledge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 